-- =====================================================================
-- 즉시 입장(결제 승인 → 이용 권한 자동 부여) 선행 조건: programs 시드
-- Supabase SQL Editor 에서 실행하세요. (idempotent - 여러 번 실행해도 안전)
-- =====================================================================
--
-- 파일 번호 경위 (53 → 54)
--   원래 이름은 53_program_access_grant.sql 이었다. 짝 파일이 접두어 52 를
--   쓸 수 없어 53 으로 밀렸고(goal-app-shell 브랜치의
--   sql/52_learning_diagnosis_path_move.sql 가 52 를 선점 — 그 마커
--   '52_learning_diagnosis_path_move_v1' 이 dev DB schema_migrations 에
--   2026-08-10 07:41:30 UTC 로 이미 적용돼 있다), 그 결과 이 파일도 54 로 밀렸다.
--   실행 순서는 53 → 54 그대로다(이 파일은 마커를 쓰지 않으므로 리네임 부작용 없음).
--
-- 적용 상태: dev DB 적용 완료 (2026-08-10 14:30 UTC)
--   대상 dev(gjowqdiopinhixfivnkx, 서울). 적용 전 programs 는 **빈 테이블**이었고,
--   적용 후 goal·suhaeng 2행이 is_active = true 로 존재한다.
--   즉 이 파일 적용 전까지 즉시 입장 부여는 FK 위반으로 실패하는 상태였다.
--   dev 재실행은 on conflict do nothing 으로 0행 삽입.
--
-- 왜 필요한가
--   api/_lib/programAccess.js 가 결제 확정 시 program_access 에 행을 넣는다.
--   program_access.program_key 는 programs(program_key) FK 이므로
--   (sql/00_base_schema.sql:1044) 해당 program_key 행이 programs 에 없으면
--   부여 insert 가 FK 위반으로 100% 실패한다.
--   그런데 sql/ 어디에도 programs INSERT 시드가 없다(00_base_schema.sql:854-864
--   에 DDL 만 있음). 작성 시점에는 programs 의 RLS(programs_select_active,
--   to authenticated, :2068)와 service_role 키 부재로 로컬에서 행 유무를 확인할
--   수 없어서 "없으면 만들고 있으면 그대로 두는" 시드로 작성했다.
--   → 2026-08-10 14:30 UTC dev 적용 시 확인됨: programs 는 **빈 테이블**이었다.
--     따라서 이 insert 가 실제로 2행(goal·suhaeng)을 만들었고, 지금 dev 의
--     programs 는 더 이상 비어 있지 않다. "있으면 그대로 두는" 규약(on conflict
--     do nothing)은 재실행·타 환경 대비로 그대로 유지한다.
--     (운영 DB 는 별개다 — 운영 반영 시 빈 테이블 여부를 다시 확인할 것.)
--
-- ※ 이 파일을 적용하기 전에는 즉시 입장 부여가 실패한다(결제는 정상 승인되고
--   부여 실패만 로그 + 응답 access.error 로 남는다).
--   dev 는 적용 완료라 이 실패 조건이 해소된 상태다.
--
-- 넣는 키를 왜 이 2개로 한정하나
--   입장(SSO)이 실제로 성립하는 서비스가 goal·suhaeng 뿐이다
--   (api/create-service-ticket.js:7-22 SERVICE_CONFIGS,
--    src/lib/paidServiceAccess.js:5 PAID_SERVICE_CONFIGS).
--   susi·mentor·diagnose 는 program_key 도, 입장할 앱(target_url)도 정해지지
--   않았다 → 키를 임의로 만들지 않는다.
--   goal 판정은 program_keys ['goal','target'] 를 순회하므로(create-service-ticket
--   .js:20) 'goal' 하나만 있으면 통과한다. 'target' 은 추측이라 만들지 않는다.
--
-- app_url 은 비워 둔다
--   이 레포에서 programs 를 읽는 코드가 없고, 자식 앱 주소의 정본은 서버
--   환경변수(GOAL_SERVICE_URL / TARGET_SERVICE_URL / SUHAENG_SERVICE_URL)다.
--   여기에 URL 을 적으면 정본이 두 곳으로 갈라진다.
-- ---------------------------------------------------------------------

insert into public.programs (program_key, name, is_active, sort_order)
values
  ('goal',    '위닝 목표관리',   true, 1),
  ('suhaeng', '위닝 AI수행평가', true, 2)
on conflict (program_key) do nothing;

-- 확인용 (실행 후 눈으로 볼 것)
-- select program_key, name, is_active from public.programs order by sort_order;
