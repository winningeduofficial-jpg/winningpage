-- =====================================================================
-- 55_goal_management.sql
-- 목표관리 서비스(/app/goal) 데이터 레이어 — 학생 마스터 · 일별 기록 ·
-- 확률 로그 · 대학 컷 기준표.
-- Supabase SQL Editor / Management API에서 수동 실행 필요.
-- (이 repo에 마이그레이션 러너 없음 — 00~52번과 동일하게 파일 전체를
--  붙여넣고 실행한다.)  idempotent — 여러 번 실행해도 안전.
--
-- 포함:
--   1) public.goal_students          학생 마스터(사용자당 1행)
--   2) public.goal_daily_records     일별 학습 기록 + 확률 증분
--   3) public.goal_probability_logs  확률 스냅샷(추이 차트용, append-only)
--   4) public.goal_university_cuts   목표 대학 컷 기준표(읽기 전용 참조)
--   5) public.goal_student_state     현재확률 뷰(base + Σdelta 재계산)
--   6) RLS — 4테이블 enable + 정책 8종 (클라이언트 write 정책 0건)
--   7) updated_at 트리거 3종 (공용 public.set_updated_at() 재사용)
--
-- 이 스키마는 **외부 원본 앱(/Users/hyunsoo/uwellnow/target)의 역산 산물**이다.
-- 각 컬럼의 원본 출처를 comment on column 으로 남겼다 — 원본 파일은
-- target/api/student.mjs (이하 주석에서 `student.mjs:줄`) 이고,
-- 계산 모듈은 이 repo 의 src/lib/goal/calc/*.js (203개 테스트로 동결) 다.
--
-- 배경 / 설계 결정 (docs/figma-goal/goal-schema-design.md, 2026-08-11):
--  - 원본은 학생을 `code` 문자열로 식별하고(student.mjs:2533
--    `.upsert(row, { onConflict: 'code' })`) 전 API가 무인증이라 code만 알면
--    타인 데이터를 읽고 썼다. 우리는 code를 완전히 폐기하고 auth.users(id)를
--    유일 식별자로 쓴다. 부수 효과로 원본 getStudent() 의
--    eq → ilike → limit(5000) 전건 스캔 3단 폴백(student.mjs:857-884)도 사라진다.
--  - 원본은 일별 확률 증분을 **브라우저에서** 계산해 서버가 그대로 저장했다
--    (target/App.tsx:1620-1631 → student.mjs:2662-2667). 우리는 delta_* 에
--    클라이언트 write 정책을 두지 않고, 서버(api/goal/daily-record.js)가
--    src/lib/goal/calc/bonus.js 의 calculateDailyBonus 를 호출해 계산한다.
--  - 현재확률은 저장하지 않는다. 원본이 clamp를 "합계"에 걸기 때문에
--    (student.mjs:1034-1037) 캐시 컬럼에 증분을 누적하면 결과가 달라진다.
--      base 95, delta +10, delta -10
--        재계산식  : clamp(95 + 10 - 10) = 95   ← 원본 동작
--        캐시 누적식: clamp(95+10)=100 → 90     ← 어긋남
--    base + Σdelta 재계산이 유일한 정본이며 뷰 (5)가 그 역할이다.
--  - 원본 컬럼 중 intake(jsonb, student.mjs:2519) / drive_url(:2522) /
--    parent_name·phone·email(:2523-2525) / sequence(:2669) / advice(:2671) /
--    major_tip(:2672) / calculated_bonus(:2662) / virtual_start_day_index(:2527)
--    은 읽는 코드가 0건이거나 파생값이라 이식하지 않았다.
--
-- 의존성:
--   - 00_base_schema.sql : public.is_winning_admin()(1338행),
--                          public.set_updated_at()(1432행)
--   - auth.users (profile_id FK)
--   - 43_admission_results.sql : goal_university_cuts 백필 소스
--                                (백필 자체는 이 파일 범위 밖)
--   위 셋만 있으면 다른 마이그레이션과 독립 실행 가능하다.
--   **api/goal/*.js 배포 전 반드시 선행 실행** — 테이블 없이 배포하면
--   온보딩 저장이 전량 실패한다.
--
-- 주의:
--   - admin 판정은 반드시 public.is_winning_admin()을 쓴다(is_admin() 아님).
--     profiles를 재참조하는 서브쿼리를 정책에 직접 쓰면 42P17 infinite
--     recursion으로 어드민 쓰기가 전부 막힌다(README 「RLS admin 판정」).
--   - `revoke ... from anon, authenticated` 는 걸지 않는다 — 테이블 권한이
--     RLS보다 먼저 평가돼 DB 레벨에서 동일한 authenticated 롤인 **어드민
--     조회까지** 막힌다(52번:23-28 / 46번이 기록한 컬럼 GRANT 기각 사유).
--   - `force row level security` 도 쓰지 않는다(README:29 — SECURITY DEFINER
--     함수가 RLS를 면제받는 조합을 force가 깨뜨린다).
--   - goal_university_cuts.avg_cut 은 cut_type 에 따라 **단위가 다르다.**
--     normal/special = 내신 등급(1~9, 작을수록 우세, primitives.js:123),
--     jungsi         = 정시 백분위(0~100, 클수록 우세, jeongsi.js).
--     섞이면 확률 계산의 우열 판정이 통째로 반전되므로 CHECK로 막는다.
--     원본에는 이 제약이 전혀 없었다.
-- =====================================================================


-- ---------------------------------------------------------------------
-- (1) 학생 마스터 — 사용자당 1행
--     원본 `student` 테이블(student.mjs:2482-2529 upsert row) 대응.
--     CHECK 제약은 create table 안에 인라인으로 둔다(43/52번 관례).
-- ---------------------------------------------------------------------
create table if not exists public.goal_students (
    -- profiles.id ≡ auth.users.id (00_base_schema.sql:1039-1040 profiles_id_fkey).
    -- 마이그레이션 10~52 전수에서 profiles FK는 0건, auth.users FK는 11건이라
    -- auth.users 를 참조한다. 컬럼 이름만 profile_id 로 둔다
    -- (api/_lib/serviceAccess.js:95 `.eq('profile_id', userId)` 관행).
    profile_id uuid primary key references auth.users(id) on delete cascade,

    -- ── 학적 ───────────────────────────────────────────────────────
    -- 값은 계산 모듈이 요구하는 한글 리터럴 그대로 저장한다.
    -- getSchoolCutType(src/lib/goal/calc/primitives.js:43-47)이 정확히
    -- '특목,자사,영재고' 또는 '특목고' 두 리터럴만 special 로 판정하므로
    -- 온보딩 코드값('general'/'special')을 여기 저장하면 안 된다.
    school_type text not null,   -- 일반고|특목고|특목,자사,영재고|중학교|초등학교
    grade       text not null,   -- 고1|고2|고3|중1~중3|초1~초6

    -- ── 목표 ───────────────────────────────────────────────────────
    ideal_university text not null default '',
    ideal_department text not null default '',
    min_university   text not null default '',
    min_department   text not null default '',

    -- 온보딩 시점의 컷 스냅샷. goal_university_cuts 가 나중에 갱신돼도
    -- 이미 산출된 base 확률과의 정합을 유지하려면 여기 박아둬야 한다.
    ideal_naesin_cut numeric(4,2),
    ideal_jungsi_cut numeric(5,2),
    min_naesin_cut   numeric(4,2),
    min_jungsi_cut   numeric(5,2),

    -- ── 성적 ───────────────────────────────────────────────────────
    -- current_score: 우리 온보딩(Step4Naesin.jsx:8-11 isValidGrade)은 1~9
    --   등급만 받는다. 원본은 이 컬럼에 등급/5등급제 원점수/0~100 평균점수
    --   3종이 섞였다(student.mjs:646-651 getConversionTypeForStudent 분기).
    current_score   numeric(4,1),
    -- converted_grade: applyPreHighGradePenalty(primitives.js:150-177) 결과.
    --   고1~고3은 penalty 0 + clamp(1,9) 라 사실상 항등이다.
    converted_grade numeric(6,4),
    -- current_mogo: calcJeongsiCompositeFE(jeongsi.js:195-212) 종합 백분위.
    --   영어 감점(최대 -16)이 더해지므로 **음수가 될 수 있다**.
    current_mogo    numeric(6,2),

    remain_naesin smallint not null default 0,   -- getRemainingNaesin (총 10회 기준)
    remain_mogo   smallint not null default 0,   -- getRemainingMogo   (총 14회 기준)
    last_naesin_exam text not null default '',   -- 회차 표 키(primitives.js:58-72)
    last_mogo_exam   text not null default '',   -- 회차 표 키(primitives.js:88-102)

    -- 시험 성적 원본(jsonb). 회차·과목 구성이 학교·학년마다 흔들리므로
    -- 정규화하지 않는다(계산 코드가 덩어리째 소비한다).
    naesin_scores    jsonb,   -- { "s1mid": { "value": "2.3", "none": false }, ... }
    mock_exam_scores jsonb,   -- { "mar": { "none": false, "kor": "2", ... }, ... }

    -- ── 확률 기준값(base) — 온보딩 시 1회 산출, 이후 불변 ───────────
    -- buildInitialStudentState(pipeline.js:225-228)의 반환값.
    -- 목표 대학 컷을 못 찾으면 null 이고 status = 'awaiting_cuts' 가 된다.
    base_ideal_susi   numeric(4,1),
    base_ideal_jungsi numeric(4,1),
    base_min_susi     numeric(4,1),
    base_min_jungsi   numeric(4,1),

    -- ── 일별 증분율(rate) — 온보딩 시 1회 산출, 이후 불변 ───────────
    -- calcStudentBonusRates(bonus.js:81-135). 원본은 이 4개를
    -- student.ideal_susi_bonus 로 불러 study_records 의 **같은 이름** 컬럼
    -- (= 그날 증분)과 혼동을 일으켰다. rate_* / delta_* 로 갈라 둔다.
    rate_ideal_susi   numeric(8,4),
    rate_ideal_jungsi numeric(8,4),
    rate_min_susi     numeric(8,4),
    rate_min_jungsi   numeric(8,4),

    -- ── 학습 목표 ──────────────────────────────────────────────────
    -- 요일 7키 고정. { "monday": { "ideal": 4.5, "min": 3.0 }, ... }
    study_schedule jsonb not null default '{}'::jsonb,
    -- sumWeeklySchedule(schedule.js:97-111) — 월~토만 합산(일요일 제외).
    week_ideal numeric(5,1) not null default 0,
    week_min   numeric(5,1) not null default 0,

    -- ── 상태 ───────────────────────────────────────────────────────
    -- 가상 날짜의 원점. 원본은 첫 기록 저장 시 채웠으나
    -- (student.mjs:2635-2644) 우리는 온보딩 시 확정한다 — rate 가 온보딩
    -- 시점 D-day 로 계산되므로(bonus.js:97-105) 원점도 같은 시점이어야
    -- 둘이 어긋나지 않는다.
    actual_start_date date,
    onboarded_at      timestamptz,
    status text not null default 'awaiting_cuts',

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint goal_students_status_check
        check (status in ('awaiting_cuts', 'active', 'paused')),
    constraint goal_students_school_type_check
        check (school_type in ('일반고', '특목고', '특목,자사,영재고', '중학교', '초등학교')),
    constraint goal_students_study_schedule_check
        check (jsonb_typeof(study_schedule) = 'object')
);

-- 이미 이 파일을 실행한 DB에 컬럼을 나중에 늘릴 때만 여기에 추가한다
-- (create table if not exists 는 컬럼을 추가하지 않는다):
-- alter table public.goal_students add column if not exists <col> <type>;

comment on table public.goal_students is
    '목표관리 학생 마스터(사용자당 1행). 원본 target/api/student.mjs 의 student 테이블 대응(upsert row: student.mjs:2482-2529). 쓰기는 service_role(api/goal/*.js)만, 읽기는 본인과 어드민. sql/55_goal_management.sql 참고.';

comment on column public.goal_students.profile_id is
    'auth.users.id. 원본 student.code(text UNIQUE, student.mjs:2483·2533 onConflict)와 student.main_id 를 둘 다 대체한다. code 는 무인증 IDOR 의 근원이라 폐기했고, main_id 는 auth.getUser(token).user.id 로 매번 얻는다(api/check-service-access.js:52).';
comment on column public.goal_students.school_type is
    '학교 유형 한글 리터럴. 원본 student.school_type(student.mjs:2486). getSchoolCutType(primitives.js:43-47)이 "특목,자사,영재고"/"특목고" 두 리터럴만 special 로 판정하므로 온보딩 코드값(general/special)을 저장하면 안 된다.';
comment on column public.goal_students.grade is
    '학년 한글 리터럴(고1/고2/고3 등). 원본 student.grade(student.mjs:2487). calcStudentBonusRates 의 학년 오프셋 사슬이 "고1"/"고2" 리터럴 비교다(bonus.js:112-122).';
comment on column public.goal_students.ideal_university is
    '이상 목표 대학명. 원본 student.ideal_univ(student.mjs:2489). 원본은 이 값의 공백 여부로 온보딩 완료를 판정했으나(student.mjs:1959-1962) 우리는 onboarded_at 을 쓴다.';
comment on column public.goal_students.ideal_department is
    '이상 목표 학과명. 원본 student.ideal_dept(student.mjs:2490). getStudyMultiplier 입력이자 goal_university_cuts 조회 키.';
comment on column public.goal_students.min_university is
    '최소 목표 대학명. 원본 student.min_univ(student.mjs:2494).';
comment on column public.goal_students.min_department is
    '최소 목표 학과명. 원본 student.min_dept(student.mjs:2495).';
comment on column public.goal_students.ideal_naesin_cut is
    '이상 목표 수시 내신 컷(등급 1~9, 작을수록 우세). 원본 student.ideal_naesin_cut(student.mjs:2499), 출처는 getUnivCut(schoolCutType, ...)(student.mjs:984-998, 호출 2442). 온보딩 시점 스냅샷이라 goal_university_cuts 가 갱신돼도 따라 바뀌지 않는다.';
comment on column public.goal_students.ideal_jungsi_cut is
    '이상 목표 정시 백분위 컷(0~100, 클수록 우세). 원본 student.ideal_jungsi_cut(student.mjs:2500), 출처는 getUnivCut("jungsi", ...)(student.mjs:2443).';
comment on column public.goal_students.min_naesin_cut is
    '최소 목표 수시 내신 컷. 원본 student.min_naesin_cut(student.mjs:2501, 호출 2444).';
comment on column public.goal_students.min_jungsi_cut is
    '최소 목표 정시 백분위 컷. 원본 student.min_jungsi_cut(student.mjs:2502, 호출 2445).';
comment on column public.goal_students.current_score is
    '내신 평균 등급 1~9. 원본 student.current_score(student.mjs:2504)에는 등급/5등급제 원점수/0~100 평균점수 3종이 섞였으나(student.mjs:646-651) 우리 온보딩 Step4Naesin.jsx:8-11 은 등급만 받는다. 이 단일 스케일 덕에 grade_conversions 변환표 없이 convertedGrade = currentScore 주입으로 고1~고3 전 학년이 동작한다.';
comment on column public.goal_students.converted_grade is
    '환산 등급. 원본 student.converted_grade(student.mjs:2506). applyPreHighGradePenalty(primitives.js:150-177) 결과이며 고교생에겐 clamp(1,9) 항등이다.';
comment on column public.goal_students.current_mogo is
    '모의고사 종합 백분위. 원본 student.current_mogo(student.mjs:2505). calcJeongsiCompositeFE(jeongsi.js:195-212) 결과이며 영어 감점(최대 -16) 때문에 음수가 될 수 있다. 0 이하이면 정시 확률 2종이 0 이 된다(pipeline.js:226-228) — 이 상태와 "정시 컷 데이터 없음"은 jungsiAvailable 플래그로만 구분된다.';
comment on column public.goal_students.remain_naesin is
    '남은 내신 시험 회차 수(총 10회 기준). getRemainingNaesin(primitives.js:58-72) 파생값.';
comment on column public.goal_students.remain_mogo is
    '남은 모의고사 회차 수(총 14회 기준). getRemainingMogo(primitives.js:88-102) 파생값. ⚠ 우리 온보딩 MOCK_EXAM_ROUNDS 는 3/6/9/10월 4회차뿐이라 고3 전용 "5모"/"7모"를 고를 수 없고, 그만큼 고3 remain_mogo 가 최대 2 크게 나와 확률이 낙관 편향된다(미결 Q9).';
comment on column public.goal_students.last_naesin_exam is
    '마지막으로 응시한 내신 회차 라벨("1학기 중간" 등). getRemainingNaesin 표 키(primitives.js:58-72)와 정확히 일치해야 한다.';
comment on column public.goal_students.last_mogo_exam is
    '마지막으로 응시한 모의고사 회차 라벨("3모"/"6모"/"9모"/"10모"). getRemainingMogo 표 키(primitives.js:88-102).';
comment on column public.goal_students.naesin_scores is
    '내신 성적 입력 원본(jsonb). 원본 student.naesin_subject_scores(student.mjs:2516). 회차·과목 구성이 흔들려 정규화하지 않는다.';
comment on column public.goal_students.mock_exam_scores is
    '모의고사 성적 입력 원본(jsonb). 원본 student.jungsi_subject_scores(student.mjs:2517). ⚠ 서버가 currentMogo 로 환산할 때 none=true 회차는 객체에서 제외해야 한다 — 포함하면 평균 0 이 3분할에 들어가 종합 백분위가 크게 낮아진다(jeongsi.js:207-209).';
comment on column public.goal_students.base_ideal_susi is
    '온보딩 시 1회 산출된 기준확률(이상 목표 수시). 원본 student.ideal_susi(student.mjs:2491). 이후 절대 갱신하지 않는다 — 현재확률은 base + Σdelta 로 매번 재계산한다(뷰 public.goal_student_state). null 이면 목표 대학 컷 미확보(status=awaiting_cuts)이며 "확률 0%"가 아니라 "미산출"이다.';
comment on column public.goal_students.base_ideal_jungsi is
    '온보딩 기준확률(이상 목표 정시). 원본 student.ideal_jungsi(student.mjs:2492).';
comment on column public.goal_students.base_min_susi is
    '온보딩 기준확률(최소 목표 수시). 원본 student.min_susi(student.mjs:2496).';
comment on column public.goal_students.base_min_jungsi is
    '온보딩 기준확률(최소 목표 정시). 원본 student.min_jungsi(student.mjs:2497).';
comment on column public.goal_students.rate_ideal_susi is
    '하루 최대 증분율(%/일) = (100 - base) / D-day. calcStudentBonusRates(bonus.js:81-135)가 온보딩 시 1회 계산한다. 원본 student.ideal_susi_bonus(student.mjs:2508) — 원본은 study_records.ideal_susi_bonus(그날 증분, student.mjs:2664)와 이름이 같아 혼동을 일으켰다. 여기서는 rate_* / delta_* 로 갈랐다.';
comment on column public.goal_students.rate_ideal_jungsi is
    '하루 최대 증분율(이상 목표 정시). 원본 student.ideal_jungsi_bonus(student.mjs:2509).';
comment on column public.goal_students.rate_min_susi is
    '하루 최대 증분율(최소 목표 수시). 원본 student.min_susi_bonus(student.mjs:2510).';
comment on column public.goal_students.rate_min_jungsi is
    '하루 최대 증분율(최소 목표 정시). 원본 student.min_jungsi_bonus(student.mjs:2511).';
comment on column public.goal_students.study_schedule is
    '요일별 학습 목표 시간(jsonb, 요일 7키). 원본 student.study_schedule(student.mjs:2520). sumWeeklySchedule(schedule.js:97-111)과 applyDailyRecord(pipeline.js)가 객체를 통째로 읽으므로 자식 테이블로 쪼개지 않는다. 우리는 calculateWeekSchedule 대신 calcAvailableHoursApprox + getStudyMultiplier 로 서버가 완성해 넣는다(온보딩이 요일별 시각이 아니라 공통 스테퍼 4개만 받기 때문).';
comment on column public.goal_students.week_ideal is
    '주간 이상 목표 시간 합계(월~토, 일요일 제외). 원본 student.week_ideal(student.mjs:2513). sumWeeklySchedule(schedule.js:97-111) 파생값이지만 대시보드가 직접 표시·정렬하므로 정규 컬럼으로 둔다.';
comment on column public.goal_students.week_min is
    '주간 최소 목표 시간 합계(월~토). 원본 student.week_min(student.mjs:2514).';
comment on column public.goal_students.actual_start_date is
    '가상 날짜의 원점(KST). 원본 student.actual_start_date 는 첫 기록 저장 시 채웠으나(student.mjs:2635-2644) 우리는 온보딩 시 확정한다 — rate 가 온보딩 시점 D-day 기준이라(bonus.js:97-105) 원점도 같은 시점이어야 어긋나지 않는다. record_date = getRecordDateFromActualStart(이 값, record_index)(virtualDate.js:54-66).';
comment on column public.goal_students.onboarded_at is
    '온보딩 완료 시각. null 이면 미완료. 원본은 ideal_univ 공백 여부로 판정했고(student.mjs:1959-1962) intake jsonb 컬럼(student.mjs:2519)을 따로 저장했는데, 전자는 목표 대학명이 비는 경우와 구분되지 않고 후자는 응답의 master.intake(boolean, student.mjs:2303)와 타입이 달라 함정이었다. 둘 다 이 컬럼으로 대체했다.';
comment on column public.goal_students.status is
    'awaiting_cuts = 목표 대학 컷을 찾지 못해 base_* 가 아직 null. active = 정상. paused = 운영 보류. 원본에 없는 신설 컬럼 — calcNaesinProb 이 컷 누락을 확률 0 으로 접기 때문에(primitives.js:119) 파이프라인만으로는 0%와 미산출을 구분할 수 없다.';
comment on column public.goal_students.created_at is
    '행 생성 시각. 원본 student 테이블에 대응 컬럼이 없다(원본은 upsert 만 하고 생성 시각을 남기지 않았다).';
comment on column public.goal_students.updated_at is
    '마지막 갱신 시각. 트리거 trg_goal_students_updated_at 이 공용 public.set_updated_at()(00_base_schema.sql:1432)으로 채운다.';

create index if not exists goal_students_status_idx
    on public.goal_students (status);
create index if not exists goal_students_onboarded_idx
    on public.goal_students (onboarded_at desc)
    where onboarded_at is not null;
create index if not exists goal_students_created_at_idx
    on public.goal_students (created_at desc);


-- ---------------------------------------------------------------------
-- (2) 일별 학습 기록 + 확률 증분
--     원본 `study_records` 테이블(student.mjs:2649-2673 upsert row) 대응.
--
--     가상 날짜 규약(원본 그대로 유지):
--       record_index = 기존 행 수(0-base, 단조 증가)          ← 정본
--       record_date  = actual_start_date + record_index 일    ← 파생
--       "제출 N번 = N일차"가 실제 규칙이라 실제 달력과 무제한 어긋난다
--       (getRecordDateFromActualStart, src/lib/goal/calc/virtualDate.js:54-66).
--       주차 산정("일요일 기록 수 = 주차", student.mjs:841)이 이 규약에
--       동결돼 있어 하루 1건 UNIQUE 를 걸지 않는다.
--     원본은 record_index 대신 date 를 upsert 충돌키로 썼고
--     (student.mjs:2677 onConflict:'code,date') 덮어쓰기가 발생하면 count
--     기반으로 계산되는 다음 제출의 date 가 어긋나는 구조적 결함이 있었다.
--     우리는 record_index 를 정본 충돌키로 삼는다.
-- ---------------------------------------------------------------------
create table if not exists public.goal_daily_records (
    id bigint generated by default as identity primary key,
    profile_id uuid not null references public.goal_students(profile_id) on delete cascade,

    record_index integer not null,   -- 0-base 단조 증가. 원본 sequence(1-base, student.mjs:2669) 대체
    record_date  date    not null,   -- 가상 날짜. 원본 study_records.date(student.mjs:2651)
    -- record_date 의 요일(월=0 … 일=6). 원본은 virtual_day_index 를 직접
    -- 저장해(student.mjs:2670) record_date 와 어긋날 수 있었다. generated 로
    -- DB가 보장한다. extract(isodow) 는 월=1…일=7 이라 1을 뺀다
    -- (getDayIndexFromYMDServer, virtualDate.js:72-78 규약과 동일).
    virtual_day_index smallint generated always as
        ((extract(isodow from record_date))::int - 1) stored,
    -- 실제 제출일(KST). 원본에 없는 신설 감사 컬럼 — 가상 날짜와 실제 날짜의
    -- 괴리를 사후 진단한다. 계산에는 쓰이지 않는다.
    submitted_on date not null,

    -- ── 제출 내용 ──────────────────────────────────────────────────
    study_hours numeric(4,1) not null default 0,   -- 원본 study_records.study_hours(student.mjs:2652)
    -- 0시간 제출은 폼이 성취도·집중도 항목을 감추므로 '' 로 저장된다
    -- (target/App.tsx:2697, :2711 → student.mjs:2654-2655).
    -- CHECK 목록에 **빈 문자열을 포함**해야 기존 동작이 깨지지 않는다.
    achievement    text not null default '',   -- ''|full|high|mid|low|none
    focus          text not null default '',   -- ''|excellent|good|normal|low|veryLow
    body_condition text not null default '',   -- ''|good|normal|bad
    reasons text[] not null default '{}',      -- 원본 study_records.reasons(student.mjs:2658)
    tasks   text[] not null default '{}',      -- 원본 study_records.tasks(student.mjs:2659)
    memo    text not null default '',          -- 원본 study_records.memo(student.mjs:2660)

    -- 그날 적용된 목표 시간. 원본에 없다 — study_schedule 이 나중에 바뀌어도
    -- 그날 증분이 어떤 목표로 산출됐는지 재현 가능해야 하므로 스냅샷을 남긴다.
    target_ideal_hours numeric(4,1) not null default 0,
    target_min_hours   numeric(4,1) not null default 0,

    -- ── 확률 증분(delta) — 서버가 calculateDailyBonus 로 계산 ────────
    -- 클라이언트는 이 컬럼에 쓸 수 없다(RLS insert/update 정책 미부여).
    -- 0시간 제출이면 -rate 전액(음수)이 들어간다(bonus.js:208-218).
    delta_ideal_susi   numeric(8,4) not null default 0,
    delta_ideal_jungsi numeric(8,4) not null default 0,
    delta_min_susi     numeric(8,4) not null default 0,
    delta_min_jungsi   numeric(8,4) not null default 0,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint goal_daily_records_record_index_check
        check (record_index >= 0),
    constraint goal_daily_records_study_hours_check
        check (study_hours >= 0),
    constraint goal_daily_records_achievement_check
        check (achievement in ('', 'full', 'high', 'mid', 'low', 'none')),
    constraint goal_daily_records_focus_check
        check (focus in ('', 'excellent', 'good', 'normal', 'low', 'veryLow')),
    constraint goal_daily_records_body_condition_check
        check (body_condition in ('', 'good', 'normal', 'bad'))
);

comment on table public.goal_daily_records is
    '목표관리 일별 학습 기록 + 확률 증분. 원본 target/api/student.mjs 의 study_records 테이블 대응(upsert row: student.mjs:2649-2673). record_date 는 실제 날짜가 아니라 가상 날짜(actual_start_date + record_index)다. 쓰기는 service_role(api/goal/daily-record.js)만. sql/55_goal_management.sql 참고.';

comment on column public.goal_daily_records.id is
    '대리 키. 원본 study_records 에는 없었다(원본 물리 키는 (code, date)) — goal_probability_logs.source_record_id 가 참조할 안정적인 대상이 필요해 신설했다. 논리 식별자는 (profile_id, record_index) 다.';
comment on column public.goal_daily_records.profile_id is
    'goal_students.profile_id. 원본은 study_records.code 로 조인했다(student.mjs:2650).';
comment on column public.goal_daily_records.record_index is
    '0-base 단조 증가 제출 순번. 가상 날짜의 정본이며 upsert 충돌키다. 원본 study_records.sequence(1-base, student.mjs:2669)는 write-only 였고 실제 충돌키는 date 였다(student.mjs:2677 onConflict:"code,date") — 덮어쓰기 시 count 기반 다음 date 가 어긋나는 결함이라 순번을 정본으로 승격했다.';
comment on column public.goal_daily_records.record_date is
    '가상 날짜 = getRecordDateFromActualStart(goal_students.actual_start_date, record_index)(virtualDate.js:54-66). 원본 study_records.date(student.mjs:2651·2632). 실제 달력과 어긋나는 것이 정상이다.';
comment on column public.goal_daily_records.virtual_day_index is
    '가상 날짜의 요일(월=0 … 일=6). record_date 의 순함수라 generated column 으로 둔다 — 원본은 직접 저장해(student.mjs:2670) 갱신 누락 시 조용히 어긋날 수 있었다. getDayIndexFromYMDServer(virtualDate.js:72-78) 규약과 동일하다.';
comment on column public.goal_daily_records.submitted_on is
    '실제 제출일(KST). 원본에 없는 신설 감사 컬럼. 가상 날짜(record_date)와의 괴리 진단용이며 계산에는 쓰이지 않는다. 하루 1건 UNIQUE 는 걸지 않는다 — 원본 규약("제출 N번 = N일차")에 주차 산정이 동결돼 있다(student.mjs:841).';
comment on column public.goal_daily_records.study_hours is
    '그날 순공부 시간. 원본 study_records.study_hours(student.mjs:2652). calculateDailyBonus(bonus.js:174-260)의 주 입력이다.';
comment on column public.goal_daily_records.achievement is
    '성취도. 원본 study_records.achievement(student.mjs:2654). ACHIEVEMENT_MULTIPLIER(bonus.js:26-34)의 키라 오탈자 하나가 achMult ?? 0(bonus.js:221)으로 조용히 증분 0을 만든다 → CHECK 를 건다. 단 0시간 제출은 폼이 항목을 감춰 빈 문자열로 저장되므로(App.tsx:2697) 목록에 빈 문자열을 포함한다.';
comment on column public.goal_daily_records.focus is
    '집중도. 원본 study_records.focus(student.mjs:2655). FOCUS_MULTIPLIER(bonus.js:36-42)의 키. 빈 문자열 포함 사유는 achievement 와 동일(App.tsx:2711).';
comment on column public.goal_daily_records.body_condition is
    '컨디션. 원본 study_records.condition(student.mjs:2656)을 개명했다 — Postgres 비예약어라 동작은 하지만 SQL 키워드와 시각적으로 충돌한다. 계산 파이프라인은 이 값을 쓰지 않는다(표시 전용).';
comment on column public.goal_daily_records.reasons is
    '학습 방해 요인 다중선택. 원본 study_records.reasons(student.mjs:2658). CHECK 를 걸지 않는다 — 화면에 그대로 뜨는 편집 가능한 카피라 45_faq_renewal.sql 의 카테고리 CHECK 기각 논리와 같다. 입력 통제는 서버 화이트리스트 상수가 맡는다(api/create-consult-request.js:18-26 관례).';
comment on column public.goal_daily_records.tasks is
    '학습 항목 다중선택. 원본 study_records.tasks(student.mjs:2659). CHECK 미부여 사유는 reasons 와 동일하나, 이쪽은 calculateDailyBonus 의 다양성 가산 입력이기도 하다(bonus.js).';
comment on column public.goal_daily_records.memo is
    '자유 메모. 원본 study_records.memo(student.mjs:2660).';
comment on column public.goal_daily_records.target_ideal_hours is
    '그날 적용된 이상 목표 시간. 원본에 없는 신설 컬럼 — study_schedule 이 나중에 바뀌어도 그날 증분의 산출 근거를 재현할 수 있어야 한다. ⚠ 일요일 보충 목표 로직(원본 getSundayRemainingScheduleFromRecords)은 미이식이라 study_schedule.sunday 값을 그대로 넣는다(미결 Q4).';
comment on column public.goal_daily_records.target_min_hours is
    '그날 적용된 최소 목표 시간. 신설 컬럼, 사유는 target_ideal_hours 와 동일.';
comment on column public.goal_daily_records.delta_ideal_susi is
    '그날 획득한 이상 목표 수시 확률 증분(%). 원본 study_records.ideal_susi_bonus(student.mjs:2664). 원본은 브라우저가 계산한 값을 그대로 저장했으나(App.tsx:1620-1631) 우리는 서버가 calculateDailyBonus(bonus.js:174-260)로 계산한다 — 이 테이블에 클라이언트 write 정책이 없는 이유가 이 컬럼이다. 0시간 제출 시 음수.';
comment on column public.goal_daily_records.delta_ideal_jungsi is
    '이상 목표 정시 확률 증분. 원본 study_records.ideal_jungsi_bonus(student.mjs:2665).';
comment on column public.goal_daily_records.delta_min_susi is
    '최소 목표 수시 확률 증분. 원본 study_records.min_susi_bonus(student.mjs:2666).';
comment on column public.goal_daily_records.delta_min_jungsi is
    '최소 목표 정시 확률 증분. 원본 study_records.min_jungsi_bonus(student.mjs:2667). 원본의 calculated_bonus(student.mjs:2662)와 응답 별칭 susi_bonus/jungsi_bonus 는 idealSusiBonus 와 항상 같은 값이라(bonus.js:249) 이식하지 않았다.';
comment on column public.goal_daily_records.created_at is
    '행 생성 시각(실제 시각). 대시보드·차트 조회 인덱스의 정렬 키다 — 가상 날짜 record_date 와 혼동하지 마라.';
comment on column public.goal_daily_records.updated_at is
    '마지막 갱신 시각. 트리거 trg_goal_daily_records_updated_at 이 채운다. 같은 record_index 로 재제출(upsert)하면 갱신된다.';

-- 유일성: record_index 가 정본 충돌키다(upsert 대상).
create unique index if not exists goal_daily_records_index_key
    on public.goal_daily_records (profile_id, record_index);
-- 안전망: record_date 는 record_index 의 순함수라 위 제약과 논리적으로
-- 중복이지만, actual_start_date 가 사후 수정되는 사고를 DB 레벨에서 잡는다.
create unique index if not exists goal_daily_records_date_key
    on public.goal_daily_records (profile_id, record_date);
-- 조회: 대시보드·차트가 전부 (profile_id, created_at) 조합을 쓴다.
-- 원본 어드민은 WHERE 없이 전건 로드 후 메모리 필터였다(student.mjs:460-500).
create index if not exists goal_daily_records_profile_created_idx
    on public.goal_daily_records (profile_id, created_at desc);
-- 주차/월차 산정: 일요일(virtual_day_index = 6) 기록 수를 센다
-- (countSundayRecords, student.mjs:841).
create index if not exists goal_daily_records_sunday_idx
    on public.goal_daily_records (profile_id, record_date)
    where virtual_day_index = 6;


-- ---------------------------------------------------------------------
-- (3) 확률 스냅샷 로그 — append-only, 추이 차트용
--     원본 `student_logs` 테이블(insert: student.mjs:1031-1038) 대응.
--     원본은 쓰기 액션마다 값 변동 여부와 무관하게 무조건 1행을 쌓았다
--     (호출 3곳: student.mjs:2601 saveStudentInfo / :2699 saveStudy /
--      :3079 updateStudentScore — 값 비교 코드가 없다).
--     우리는 직전 행과 4값이 전부 같으면 서버가 skip 한다 — 차트의 수평
--     중복점과 무의미한 행 증가를 막는다.
--     append-only 라 updated_at 과 트리거가 없다.
-- ---------------------------------------------------------------------
create table if not exists public.goal_probability_logs (
    id bigint generated by default as identity primary key,
    profile_id uuid not null references public.goal_students(profile_id) on delete cascade,

    -- ⚠ 정밀도는 base_*(numeric(4,1))가 아니라 **현재확률**을 따라야 한다.
    --   현재확률 = clamp(0, 100, base + Σdelta) 이고 이 클램프는 round 를 거치지
    --   않는 순수 min/max 다(pipeline.js:341-342 및 아래 뷰 (5) 둘 다 round 없음).
    --   base 는 소수 1자리(clampProb → round1, primitives.js:25-37)지만
    --   delta 는 소수 4자리(round4Client, bonus.js:65)라 **합은 소수 4자리**다.
    --   numeric(4,1) 로 두면 저장 시 조용히 반올림돼 두 가지가 깨진다.
    --     ① 같은 화면의 게이지(뷰, 63.1234)와 차트(이 표, 63.1)가 어긋난다.
    --     ② appendProbabilityLog 의 중복 스킵(goalRepo.js:226-234
    --        `num(previous.ideal_susi) === probs.idealSusi`)이 항상 false 가 되어
    --        값이 실제로 바뀌지 않은 재저장에도 행이 쌓인다 — 이 표의 존재 이유인
    --        §8 #15(원본 대비 개선점, 위 헤더 398-402)가 통째로 무효가 된다.
    --   numeric(8,4) 는 base(1자리) + Σdelta(4자리)를 손실 없이 담는 최소 정밀도다
    --   (값역은 0~100 이라 정수부 4자리로 충분하다).
    -- ideal_jungsi/min_jungsi 는 not null 이 아니다 — 정시 컷 없이도
    -- 온보딩을 허용하기로 확정(Q1=(b), sql/56_goal_jungsi_optional.sql
    -- 참고)하면서 이 두 컬럼에 null 을 저장하는 경로가 생겼다. 이미
    -- 만들어진 테이블은 create table if not exists 가 건드리지 않으므로
    -- sql/56 이 alter table 로 별도 해제한다 — 이 본문은 향후 최초
    -- 생성(신규 환경) 시에도 sql/56 과 어긋나지 않도록 맞춰 둔 것이다.
    -- ideal_susi/min_susi 는 그대로 not null 이다 — 수시 컷은 여전히
    -- 온보딩 필수 조건이다.
    ideal_susi   numeric(8,4) not null,
    ideal_jungsi numeric(8,4),
    min_susi     numeric(8,4) not null,
    min_jungsi   numeric(8,4),

    reason text not null,   -- intake|daily_record|score_update
    source_record_id bigint references public.goal_daily_records(id) on delete set null,

    created_at timestamptz not null default now(),

    constraint goal_probability_logs_reason_check
        check (reason in ('intake', 'daily_record', 'score_update'))
);

-- `create table if not exists` 는 기존 테이블의 컬럼 타입을 바꾸지 않는다.
-- 이 파일의 이전 판(numeric(4,1))으로 이미 테이블을 만든 DB 를 정본으로 수렴시킨다.
-- 이미 numeric(8,4) 면 아무 일도 하지 않는다(동일 타입 재지정은 rewrite 없음).
-- append-only 표라 값이 들어간 뒤 확장하는 방향(4,1 → 8,4)은 무손실이지만,
-- 이미 저장된 행의 잘린 소수점은 복구되지 않는다.
alter table public.goal_probability_logs
    alter column ideal_susi   type numeric(8,4),
    alter column ideal_jungsi type numeric(8,4),
    alter column min_susi     type numeric(8,4),
    alter column min_jungsi   type numeric(8,4);

comment on table public.goal_probability_logs is
    '확률 추이 차트용 append-only 스냅샷. 원본 target/api/student.mjs 의 student_logs 테이블 대응(insert: student.mjs:1031-1038). 원본 이름은 무엇을 담는지 알 수 없어 개명했다 — 실제 내용은 확률 4종뿐이다. 원본과 달리 값이 실제로 바뀐 경우에만 기록한다. sql/55_goal_management.sql 참고.';

comment on column public.goal_probability_logs.id is
    '대리 키. append-only 라 정렬·페이지네이션 보조로만 쓴다.';
comment on column public.goal_probability_logs.profile_id is
    'goal_students.profile_id. 원본은 student_logs.code 로 조인했다(student.mjs:1033).';
comment on column public.goal_probability_logs.ideal_susi is
    '스냅샷 시점의 이상 목표 수시 현재확률(%). 원본 student_logs.ideal_susi(student.mjs:1034) — 원본도 여기서 min(100,max(0, base + Σbonus)) 로 **합계에 클램프**를 건다. 이 파일이 현재확률을 캐시 컬럼으로 두지 않는 근거다.';
comment on column public.goal_probability_logs.ideal_jungsi is
    '이상 목표 정시 현재확률. 원본 student_logs.ideal_jungsi(student.mjs:1035).';
comment on column public.goal_probability_logs.min_susi is
    '최소 목표 수시 현재확률. 원본 student_logs.min_susi(student.mjs:1036).';
comment on column public.goal_probability_logs.min_jungsi is
    '최소 목표 정시 현재확률. 원본 student_logs.min_jungsi(student.mjs:1037).';
comment on column public.goal_probability_logs.reason is
    '스냅샷을 만든 원인. 원본에 없는 신설 컬럼 — 원본은 호출 지점 3곳(student.mjs:2601 온보딩·:2699 일별기록·:3079 성적수정)을 사후에 구분할 방법이 없었다.';
comment on column public.goal_probability_logs.source_record_id is
    '이 스냅샷을 만든 goal_daily_records 행. reason 이 daily_record 가 아니면 null. 신설 컬럼.';
comment on column public.goal_probability_logs.created_at is
    '스냅샷 시각 = 확률 추이 차트의 x축. append-only 테이블이라 updated_at 은 두지 않는다.';

create index if not exists goal_probability_logs_profile_created_idx
    on public.goal_probability_logs (profile_id, created_at);


-- ---------------------------------------------------------------------
-- (4) 목표 대학 컷 기준표 — 읽기 전용 참조 테이블
--     원본 `universities` 테이블(조회: getUnivCut, student.mjs:984-998 /
--     목록: student.mjs:2100-2106) 대응. 이름을 바꾼 이유는 두 가지다 —
--     ① public.admission_universities(38번)·admission_results.university_key
--        (43번)와 충돌한다
--     ② 실제 내용이 "대학 목록"이 아니라 "컷 기준표"라 원본 이름이 틀렸다.
--
--     ⚠ avg_cut 의 단위가 cut_type 에 따라 다르다:
--        normal/special = 내신 등급 1~9   (작을수록 우세, primitives.js:123)
--        jungsi         = 정시 백분위 0~100 (클수록 우세)
--     같은 (대학, 학과)가 세 행으로 존재하며 세 행의 스케일이 서로 다르다.
--     섞이면 calcNaesinProb/calcJeongsiProb 의 우열 판정이 통째로 반전되므로
--     CHECK로 원천 차단한다. 원본에는 제약이 전혀 없었다.
--
--     데이터 백필은 이 파일 범위 밖이다. 수시 내신 컷은 dev DB
--     admission_results(수시 434행 / 12개 대학 / 24개 학과)에서 유도 가능하나
--     grade_50/70/85/90 중 무엇을 컷으로 쓸지 미정이고(43번:71-74),
--     정시 백분위 컷은 데이터가 전무하다(미결 Q11).
--     빈 테이블 계약: GET /api/goal/universities 는 200 {universities:[]} 를
--     준다(에러 아님).
-- ---------------------------------------------------------------------
create table if not exists public.goal_university_cuts (
    id bigint generated by default as identity primary key,

    cut_type text not null,   -- normal|special|jungsi

    university_key  text not null,
    university_name text not null,
    -- 원본 조회가 `.eq('department', department || '')` 라(student.mjs:993)
    -- 널이 아니라 빈 문자열이어야 대학 단위 컷이 매칭된다.
    department_key  text not null default '',
    department_name text not null default '',

    avg_cut numeric(6,2),

    source      text,       -- admission_results|manual
    source_year smallint,   -- 유도에 쓴 입결 연도

    is_active boolean not null default true,
    note text,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint goal_university_cuts_cut_type_check
        check (cut_type in ('normal', 'special', 'jungsi')),
    -- 스케일 혼입 방지 — 이 파일에서 가장 중요한 제약이다.
    constraint goal_university_cuts_avg_cut_check
        check (
            avg_cut is null
            or (cut_type in ('normal', 'special') and avg_cut between 1 and 9)
            or (cut_type = 'jungsi' and avg_cut between 0 and 100)
        )
);

comment on table public.goal_university_cuts is
    '목표관리 확률 계산용 대학·학과 컷 기준표. 원본 target/api/student.mjs 의 universities 테이블 대응(getUnivCut: student.mjs:984-998). avg_cut 단위가 cut_type 에 따라 다르다(normal/special=내신등급 1~9, jungsi=정시백분위 0~100). sql/55_goal_management.sql 참고.';

comment on column public.goal_university_cuts.id is
    '대리 키. 논리 식별자는 (cut_type, university_key, department_key) 이고 UNIQUE 인덱스 goal_university_cuts_key 가 지킨다. 단 **실제 조회 경로는 표시명 3튜플**(goalRepo.js:146-151)이라 유일성의 실질 방어선은 goal_university_cuts_name_key(cut_type, university_name, department_name) where is_active 다 — 이게 없으면 표시명 중복 2행이 합법이 되어 maybeSingle 이 PGRST116 을 던지고 온보딩이 500 으로 죽는다.';
comment on column public.goal_university_cuts.cut_type is
    '컷 종류. 원본 universities.school_type(student.mjs:991·2103 `.eq("school_type", schoolType)`)을 개명한 것이다 — 값이 normal/special/jungsi 라 학교 유형이 아니라 컷 종류이고, goal_students.school_type(한글 리터럴)과 이름이 겹치면 혼동한다. normal/special 판정은 getSchoolCutType(primitives.js:43-47), jungsi 는 호출부가 리터럴로 넘긴다(student.mjs:2443·2445).';
comment on column public.goal_university_cuts.university_key is
    '대학 조회 키. 원본 universities.university(student.mjs:992 `.eq("university", university)`)에 대응하며, 우리는 표시명과 조회키를 분리했다. ⚠ 현재 API 는 이 컬럼을 읽지 않는다 — 온보딩 계약이 표시명만 보내기 때문이다(intake.js:147-148 validateTarget → goalRepo.js:148). 키 기준 조회로 전환하려면 온보딩 요청 계약부터 바꿔야 한다. 그때까지 조회 유일성은 goal_university_cuts_name_key 가 책임진다.';
comment on column public.goal_university_cuts.university_name is
    '대학 표시명(온보딩 자동완성 노출값). **실제 컷 조회 키**다(goalRepo.js:148). goal_university_cuts_name_key 로 활성 행 유일성을 보장한다.';
comment on column public.goal_university_cuts.department_key is
    '학과 조회 키. 대학 단위 컷은 **빈 문자열**이다 — 원본 조회가 `.eq("department", department || "")`(student.mjs:993)라 널이면 매칭되지 않는다.';
comment on column public.goal_university_cuts.department_name is
    '학과 표시명. 대학 단위 컷은 빈 문자열.';
comment on column public.goal_university_cuts.avg_cut is
    '컷 값. 원본 universities.avg_cut(student.mjs:990 select). ⚠ cut_type 에 따라 단위가 다르다 — normal/special 은 내신 등급 1~9(작을수록 우세, calcNaesinProb 이 currentGrade <= targetCut 을 우세로 판정, primitives.js:123), jungsi 는 정시 백분위 0~100(클수록 우세). null 이면 컷 미확보이고 API 가 422 cut_not_found 로 응답하며 학생 행은 status=awaiting_cuts 로 남는다.';
comment on column public.goal_university_cuts.source is
    '유도 출처(admission_results|manual). 원본에 없는 신설 컬럼 — 어떤 입결 데이터로 유도했는지 근거를 남긴다.';
comment on column public.goal_university_cuts.source_year is
    '유도에 쓴 입결 연도. 신설 컬럼.';
comment on column public.goal_university_cuts.is_active is
    '공개 여부. public read 정책이 이 값으로 필터한다(43_admission_results.sql:161-165 패턴).';
comment on column public.goal_university_cuts.note is
    '운영 메모(컷 산출 근거·예외 사항). 신설 컬럼.';
comment on column public.goal_university_cuts.created_at is
    '행 생성 시각. 백필 스크립트가 언제 넣었는지 추적용.';
comment on column public.goal_university_cuts.updated_at is
    '마지막 갱신 시각. 트리거 trg_goal_university_cuts_updated_at 이 채운다.';

-- 원본에는 UNIQUE 의 직접 증거가 없었다(.eq ×3 + maybeSingle 로 논리적
-- 유일성만 가정, student.mjs:989-994). 우리는 명시적 UNIQUE 로 고정한다.
--
-- ⚠ UNIQUE 는 **실제 조회 경로**에 걸어야 의미가 있다. 이 표의 유일한 소비자인
--   goalRepo.fetchUniversityCut 은 표시명 3튜플 + is_active 로 조회한다
--   (goalRepo.js:146-151 `.eq('cut_type').eq('university_name')
--    .eq('department_name').eq('is_active', true)`).
--   키 3튜플에만 UNIQUE 를 걸어 두면 같은 표시명이 서로 다른 키로 2행 존재하는
--   상태가 DB 상 완전히 합법이 되고, 그 순간 `.maybeSingle()` 이 PGRST116 을
--   던져 온보딩 전체가 500 으로 죽는다(intake.js:574-577 최상위 catch).
--   422 cut_not_found 도 아니고 awaiting_cuts 저장도 못 해 입력이 통째로 유실된다.
--   운 좋게 1행만 남아도 어느 키의 컷이 잡힐지 보장이 없어 잘못된 컷으로 base
--   확률이 산출되는데, base 는 이후 불변이라 되돌릴 수 없다.
--   → 조회 경로 그대로 partial UNIQUE 를 건다. 인덱스 술어(where is_active)가
--     조회 술어와 일치하므로 이 인덱스가 조회 인덱스 역할까지 겸한다
--     (기존 goal_university_cuts_lookup_idx 는 같은 컬럼·같은 술어의 non-unique
--      중복이라 삭제한다).
--   `where is_active` 로 좁히는 이유: 비활성 이력 행을 남겨 둘 수 있어야 한다.
--   조회가 is_active = true 로 필터하므로 활성 행 유일성만 보장하면 충분하다.
create unique index if not exists goal_university_cuts_name_key
    on public.goal_university_cuts (cut_type, university_name, department_name)
    where is_active;
-- 이전 판에서 만든 non-unique 중복 인덱스 정리(같은 컬럼·같은 술어).
drop index if exists public.goal_university_cuts_lookup_idx;
-- 조회 키 유일성. API 는 아직 이 경로로 조회하지 않지만(university_key /
-- department_key 를 읽는 코드 0건, 위 name_key 가 실제 방어선이다) 백필이
-- 같은 논리 식별자로 중복 행을 넣는 사고는 여기서 막는다.
create unique index if not exists goal_university_cuts_key
    on public.goal_university_cuts (cut_type, university_key, department_key);


-- ---------------------------------------------------------------------
-- (5) 현재확률 뷰 — base + Σdelta 재계산
--     security_invoker = true : 기반 테이블의 RLS를 뷰에서도 존중시킨다
--     (39번:26 / 43번:124-125 관례, PostgreSQL 17).
--     원본 student.mjs:1034-1037 과 동일하게 round 를 거치지 않는 순수
--     min/max 클램프이며, **합계에 클램프를 걸어야** 원본과 값이 같다.
--
--     ⚠ least()/greatest() 는 인자 중 NULL 을 **무시**한다(SQL 표준 이탈,
--       PostgreSQL 문서 "GREATEST and LEAST"). 따라서
--       greatest(0, NULL) = 0 이 되어, base_* 가 null 인 awaiting_cuts
--       학생이 "미산출(null)"이 아니라 "확률 0%"로 보이게 된다. 이는 이
--       뷰의 존재 이유(0%와 미산출의 구분)를 정면으로 깨뜨리므로
--       case ... when base is null then null 가드를 반드시 둔다.
--       (설계 문서 §5 "base_* 가 null 이면 least/greatest 결과도 null"은
--        PostgreSQL 동작과 어긋난 서술이다 — 아래 구현이 정본이다.)
-- ---------------------------------------------------------------------
create or replace view public.goal_student_state
with (security_invoker = true) as
select
    s.profile_id,
    s.status,
    s.onboarded_at,

    s.base_ideal_susi,
    s.base_ideal_jungsi,
    s.base_min_susi,
    s.base_min_jungsi,

    coalesce(d.sum_ideal_susi,   0) as cum_ideal_susi,
    coalesce(d.sum_ideal_jungsi, 0) as cum_ideal_jungsi,
    coalesce(d.sum_min_susi,     0) as cum_min_susi,
    coalesce(d.sum_min_jungsi,   0) as cum_min_jungsi,

    case when s.base_ideal_susi is null then null
         else least(100, greatest(0, s.base_ideal_susi + coalesce(d.sum_ideal_susi, 0)))
    end as ideal_susi,
    case when s.base_ideal_jungsi is null then null
         else least(100, greatest(0, s.base_ideal_jungsi + coalesce(d.sum_ideal_jungsi, 0)))
    end as ideal_jungsi,
    case when s.base_min_susi is null then null
         else least(100, greatest(0, s.base_min_susi + coalesce(d.sum_min_susi, 0)))
    end as min_susi,
    case when s.base_min_jungsi is null then null
         else least(100, greatest(0, s.base_min_jungsi + coalesce(d.sum_min_jungsi, 0)))
    end as min_jungsi,

    coalesce(d.record_count, 0) as record_count,
    d.last_record_date
from public.goal_students s
-- ⚠ LATERAL 이어야 한다. 상관되지 않은 `group by profile_id` 서브쿼리를 LEFT JOIN
--   하면, 바깥의 `where profile_id = <값>`(goalRepo.js:120-124 fetchStudentStateRow)이
--   서브쿼리 안으로 내려가지 않는다 — PostgreSQL 은 outer join 을 가로질러
--   equivalence class 를 만들지 않으므로 `d.profile_id = <값>` 이 유도되지 않고,
--   join clause 도 nullable 쪽으로의 push down 근거가 되지 못한다.
--   그 결과 학생 1명을 조회할 때마다 goal_daily_records **전건** seq scan +
--   HashAggregate 가 돌고 goal_daily_records_profile_created_idx(:386-387)는
--   쓰이지 않는다. 이 파일 385행이 "원본 어드민은 WHERE 없이 전건 로드 후
--   메모리 필터였다"고 비판한 바로 그 패턴이 뷰 안에 재생산되는 셈이다.
--   이 뷰는 GET /api/goal/student 마다, 온보딩마다(intake.js:568) 읽히고
--   service_role 은 RLS 도 우회하므로 행 필터가 전혀 걸리지 않는다 —
--   인증된 이용권 보유자 한 명이 새로고침을 반복하는 것만으로 DB CPU 를
--   포화시킬 수 있다.
--
--   LATERAL + `where r.profile_id = s.profile_id` 로 상관시키면 학생 1명분만
--   인덱스로 읽는다(goal_daily_records_index_key(profile_id, record_index) 또는
--   goal_daily_records_profile_created_idx 가 커버).
--   출력은 완전히 동일하다 — group by 없는 집계는 빈 집합에서도 1행
--   (sum = NULL, count = 0, max = NULL)을 내므로 `on true` 로 항상 매칭되고
--   위 coalesce 들이 기존과 같은 값을 낸다. security_invoker 의미도 그대로다.
left join lateral (
    select
        sum(r.delta_ideal_susi)   as sum_ideal_susi,
        sum(r.delta_ideal_jungsi) as sum_ideal_jungsi,
        sum(r.delta_min_susi)     as sum_min_susi,
        sum(r.delta_min_jungsi)   as sum_min_jungsi,
        count(*)                  as record_count,
        max(r.record_date)        as last_record_date
    from public.goal_daily_records r
    where r.profile_id = s.profile_id
) d on true;

comment on view public.goal_student_state is
    '목표관리 현재확률 = clamp(0,100, base + Σdelta). 저장하지 않고 매번 재계산한다 — 원본이 클램프를 "합계"에 걸기 때문에(target/api/student.mjs:1034-1037) 캐시 컬럼에 증분을 누적하면 값이 갈린다(base 95, +10, -10 → 재계산 95 vs 캐시 90). base_* 가 null 인 awaiting_cuts 학생은 확률도 null(미산출)이며 0% 와 구분된다. security_invoker = true 로 기반 테이블 RLS 를 상속한다.';

grant select on public.goal_student_state to authenticated;


-- ---------------------------------------------------------------------
-- (6) RLS
--     클라이언트는 "본인 행 읽기"만 가능하다. 쓰기 정책은 의도적으로 하나도
--     두지 않는다 — base_* / rate_* / delta_* 가 확률 게이지 그 자체이고
--     RLS 는 행 단위라 컬럼을 가릴 수 없으므로, update 를 열면 학생이 자기
--     확률을 100 으로 쓸 수 있다(원본의 병리를 그대로 재생산한다).
--     쓰기 경로는 service_role 을 쓰는 api/goal/*.js 하나뿐이다
--     (52_mentor_applications.sql:20-22 헤더 주석 관례).
--     admin 판정은 public.is_winning_admin()(00_base_schema.sql:1338).
--     정책 이름은 스네이크형으로 한 파일 안에서 통일하고, `to authenticated`
--     로 좁힌다(52번:172-175 / 43번 / 31번 관례).
-- ---------------------------------------------------------------------

-- (6-1) goal_students
alter table public.goal_students enable row level security;

drop policy if exists "goal_students_select_own" on public.goal_students;
create policy "goal_students_select_own" on public.goal_students
    as permissive for select to authenticated
    using (profile_id = auth.uid());

-- 어드민은 읽기만 한다 — 확률·성적 컬럼을 어드민 세션에서 UPDATE 할 수
-- 있으면 안 된다(RLS 는 행 단위라 컬럼을 가리지 못한다). 쓰기는 service_role
-- 하나뿐이다. 근거: docs/figma-goal/goal-admin-spec.md §3-D7 / §5-4.
-- ⚠ 이 파일은 수동 재실행이 전제라, 여기를 for all 로 되돌리면 sql/57 의
--   조임이 재실행 한 번에 통째로 무효화된다. 두 파일 모두 양쪽 이름
--   (_admin_all / _admin_select)을 drop 한 뒤 create 해야 순서 무관이 된다.
drop policy if exists "goal_students_admin_all"    on public.goal_students;
drop policy if exists "goal_students_admin_select" on public.goal_students;
create policy "goal_students_admin_select" on public.goal_students
    as permissive for select to authenticated
    using (public.is_winning_admin());

-- (6-2) goal_daily_records
alter table public.goal_daily_records enable row level security;

drop policy if exists "goal_daily_records_select_own" on public.goal_daily_records;
create policy "goal_daily_records_select_own" on public.goal_daily_records
    as permissive for select to authenticated
    using (profile_id = auth.uid());

-- 어드민 읽기 전용. 위 goal_students 블록의 주석과 같은 이유다.
drop policy if exists "goal_daily_records_admin_all"    on public.goal_daily_records;
drop policy if exists "goal_daily_records_admin_select" on public.goal_daily_records;
create policy "goal_daily_records_admin_select" on public.goal_daily_records
    as permissive for select to authenticated
    using (public.is_winning_admin());

-- (6-3) goal_probability_logs
alter table public.goal_probability_logs enable row level security;

drop policy if exists "goal_probability_logs_select_own" on public.goal_probability_logs;
create policy "goal_probability_logs_select_own" on public.goal_probability_logs
    as permissive for select to authenticated
    using (profile_id = auth.uid());

-- 어드민 읽기 전용. 위 goal_students 블록의 주석과 같은 이유다.
drop policy if exists "goal_probability_logs_admin_all"    on public.goal_probability_logs;
drop policy if exists "goal_probability_logs_admin_select" on public.goal_probability_logs;
create policy "goal_probability_logs_admin_select" on public.goal_probability_logs
    as permissive for select to authenticated
    using (public.is_winning_admin());

-- (6-4) goal_university_cuts — 전원 읽기 전용 + 어드민 전권
--   anon 을 포함하는 이유: 이 컷의 원천 데이터(admission_results)가 이미
--   public read 이고(43번:161-165), 컷 값 자체는 비밀이 아니다.
alter table public.goal_university_cuts enable row level security;

drop policy if exists "goal_university_cuts_public_read" on public.goal_university_cuts;
create policy "goal_university_cuts_public_read" on public.goal_university_cuts
    as permissive for select to anon, authenticated
    using (is_active = true);

drop policy if exists "goal_university_cuts_admin_all" on public.goal_university_cuts;
create policy "goal_university_cuts_admin_all" on public.goal_university_cuts
    as permissive for all to authenticated
    using (public.is_winning_admin())
    with check (public.is_winning_admin());


-- ---------------------------------------------------------------------
-- (7) updated_at 트리거 — 저장소 공용 함수 재사용
--     (00_base_schema.sql:1432 public.set_updated_at()). 새 함수를 만들지 않는다.
--     goal_probability_logs 는 append-only 라 updated_at 자체가 없다.
-- ---------------------------------------------------------------------
drop trigger if exists trg_goal_students_updated_at on public.goal_students;
create trigger trg_goal_students_updated_at
    before update on public.goal_students
    for each row execute function public.set_updated_at();

drop trigger if exists trg_goal_daily_records_updated_at on public.goal_daily_records;
create trigger trg_goal_daily_records_updated_at
    before update on public.goal_daily_records
    for each row execute function public.set_updated_at();

drop trigger if exists trg_goal_university_cuts_updated_at on public.goal_university_cuts;
create trigger trg_goal_university_cuts_updated_at
    before update on public.goal_university_cuts
    for each row execute function public.set_updated_at();


-- =====================================================================
-- 검증용 SELECT (실행 후 수동 확인용 — 주석 해제하고 실행)
-- =====================================================================
-- -- 테이블 4종 + 뷰 1종이 생겼는가
-- select table_name, table_type from information_schema.tables
--   where table_schema = 'public' and table_name like 'goal\_%' order by table_name;
--   -- goal_daily_records / goal_probability_logs / goal_students /
--   -- goal_university_cuts (BASE TABLE) + goal_student_state (VIEW) = 5건
--
-- -- 신규 테이블이므로 0행이 정상이다
-- select count(*) from public.goal_students;
-- select count(*) from public.goal_university_cuts;   -- 백필은 별도 작업
--
-- -- 정책 8건 (테이블당 2건)
-- select tablename, policyname, cmd, roles from pg_policies
--   where schemaname = 'public' and tablename like 'goal\_%'
--   order by tablename, policyname;
--
-- -- RLS 가 4테이블 모두 켜졌는가 (relforcerowsecurity 는 전부 false 여야 한다)
-- select relname, relrowsecurity, relforcerowsecurity from pg_class
--   where relnamespace = 'public'::regnamespace and relname like 'goal\_%'
--     and relkind = 'r' order by relname;
--
-- -- 인덱스 (PK/UNIQUE 포함)
-- select tablename, indexname from pg_indexes
--   where schemaname = 'public' and tablename like 'goal\_%'
--   order by tablename, indexname;
--
-- -- CHECK 제약 전문
-- select conrelid::regclass as tbl, conname, pg_get_constraintdef(oid)
--   from pg_constraint
--   where conrelid in ('public.goal_students'::regclass,
--                      'public.goal_daily_records'::regclass,
--                      'public.goal_probability_logs'::regclass,
--                      'public.goal_university_cuts'::regclass)
--   order by 1, 2;
--
-- -- 뷰가 security_invoker 인가 (reloptions 에 security_invoker=true 가 보여야 한다)
-- select relname, reloptions from pg_class where relname = 'goal_student_state';
--
-- -- generated column 이 실제로 월=0…일=6 인가 (2026-08-10 은 월요일)
-- select (extract(isodow from date '2026-08-10'))::int - 1 as should_be_0,
--        (extract(isodow from date '2026-08-16'))::int - 1 as should_be_6;
--
-- -- avg_cut 스케일 CHECK 가 실제로 막는가 (둘 다 23514 로 실패해야 정상)
-- -- insert into public.goal_university_cuts
-- --   (cut_type, university_key, university_name, avg_cut)
-- --   values ('normal', 'test', 'test', 55);      -- 내신에 백분위 → 실패해야 정상
-- -- insert into public.goal_university_cuts
-- --   (cut_type, university_key, university_name, avg_cut)
-- --   values ('jungsi', 'test', 'test', 150);     -- 범위 초과 → 실패해야 정상


-- =====================================================================
-- 되돌리기(롤백) — 실행하지 마라. 필요할 때만 수동으로 복사해서 쓴다.
-- ⚠ 학생 데이터가 들어간 뒤에는 되돌리지 마라. drop table 은 goal_students
--   → goal_daily_records → goal_probability_logs 로 cascade 되어 학습 기록과
--   확률 로그가 함께 사라지며, 이 파일에는 복구 수단이 없다.
--   되돌리기 전 반드시 pg_dump 등으로 4테이블을 백업할 것.
-- =====================================================================
-- -- (7) 트리거
-- drop trigger if exists trg_goal_university_cuts_updated_at on public.goal_university_cuts;
-- drop trigger if exists trg_goal_daily_records_updated_at   on public.goal_daily_records;
-- drop trigger if exists trg_goal_students_updated_at        on public.goal_students;
-- -- public.set_updated_at() 은 공용 함수라 **절대 drop 하지 마라**
-- -- (00_base_schema.sql:1432, admin_* / banners / galleries 등 다수가 쓴다).
--
-- -- (6) 정책 — 테이블을 drop 하면 함께 사라지므로 테이블을 남길 때만 필요하다
-- drop policy if exists "goal_university_cuts_admin_all"     on public.goal_university_cuts;
-- drop policy if exists "goal_university_cuts_public_read"   on public.goal_university_cuts;
-- drop policy if exists "goal_probability_logs_admin_select" on public.goal_probability_logs;
-- drop policy if exists "goal_probability_logs_select_own"   on public.goal_probability_logs;
-- drop policy if exists "goal_daily_records_admin_select"    on public.goal_daily_records;
-- drop policy if exists "goal_daily_records_select_own"      on public.goal_daily_records;
-- drop policy if exists "goal_students_admin_select"         on public.goal_students;
-- drop policy if exists "goal_students_select_own"           on public.goal_students;
--
-- -- (5) 뷰 — sql/57 의 goal_university_options 는 goal_university_cuts 에
-- --          의존하므로 그 표를 drop 하기 전에 먼저 없애야 한다.
-- drop view if exists public.goal_university_options;
-- drop view if exists public.goal_student_state;
--
-- -- (1)~(4) 테이블 — FK 역순으로. 인덱스·제약·시퀀스는 함께 삭제된다.
-- drop table if exists public.goal_probability_logs;
-- drop table if exists public.goal_daily_records;
-- drop table if exists public.goal_students;
-- drop table if exists public.goal_university_cuts;
