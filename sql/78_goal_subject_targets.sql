-- =====================================================================
-- 78_goal_subject_targets.sql
-- 목표관리(/app/goal) 열공 타이머(#25) 과목별 목표 시간.
-- Supabase SQL Editor / Management API에서 수동 실행 필요.
-- (이 repo에 마이그레이션 러너 없음 — 00~77번과 동일하게 파일 전체를
--  붙여넣고 실행한다.)  idempotent — 여러 번 실행해도 안전.
--
-- 포함:
--   1) public.goal_subject_targets   과목별 목표 학습 시간(학생이 자율 설정)
--   2) RLS — select own + admin select(쓰기는 client 정책 0건, service_role 전용)
--   3) updated_at 트리거(공용 public.set_updated_at() 재사용)
--
-- 배경(임무 지시 "단계 B: 열공 타이머 영속화 + 과목별 목표"):
--  - SubjectTimerCard(src/components/goal/study/SubjectTimerCard.jsx)는
--    지금까지 mockSubjectTimers(src/data/goalStudyMock.js)의 고정
--    targetHours를 그렸다. 이 테이블이 그 목업을 대체하는 실 저장소다.
--    원본 외부 앱(target)에 대응 스키마가 없는 신규 기능이라 컬럼 코멘트에
--    원본 참조가 없다.
--  - 학생이 타이머 페이지에서 과목별 목표 시간을 자율 설정한다(확정 결정).
--    아직 값을 설정하지 않은 과목의 기본값은 이 테이블에 저장하지 않는다 —
--    프론트가 "오늘 요일 목표 총합(goal_students.study_schedule) ÷ 표시
--    과목 수"로 매 조회마다 계산해 보여준다(api/goal/timer.js GET
--    targets 배열은 실제로 설정된 행만 담는다. 미설정 과목의 표시값은
--    클라이언트 파생값이며 이 테이블의 정본이 아니다).
--  - PK를 (profile_id, subject) 복합키로 둔다 — 학생 1명당 과목 1개에
--    목표 시간 1개만 존재하면 되고, 그 이상의 유일성 규약이 필요 없다
--    (goal_plan_tasks처럼 같은 (학생, 날짜)에 과제가 여러 건 있는 구조가
--    아니다).
--
-- 의존성:
--   - 00_base_schema.sql : public.is_winning_admin()(1338행),
--                          public.set_updated_at()(1432행)
--   - sql/55_goal_management.sql : public.goal_students(profile_id) FK 대상
--   위 셋만 있으면 다른 마이그레이션과 독립 실행 가능하다.
--   **api/goal/timer.js 배포 전 반드시 선행 실행** — 테이블 없이 배포하면
--   과목별 목표 저장이 전량 실패한다.
--
-- 주의:
--   - admin 판정은 반드시 public.is_winning_admin()을 쓴다(is_admin() 아님,
--     42P17 infinite recursion 회피 — README 「RLS admin 판정」).
--   - 어드민 RLS는 select 전용이다(`for all` 금지) — 75번(goal_plan_tasks)
--     검수 반려 이후의 확정 관례.
--   - `revoke ... from anon, authenticated` 는 걸지 않는다(52번:23-28 근거,
--     55번 헤더 동일 관례).
--   - `force row level security` 도 쓰지 않는다(README:29).
--   - subject는 CHECK 5종('korean'|'math'|'english'|'science'|'etc')이다 —
--     75번(goal_plan_tasks)·77번(goal_timer_sessions)과 동일 도메인.
--   - ⚠ 이 파일은 **dev DB에 적용하지 않는다 — 파일만 만들고 실행은
--     보류**(임무 지시 확정 사항). 다른 sql/*.sql처럼 팀장이 수동 실행
--     시점을 별도로 정한다.
-- =====================================================================


-- ---------------------------------------------------------------------
-- (1) 과목별 목표 시간
--     CHECK 제약은 create table 안에 인라인으로 둔다(43/52/55/75/77번 관례).
-- ---------------------------------------------------------------------
create table if not exists public.goal_subject_targets (
    profile_id uuid not null references public.goal_students(profile_id) on delete cascade,

    -- 목표를 설정하는 과목. SubjectTimerCard 4장 + 기타 1종.
    subject text not null,

    -- 목표 학습 시간(시간 단위, 0.5시간 단위 입력을 지원하도록 numeric(4,1)).
    -- 0은 "목표 없음"이 아니라 사용자가 명시적으로 0을 저장한 상태다 —
    -- 미설정(행 자체가 없음)과 값 0을 API 레이어가 구분한다.
    target_hours numeric(4,1) not null
        check (target_hours >= 0 and target_hours <= 24),

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint goal_subject_targets_subject_check
        check (subject in ('korean', 'math', 'english', 'science', 'etc')),

    primary key (profile_id, subject)
);

comment on table public.goal_subject_targets is
    '목표관리 열공 타이머(#25) 과목별 목표 학습 시간. 학생이 타이머 페이지에서 자율 설정(원본 외부 앱(target)에 대응 스키마 없음, 신규 기능). 미설정 과목의 기본값(요일 목표 총합÷과목 수)은 이 테이블에 저장하지 않고 API 응답 시점에 프론트가 파생한다. 쓰기는 service_role(api/goal/timer.js)만. sql/78_goal_subject_targets.sql 참고.';

comment on column public.goal_subject_targets.profile_id is
    'goal_students.profile_id(≡auth.users.id). 소유자 판정은 언제나 세션 토큰에서 얻은 profileId로만 한다(api/_lib/goalRepo.js openGoalSession 관례) — 클라이언트가 보낸 어떤 id도 신뢰하지 않는다.';
comment on column public.goal_subject_targets.subject is
    '과목 코드 5종. 한글 라벨(국어/수학/영어/탐구/기타)과의 매핑은 api/_lib/goalRepo.js SUBJECT_CODE_TO_LABEL/SUBJECT_LABEL_TO_CODE가 담당한다 — DB에는 코드값만 저장한다.';
comment on column public.goal_subject_targets.target_hours is
    '목표 학습 시간(시간, 0~24, 0.1시간 단위 저장 가능하나 UI는 통상 0.5시간 스텝을 쓴다). 0은 "미설정"이 아니라 사용자가 저장한 값 0이다.';
comment on column public.goal_subject_targets.created_at is
    '행 생성 시각.';
comment on column public.goal_subject_targets.updated_at is
    '마지막 갱신 시각. 트리거 trg_goal_subject_targets_updated_at이 공용 public.set_updated_at()(00_base_schema.sql:1432)으로 채운다.';


-- ---------------------------------------------------------------------
-- (2) RLS — "본인 행 읽기"만 가능(55번:686-696 관례와 동일).
--     클라이언트 write 정책은 두지 않는다 — 쓰기 경로는 service_role을 쓰는
--     api/goal/timer.js 하나뿐이다. 어드민 정책도 select 전용이다
--     (goal_subject_targets_admin_select) — `for all + with check`는 어드민
--     세션에도 쓰기를 열어 "쓰기는 service_role 전용" 원칙을 어긴다
--     (55번:706-716 goal_students_admin_all과 달리, 이 테이블은 어드민
--     UI에서 직접 수정할 필요가 없어 select만으로 충분하다 — 75번 검수
--     반려 반영).
-- ---------------------------------------------------------------------
alter table public.goal_subject_targets enable row level security;

drop policy if exists "goal_subject_targets_select_own" on public.goal_subject_targets;
create policy "goal_subject_targets_select_own" on public.goal_subject_targets
    as permissive for select to authenticated
    using (profile_id = auth.uid());

drop policy if exists "goal_subject_targets_admin_all" on public.goal_subject_targets;
drop policy if exists "goal_subject_targets_admin_select" on public.goal_subject_targets;
create policy "goal_subject_targets_admin_select" on public.goal_subject_targets
    as permissive for select to authenticated
    using (public.is_winning_admin());


-- ---------------------------------------------------------------------
-- (3) updated_at 트리거 — 저장소 공용 함수 재사용(00_base_schema.sql:1432
--     public.set_updated_at()). 새 함수를 만들지 않는다.
-- ---------------------------------------------------------------------
drop trigger if exists trg_goal_subject_targets_updated_at on public.goal_subject_targets;
create trigger trg_goal_subject_targets_updated_at
    before update on public.goal_subject_targets
    for each row execute function public.set_updated_at();


-- =====================================================================
-- 검증용 SELECT (실행 후 수동 확인용 — 주석 해제하고 실행)
-- =====================================================================
-- select table_name from information_schema.tables
--   where table_schema = 'public' and table_name = 'goal_subject_targets';
--
-- select policyname, cmd from pg_policies
--   where schemaname = 'public' and tablename = 'goal_subject_targets'
--   order by policyname;
--   -- goal_subject_targets_admin_select(SELECT) / goal_subject_targets_select_own(SELECT) = 2건
