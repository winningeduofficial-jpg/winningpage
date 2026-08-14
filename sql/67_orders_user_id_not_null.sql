-- =====================================================================
-- orders.user_id / orders.customer_email NOT NULL — 비회원 결제 차단 (DB 층)
-- Supabase SQL Editor 에서 실행하세요. (idempotent - 여러 번 실행해도 안전)
-- =====================================================================
--
-- 배경 — 감사 결과 M5 (P0, 마지막 미처리 P0)
--   orders.user_id / orders.customer_email 가 둘 다 NULL 허용이라(sql/10
--   _pricing_orders.sql:61,75) 비회원도 결제를 완주할 수 있었다. 그 상태로
--   결제가 확정되면 누구에게 이용 권한을 줄지(api/_lib/programAccess.js
--   grantProgramAccessForOrder — userId 없으면 'order_has_no_user'로
--   조용히 스킵), 환불 시 누구에게서 회수할지 알 방법이 없다. 사용자 결정
--   (2026-08-12 확정): "비회원은 결제하지 못 함" — 신원을 백필하는 게 아니라
--   비회원 결제 자체를 막는다.
--
--   방어를 3층에 둔다: 1) api/create-order.js 서버 거부(진짜 방어선,
--   클라이언트 우회 불가) 2) src/App.jsx `/checkout` 라우트 가드
--   (ProtectedRoute) 3) 이 파일 — DB 제약. 세 층 중 이 파일이 담당하는 부분.
--
-- ---------------------------------------------------------------------
-- 0) 조사 (2026-08-12 dev 실측)
-- ---------------------------------------------------------------------
-- a) 기존 orders 1행 전부 user_id/customer_email 이 non-null이었다
--    (order_1785898468780_adf9e6aa, user_id=9aa50104-..., customer_email=
--    devadmin@gmail.com) — 위반 행 0건, NOT NULL 을 걸 수 있다.
--
-- b) orders.user_id 의 FK(sql/00_base_schema.sql:1033-1034,
--    sql/10_pricing_orders.sql:61)는 `references auth.users(id) on delete
--    set null` 이다. **ON DELETE SET NULL 과 NOT NULL 은 근본적으로
--    양립하지 않는다** — auth.users 행이 삭제되면 FK 트리거가
--    `update orders set user_id = null where user_id = <삭제된 id>`를
--    실행하려 하고, NOT NULL 제약이 그 UPDATE 자체를 거부해 트랜잭션
--    전체(사용자 삭제)가 23502(not_null_violation)로 실패한다.
--
--    해결: FK 액션을 SET NULL → RESTRICT 로 바꾼다. CASCADE(주문 행까지
--    삭제)는 팀 리드 지시로 임의 선택 금지 — 주문 이력 보존은 정산·법적
--    요건과 얽힌다. RESTRICT 는 그 반대 방향으로 더 안전하다: 주문이 있는
--    사용자 삭제 자체를 막아 orders 행이 NULL 로 익명화되지도, 삭제되지도
--    않고 항상 원 소유자를 가리킨 채 보존된다. 이 저장소를 grep 한 결과
--    (api/, src/) `auth.admin.deleteUser`/계정 탈퇴 삭제 흐름이 현재 전혀
--    없으므로 이 변경으로 깨지는 기존 기능이 없다 — 장래에 탈퇴 기능을
--    붙일 때는 auth.users 를 직접 삭제하는 대신 profiles 익명화 등 별도
--    설계가 필요하다는 뜻이고, 그건 이 파일의 범위 밖이다.
--
-- c) customer_email 도 dev auth.users 8행 전부 email non-null(0건 위반).
--    이 저장소 가입 흐름(src/pages/Signup.jsx:405 supabase.auth.signUp)이
--    이메일/비밀번호 기반이라 로그인된 사용자는 항상 email 을 가진다.
--    api/create-order.js 개정 후 customerEmail 은 userId 와 같은
--    auth.getUser() 응답에서 나오므로 두 컬럼은 항상 함께 채워진다 — orders
--    에 값을 쓰는 코드 경로가 sql/55_coupon_policy.sql fn_redeem_coupons
--    하나뿐이라는 점도 sql/58_money_invariants.sql 과 동일(위반 없이 항상
--    성립).
--
-- 절대 규칙 — drop constraint if exists → add constraint 쌍으로 멱등.
--   재실행 시 no-op. 기존 데이터는 건드리지 않는다(위반 행 0건, 수정 문장 없음).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) user_id NOT NULL
-- ---------------------------------------------------------------------
alter table public.orders
  alter column user_id set not null;

-- ---------------------------------------------------------------------
-- 2) FK 액션 SET NULL → RESTRICT (0-b절 근거)
-- ---------------------------------------------------------------------
alter table public.orders
  drop constraint if exists orders_user_id_fkey;
alter table public.orders
  add constraint orders_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete restrict;

comment on constraint orders_user_id_fkey on public.orders is
  '비회원 결제 차단(M5, 2026-08-12)으로 user_id가 NOT NULL이 됐다. ON DELETE는 SET NULL에서 RESTRICT로 바꿨다 — SET NULL은 NOT NULL과 양립 불가(사용자 삭제 시 23502로 실패)이고, CASCADE는 주문 이력을 지워 정산·법적 보존 요건과 충돌한다. RESTRICT는 주문이 있는 사용자의 삭제 자체를 막아 orders 행을 원 소유자 연결 그대로 보존한다.';

-- ---------------------------------------------------------------------
-- 3) customer_email NOT NULL (0-c절 근거)
-- ---------------------------------------------------------------------
alter table public.orders
  alter column customer_email set not null;

-- =====================================================================
-- 확인용 (실행 후 눈으로 볼 것 — 아래는 주석, 자동 실행되지 않는다)
-- =====================================================================
-- 이 파일이 실제로 만든/바꾼 제약.
-- select conrelid::regclass as table_name, conname, pg_get_constraintdef(oid) as def
-- from pg_constraint
-- where conrelid = 'public.orders'::regclass
--   and conname in ('orders_user_id_fkey')
-- order by conname;
--
-- select column_name, is_nullable
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'orders'
--   and column_name in ('user_id', 'customer_email');
--   → 기대: 둘 다 is_nullable = 'NO'.
--
-- NOT NULL 이 실제로 거부하는지 — 반드시 begin...rollback 안에서 실행할 것.
-- begin;
--   insert into public.orders (id, user_id, customer_email, amount, list_amount)
--   values ('__selftest_guest_order__', null, null, 10000, 10000);
-- rollback;
--   → 기대: ERROR 23502 (not_null_violation), column "user_id".
--
-- 정상 결제 경로(로그인 사용자)가 안 깨지는지 — fn_redeem_coupons 를
-- begin...rollback 안에서 실제 값으로 호출(dev 실 product_id 치환).
-- begin;
--   select * from public.fn_redeem_coupons(
--     '__selftest_order__', '<dev auth.users.id>', '<dev auth.users.email>',
--     '셀프테스트',
--     '[{"product_id":"<dev products.id>","product_slug":"goal-1m","service_key":"goal","name":"[1개월] 위닝 목표관리","list_price":25000,"price":25000,"quantity":1}]'::jsonb,
--     25000, 25000, '{}'::uuid[]
--   );
-- rollback;
--   → 기대: 1행 반환, 예외 없음(로그인 사용자는 그대로 통과).
-- =====================================================================
