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
-- 적용 상태
--   2026-08-10 14:30 UTC dev(gjowqdiopinhixfivnkx, 서울) 최초 적용. 적용 전
--   programs 는 **빈 테이블**이었고, 적용 후 goal·suhaeng 2행이 is_active = true
--   로 존재했다. 즉 이 파일 적용 전까지 즉시 입장 부여는 FK 위반으로 실패하는
--   상태였다.
--   2026-08-11 program_key 를 goal → target 으로 전환(아래 "goal → target 전환"
--   절 참고). dev 재적용 완료 — programs 는 target·suhaeng 2행이 되었고, 최초
--   적용이 만든 goal 행은 삭제했다(운영 DB 는 별개이며 이 전환과 무관하게 이미
--   target 이 정본이었다 — "왜 goal → target 인가" 절 참고).
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
--     따라서 이 insert 가 실제로 2행을 만들었고, 지금 dev 의 programs 는 더 이상
--     비어 있지 않다. "있으면 그대로 두는" 규약(on conflict do nothing)은
--     재실행·타 환경 대비로 그대로 유지한다.
--     (운영 DB 는 별개다 — 운영 반영 시 빈 테이블 여부를 다시 확인할 것.)
--
-- ※ 이 파일을 적용하기 전에는 즉시 입장 부여가 실패한다(결제는 정상 승인되고
--   부여 실패만 로그 + 응답 access.error 로 남는다).
--   dev 는 적용 완료라 이 실패 조건이 해소된 상태다.
--
-- 넣는 키를 왜 이 2개로 한정하나
--   입장(SSO)이 실제로 성립하는 서비스가 목표관리·수행평가 뿐이다
--   (api/create-service-ticket.js:7-22 SERVICE_CONFIGS,
--    src/lib/paidServiceAccess.js:5 PAID_SERVICE_CONFIGS).
--   susi·mentor·diagnose 는 program_key 도, 입장할 앱(target_url)도 정해지지
--   않았다 → 키를 임의로 만들지 않는다.
--   목표관리 판정은 program_keys ['goal','target'] 를 순회하므로
--   (create-service-ticket.js:20) 둘 중 하나만 programs 에 있으면 FK 는
--   성립한다. 아래 "goal → target 전환" 절 대로 지금은 target 만 둔다.
--
-- goal → target 전환 (2026-08-11, 사용자 확정)
--   최초 시드(위 2026-08-10 항목)는 program_key 를 'goal' 로 만들었다 — 당시
--   운영 DB 를 확인할 수단이 없어 "'target' 은 추측이라 만들지 않는다"고 적어
--   두고 코드에 이미 있던 문자열(goal)을 그대로 썼다.
--   2026-08-11 운영 DB(ucjlcvqvinspmrasvsug) 확인 결과 programs 는
--   target/suhaeng 2행이고, program_key='target' 인 **active 권한 부여가 2건
--   실재**했다 — 즉 'target' 은 추측이 아니라 운영에서 이미 쓰이고 있는 정본
--   키였다. 사용자가 이 실데이터를 근거로 target 을 정본으로 확정했다
--   (2026-08-11). dev 만 goal 로 어긋나 있던 상태라 dev 를 운영에 맞춘다.
--   주의: products.service_key = 'goal' 은 상품 식별자로 바뀌지 않는다(값
--   그대로 유지). 바뀌는 것은 program_access.program_key 뿐이다 — 매핑은
--   api/_lib/programAccess.js:56-59 SERVICE_KEY_TO_PROGRAM_KEY 에서
--   service_key 'goal' → program_key 'target' 으로 정의한다.
--
-- app_url 은 비워 둔다
--   이 레포에서 programs 를 읽는 코드가 없고, 자식 앱 주소의 정본은 서버
--   환경변수(GOAL_SERVICE_URL / TARGET_SERVICE_URL / SUHAENG_SERVICE_URL)다.
--   여기에 URL 을 적으면 정본이 두 곳으로 갈라진다.
--
-- name 값을 운영과 맞춘 이유
--   최초 시드는 '위닝 목표관리' / '위닝 AI수행평가' 로 적당히 지었다(운영을
--   확인할 수 없었으므로). 지금은 운영 실데이터를 확인했으니 운영 문구
--   '위닝 목표관리 프로그램' / '위닝 수행평가 프로그램' 을 그대로 쓴다 — 이
--   레포는 name 을 읽지 않지만(위 "app_url" 절과 같은 이유로 이 값의 소비처가
--   없다) 두 DB 가 갈라질 이유도 없다.
-- ---------------------------------------------------------------------

insert into public.programs (program_key, name, is_active, sort_order)
values
  ('target',  '위닝 목표관리 프로그램', true, 1),
  ('suhaeng', '위닝 수행평가 프로그램', true, 2)
on conflict (program_key) do nothing;

-- 2026-08-10 최초 적용이 만든 'goal' 행 정리. dev program_access 는 이 전환
-- 시점까지 0행이라(FK 참조 없음, 아래 확인 완료) 삭제해도 데이터 손실이 없다.
-- 운영은 애초에 goal 행을 만든 적이 없으므로 이 delete 는 dev 전용 정리다.
delete from public.programs where program_key = 'goal';

-- suhaeng 행은 위 insert 이전(2026-08-10)에 이미 존재해 on conflict do nothing
-- 으로 위 insert 가 건너뛴다 — 그래서 name 만 명시적으로 운영값에 맞춘다.
-- (신규 DB 에서는 이 update 가 위 insert 와 같은 값을 다시 쓰는 것이라 무해하다.)
update public.programs set name = '위닝 수행평가 프로그램' where program_key = 'suhaeng';

-- 확인용 (실행 후 눈으로 볼 것)
-- select program_key, name, is_active from public.programs order by sort_order;
