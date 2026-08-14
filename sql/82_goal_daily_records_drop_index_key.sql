-- =====================================================================
-- 82_goal_daily_records_drop_index_key.sql
-- goal_daily_records 의 (profile_id, record_index) UNIQUE 인덱스 제거 —
-- D-8 재설계(실제 달력 전환) 이후 더 이상 참인 제약이 아니다.
-- Supabase SQL Editor / Management API에서 수동 실행 필요.
-- (이 repo에 마이그레이션 러너 없음 — 접두어가 곧 수동 실행 순서다.)
-- idempotent — 여러 번 실행해도 안전(drop index if exists).
--
-- 포함:
--   1) public.goal_daily_records_index_key 인덱스 삭제
--   2) goal_daily_records.record_index 컬럼 코멘트 갱신
--
-- 배경 (재온보딩 후 첫 일일 학습기록 제출 500 회귀):
--   sql/55_goal_management.sql:264-273 은 "가상 달력" 모델을 전제로
--   record_index 를 정본 충돌키로 설계했다(제출 N번째 = N일차,
--   record_date = actual_start_date + record_index 일, 실제 달력과 무관).
--   그 설계 아래에서는 record_index 가 학생당 전역 유일했다.
--
--   지금은 그 반대다 — record_date 가 정본이고 record_index 는 파생값이다
--   (record_index = diffDaysYMD(actual_start_date, record_date),
--   api/goal/daily-record.js:236). actual_start_date 는 재온보딩마다
--   오늘 날짜로 재설정되므로(api/goal/intake.js:754), 같은 record_index
--   값이 서로 다른 actual_start_date 를 가진 두 "생애"에서 재사용될 수
--   있다 — 더 이상 학생당 전역 유일하지 않다.
--
--   api/_lib/goalRepo.js:439-448 upsertDailyRecord 는 이미
--   onConflict:'profile_id,record_date' 를 쓴다 — 코드는 record_date 를
--   정본 충돌키로 취급한 지 오래다. 하지만 DB에는 별도로
--   goal_daily_records_index_key UNIQUE(profile_id, record_index) 가
--   여전히 살아 있었고, Postgres 의 ON CONFLICT 절은 지정된 인덱스만
--   막아줄 뿐 다른 UNIQUE 인덱스 위반은 그대로 원시 23505(unique_violation)
--   로 던진다.
--
--   재현 경로: 학생이 리셋 전에 record_index=0 인 행을 남긴다(어드민 소프트
--   리셋 sql/81_goal_student_reset.sql 은 이 행을 삭제하지 않는다 — 의도된
--   설계, 학습 이력 보존). 재온보딩하면 actual_start_date 가 오늘로
--   재설정되고, 재온보딩 당일 첫 제출의 record_index 도 다시 0 이 된다.
--   → 옛 행과 (profile_id, record_index)=(...,0) 충돌 → upsert 가 겨냥한
--   (profile_id, record_date) 인덱스는 문제없이 통과하지만 이 별도
--   인덱스가 막아서 500.
--
--   goal_daily_records_date_key UNIQUE(profile_id, record_date)
--   (sql/55_goal_management.sql:382-383)는 그대로 둔다 — 이게 이제
--   유일한 정본 충돌키이고 코드가 이미 이걸 onConflict 로 쓰고 있다.
--
-- 무엇을 남기는가:
--   record_index 컬럼 자체와 goal_daily_records_record_index_check(>= 0)
--   CHECK 는 그대로 둔다 — 컬럼은 "며칠차" 표시용으로 계속 쓰인다.
--   전역 유일성 제약만 빠지는 것이다.
--
-- 의존성:
--   - sql/55_goal_management.sql : public.goal_daily_records,
--     goal_daily_records_index_key, goal_daily_records_date_key
--   위 하나만 있으면 다른 마이그레이션과 독립 실행 가능하다.
--
-- 주의:
--   - sql/55_goal_management.sql 원문은 손대지 않는다(append-only 관례,
--     역사적 기록으로 그대로 둔다 — sql/56 이 sql/55 의 NOT NULL 을 나중
--     파일에서 alter 로 해제한 선례와 동일한 패턴).
-- =====================================================================


-- ---------------------------------------------------------------------
-- (1) 전역 유일성 인덱스 삭제 — record_date 만 정본 충돌키로 남긴다.
-- ---------------------------------------------------------------------
drop index if exists public.goal_daily_records_index_key;


-- ---------------------------------------------------------------------
-- (2) record_index 컬럼 코멘트 갱신 — 더 이상 전역 유일하지 않음을 명시.
--     sql/55_goal_management.sql:338-339 의 원 코멘트를 덮어쓴다(alter가
--     아니라 새 comment on 문 — sql/56 이 sql/55 를 다루는 방식과 동일).
-- ---------------------------------------------------------------------
comment on column public.goal_daily_records.record_index is
    '0-base 학습 N일차 표시값. ⚠ 더 이상 (profile_id, record_index) 전역
    유일이 아니다 — actual_start_date 가 재온보딩(api/goal/intake.js:754)
    으로 바뀌면 같은 record_index 가 다른 record_date 에 재사용될 수 있다.
    유일성은 (profile_id, record_date) 만 보장한다(goal_daily_records_date_key,
    api/_lib/goalRepo.js:442 onConflict). 원래는 학생당 전역 유일한 정본
    충돌키로 설계됐으나(원본 study_records.sequence, student.mjs:2669) D-8
    재설계로 실제 달력이 정본이 되며 이 컬럼은 record_date 의 파생값
    (record_index = diffDaysYMD(actual_start_date, record_date),
    api/goal/daily-record.js:236)으로 역전됐다. sql/82_goal_daily_records_drop_index_key.sql
    참고.';
