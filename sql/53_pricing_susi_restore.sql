-- =====================================================================
-- 수시예측 상품 복구/라벨 정정 + 회원가입 쿠폰 유효기간 연장
-- Supabase SQL Editor 에서 실행하세요. (idempotent — 여러 번 실행해도 안전)
--
-- 🚨 마커 문자열을 파일명에 맞춰 고치지 마라 (가장 중요)
-- ---------------------------------------------------------------------
-- 이 파일은 53_* 인데 마커는 '52_pricing_susi_restore_v1' 이다. 실수가 아니라
-- 의도적으로 남긴 값이다. 마커가 dev DB 에 기록된 뒤에 파일을 리네임했기 때문에,
-- 마커 문자열을 '53_pricing_susi_restore_v1' 로 바꾸면 dev DB 에는 그 버전이
-- 없으므로 1-b 복구 UPDATE 의 `not exists` 가 다시 참이 되어 재실행 시
-- 운영자가 그 사이 바꾼 문구·노출순서·단종(is_active=false) 처리를 전부 되돌린다.
-- 파일명과 마커의 불일치는 그대로 두는 것이 정답이다.
--
-- 파일 번호 경위 (52 → 53)
-- ---------------------------------------------------------------------
-- 원래 이름은 52_pricing_susi_restore.sql 이었으나 접두어 52 가 이미 선점돼
-- 있어서 53 으로 리네임했다. goal-app-shell 브랜치가
-- sql/52_learning_diagnosis_path_move.sql 을 갖고 있고, 그 마커
-- '52_learning_diagnosis_path_move_v1' 이 dev DB schema_migrations 에
-- 2026-08-10 07:41:30 UTC 로 이미 적용돼 있다(= 우리 적용보다 먼저).
-- (접두어 중복 자체는 dev 에 전례가 있다: 50_admission_resource_index_official_url.sql
--  / 50_board_renewal.sql. 그래도 새로 겹치게 두지 않는다.)
-- 짝 파일 54_program_access_grant.sql 도 같은 이유로 53 → 54 로 밀렸다.
--
-- 2026-08-11 후속 — 지목 기준이 id → slug 로 바뀌었다
-- ---------------------------------------------------------------------
-- sql/56_surrogate_uuid_keys.sql 이 products.id / coupons.id 를 uuid 대체키로
-- 바꾸고 사람이 읽는 핸들을 slug 로 분리했다. 이 파일의 모든 문장(1-a insert,
-- 1-b VALUES 조인, 1-c 라벨 정정, 2) 쿠폰 유효기간)이 상품·쿠폰을 리터럴로
-- 지목하므로 전부 slug 기준으로 옮겼다 — id 는 이제 uuid 라 리터럴로 쓸 수
-- 없다. 지목 대상 자체는 그대로다(같은 3개 상품, 같은 1개 쿠폰):
--   'susi-30'     → slug 'susi-3'       (구 id 가 실제 3회권과 10배 어긋나 있었다)
--   'signup-6000' → slug 'signup-2000'  (구 id 가 실제 할인액 2,000원과 어긋나 있었다)
-- 마커('52_pricing_susi_restore_v1')는 그대로다 — 마커는 "이 파일이 이미
-- 적용됐는가"만 묻고 키 형식과 무관하다. 여전히 절대 고치지 마라(맨 위 🚨).
-- 1-b/1-c/2) 는 dev 에서 이미 0행이므로 이 치환이 dev 상태를 바꾸지 않는다.
--
-- 적용 상태: dev DB 적용 완료 (2026-08-10 14:30 UTC)
-- ---------------------------------------------------------------------
-- 대상: dev(gjowqdiopinhixfivnkx, 서울). 적용 후 실측 결과 —
--   * products susi 3행: is_active = false → true (행은 존재했다. 아래 1) 참조)
--   * susi-30 라벨: '[12개월 30회 이용권] 위닝 수시예측' → '[3회 이용권] 위닝 수시예측'
--   * 서비스 노출 순서: goal(1) → susi(2) → mentor(3) → suhaeng(4) → diagnose(99)
--   * coupons.signup-6000 valid_until: 2026-08-15 → 2026-12-31
--   * 금액 계열 보존 확인 — goal-1m 25,000 / goal-12m 180,000 /
--     suhaeng-1 3,500 / suhaeng-30 42,000 (운영자 조정값 그대로, 시드값으로
--     되돌아가지 않았다)
--   * 마커 '52_pricing_susi_restore_v1' 기록됨 → 1-b 는 이후 재실행에서 0행
-- 즉 이 파일의 SQL 문장은 DB 상태와 이미 짝이 맞다. 문장을 수정하면 파일과
-- DB 가 어긋나므로, 손볼 일이 생기면 새 번호의 후속 파일로 처리할 것.
--
-- 왜 이 파일이 필요한가
-- ---------------------------------------------------------------------
-- 1) /pricing · 주문서에 "위닝 수시예측" 서비스 블록 자체가 렌더되지 않는다.
--    src/lib/products.js 는 products 를 그대로 서비스별로 그룹핑하므로,
--    service_key='susi' 행이 하나도 조회되지 않으면 섹션이 사라진다.
--    2026-08-10 dev(gjowqdiopinhixfivnkx) anon 조회 결과 활성 상품 11건은
--    goal 4 / mentor 1 / suhaeng 5 / diagnose 1 이고 susi-1·susi-2·susi-30 이 없다.
--    (적용 시 실측 확인: 행 자체가 없던 게 아니라 3행 모두 is_active = false 여서
--     anon RLS 에 걸려 안 보인 것이었다. 아래 1) 참조.)
--    sql/10_pricing_orders.sql 의 시드는 `on conflict (id) do nothing` 이라
--    재실행으로는 복구되지 않는다 → 여기서 신규 삽입(1-a) + 마커 가드
--    UPDATE(1-b) 로 되살린다.
--
-- 2) susi-30 의 상품명이 '[12개월 30회 이용권] 위닝 수시예측' 인데
--    시안(1882-15614 / 1882-15190 / 1882-16307)은 '[3회 이용권] 위닝 수시예측' 이다.
--    시드 단계에서 suhaeng-30('[12개월 30회 이용권] 위닝 AI수행평가')의 라벨을
--    그대로 복사해 들어간 값으로 보인다. 시안 기준으로 정정한다.
--
-- 3) 시드 쿠폰 signup-6000 의 valid_until 이 '2026-08-15' 다. 오늘이 2026-08-10 이라
--    5일 뒤부터 주문서 쿠폰 목록이 0장이 된다(Checkout.jsx 는 is_active + valid_until
--    로만 거른다) → 유효기간을 연장한다.
--
-- 이 파일이 일부러 하지 않는 것 (중요)
-- ---------------------------------------------------------------------
-- * 기존 행의 list_price / price / badge / is_recommended 는 덮어쓰지 않는다.
--   dev DB 는 시드 이후 운영자가 직접 가격을 조정한 상태다
--   (예: goal-1m 30000→25000, goal-12m 할인 30%→40%, suhaeng-1 4900→3500).
--   api/create-order.js 가 products 를 결제 신뢰값으로 읽으므로 시드 금액을
--   되돌리면 실제 청구 금액이 바뀐다. 그래서 1-b 복구 UPDATE 의 set 절에는
--   금액 계열 컬럼을 넣지 않았고, 1-a insert 는 `on conflict do nothing` 이다
--   (= 행이 이미 있으면 금액은 DB 값 그대로 유지).
--   금액은 DB 가 정본, 문구·노출 순서는 시안이 정본이라는 분담이다.
-- * 시드 쿠폰 over200k-5000 은 다시 넣지 않는다. dev 에는 이 쿠폰 대신
--   운영자가 2026-07-31 에 만든 over40k-3000 / over80k-5000 이 있다.
--   되살리면 주문서 쿠폰 장수와 할인 조건이 임의로 늘어난다.
-- * signup-6000 의 discount_amount 도 건드리지 않는다. 시드는 6000 이지만
--   DB 현재값은 2000 이고, 그쪽이 운영 중인 값이다.
--
-- 멱등성 규약 (sql/README.md '재실행 시 데이터 보존 원칙')
-- ---------------------------------------------------------------------
-- README 첫 문장이 "파일명 접두어 순서대로 실행 / 모든 파일은 idempotent" 이므로
-- 전체 재실행(신규 환경 구축·운영 재생성)은 상정된 운용이다. 따라서 이 파일의
-- 복구 문장은 전부 "최초 1회만" 또는 "구 값에만 적중" 이어야 한다.
--   - 신규 삽입은 `on conflict (id) do nothing` (10번 시드와 동일 규약)
--   - 기존 행의 문구·분류·노출순서·is_active 복구는 `schema_migrations` 마커
--     ('52_pricing_susi_restore_v1' — 파일명이 53 이 된 뒤에도 이 문자열 그대로
--      유지한다. 맨 위 🚨 항목 참조) 로 최초 1회만. 30/32/50번에 선례가 있다.
--   - susi-30 라벨 정정과 쿠폰 유효기간 연장은 51번 방식대로 구 값 일치 where 절.
-- 이렇게 하지 않으면 운영자가 단종(`is_active=false`)·종료(valid_until 단축)
-- 처리한 상태가 파일 재실행으로 되살아나 실제 청구 금액이 바뀐다
-- (api/create-order.js 가 products 를 결제 신뢰값으로 읽는다).
-- =====================================================================

-- 마커 테이블 (20/30/32번과 동일 — 신규/부분 설치 대비 재선언)
create table if not exists public.schema_migrations (
  version     text primary key,
  applied_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 1) 수시예측 상품 3건 복구 + 라벨 정정
--
-- ✅ 확인됨 (2026-08-10 14:30 UTC dev 적용 시 실측): 작성 시점에는 anon 키로
--    products RLS("products public read" = is_active = true)를 넘을 수 없어서
--    susi-* 가 "행 자체가 없음"인지 "is_active = false 로 내려간 상태"인지
--    구분하지 못했고, 그래서 두 경우를 두 문장으로 나눠 각각 1회성으로 처리했다.
--      - 행이 없으면  → 1-a insert(on conflict do nothing) 로 신규 삽입
--      - 행이 있으면  → 1-b 마커 가드 UPDATE 로 최초 1회만 is_active 를 다시 켜고
--                       문구·순서를 시안값으로 맞춤 (금액은 위 주석대로 DB 값 유지)
--    실제 dev 는 후자였다 — susi-1/susi-2/susi-30 3행이 모두 존재하고
--    is_active = false 였다. 따라서 1-a insert 는 3행 전부 conflict 로 0행 삽입,
--    복구는 1-b UPDATE 가 수행했다(is_active → true).
--    insert 에 `do update` 를 쓰면 재실행마다 단종 처리(is_active=false)와
--    어드민이 고친 상품명이 되살아나므로 쓰지 않는다 — 이 판단은 유효하다.
--
-- ⚠️ 신규 삽입 경로로 들어갈 경우의 금액은 sql/10_pricing_orders.sql 시드값
--    그대로다(발명하지 않았다). 시안에서 실측한 금액이 아니므로 적용 후
--    /pricing 에서 육안 확인이 필요하다.
--    (dev 에서는 이 경로를 타지 않았다 — 3행이 이미 존재해 금액은 DB 값 유지.
--     신규 환경/운영 재생성 때만 이 시드 금액이 실제로 들어간다.)
--    다만 이 값들은 1/2/3회 이용권
--    가격 사다리와 자체 정합성이 있다:
--      1회 30,000 (정가=판매가)
--      2회 60,000 → 55,000 (약 8% 할인)
--      3회 90,000 → 80,000 (약 11% 할인)   ← 1회 30,000 × 3 = 90,000
--    즉 금액 쪽은 '3회 이용권'과 맞고, 어긋났던 건 라벨뿐이었다.
--
-- service_sort_order = 2 : 작성 시점 dev 의 서비스 순서가 goal 1 / (빈칸 2) /
--   mentor 3 / suhaeng 4 / diagnose 99 라 2번 슬롯이 그대로 비어 있었다.
--   운영자가 재번호를 매기지 않았으므로 시드의 2를 유지하면 목표관리 다음에
--   수시예측이 붙는다.
--   → 적용 후 실측: goal(1) → susi(2) → mentor(3) → suhaeng(4) → diagnose(99).
--     의도대로 빈 슬롯에 들어갔다.
-- ---------------------------------------------------------------------
-- 1-a) 행 자체가 없는 경우에만 신규 삽입.
insert into public.products
  (slug, service_key, service_name, service_desc, service_sort_order, sort_order, name, list_price, price, badge, is_recommended, is_active)
values
  ('susi-1',  'susi', '위닝 수시예측', '수시카드는 학생의 내신, 비교과 흐름, 진로 방향, 희망 대학을 종합해 수시 지원 전략을 설계하는 관리 서비스입니다. 지원 가능성, 보완점, 전형별 준비 방향을 함께 확인할 수 있습니다.', 2, 1, '[1회 이용권] 위닝 수시예측', 30000, 30000, null,        false, true),
  ('susi-2',  'susi', '위닝 수시예측', '수시카드는 학생의 내신, 비교과 흐름, 진로 방향, 희망 대학을 종합해 수시 지원 전략을 설계하는 관리 서비스입니다. 지원 가능성, 보완점, 전형별 준비 방향을 함께 확인할 수 있습니다.', 2, 2, '[2회 이용권] 위닝 수시예측', 60000, 55000, '약 8% 할인',  false, true),
  ('susi-3',  'susi', '위닝 수시예측', '수시카드는 학생의 내신, 비교과 흐름, 진로 방향, 희망 대학을 종합해 수시 지원 전략을 설계하는 관리 서비스입니다. 지원 가능성, 보완점, 전형별 준비 방향을 함께 확인할 수 있습니다.', 2, 3, '[3회 이용권] 위닝 수시예측', 90000, 80000, '약 11% 할인', true,  true)
on conflict (slug) do nothing;
-- ↑ 이미 존재하는 slug 는 이 문장이 절대 덮어쓰지 않는다(10번 시드와 동일 규약).
--   기존 행의 복구는 아래 1-b/1-c 가 담당한다.

-- ---------------------------------------------------------------------
-- 1-b) 이미 존재하던 susi-* 행 복구 — 마커로 최초 1회만
--
-- is_active 를 다시 켜고, 문구·분류·노출순서를 시안값으로 맞춘다.
-- 마커('52_pricing_susi_restore_v1')가 없을 때만 적중하므로,
-- 최초 실행 이후에는 운영자가 단종 처리(is_active=false)하거나 어드민에서
-- 고친 설명·순서를 재실행이 되돌리지 않는다.
-- ⚠️ 이 마커 문자열('52_...')은 파일명(53_...)과 어긋나 있지만 절대 고치지 마라.
--    이유는 파일 맨 위 '🚨 마커 문자열을 파일명에 맞춰 고치지 마라' 참조.
--    dev 에는 이미 기록돼 있어 이 UPDATE 는 지금 0행이다(2026-08-10 14:30 UTC 적용 시
--    3행 is_active false → true 로 실제 복구를 수행한 문장이 이것이다).
-- 금액 계열(list_price/price/badge/is_recommended)은 여기서도 건드리지 않는다.
--
-- sort_order 만 상품별로 달라서 VALUES 조인으로 준다(34/30번과 같은 방식).
-- 마커 기록(1-c 아래)은 위 1-a insert 가 3행의 존재를 보장한 뒤이므로
-- "대상 0건인데 마커만 남는" 30번식 함정은 발생하지 않는다.
-- ---------------------------------------------------------------------
update public.products p
   set service_key        = 'susi',
       service_name       = '위닝 수시예측',
       service_desc       = '수시카드는 학생의 내신, 비교과 흐름, 진로 방향, 희망 대학을 종합해 수시 지원 전략을 설계하는 관리 서비스입니다. 지원 가능성, 보완점, 전형별 준비 방향을 함께 확인할 수 있습니다.',
       service_sort_order = 2,
       sort_order         = v.sort_order,
       is_active          = true
  from (values
    ('susi-1', 1),
    ('susi-2', 2),
    ('susi-3', 3)
  ) as v(slug, sort_order)
 where p.slug = v.slug
   and not exists (
     select 1 from public.schema_migrations
     where version = '52_pricing_susi_restore_v1'
   );

-- ---------------------------------------------------------------------
-- 1-c) susi-30 라벨 정정 — 구 값에만 적중(51번 규약, 재실행 시 조용히 0행)
--      '[12개월 30회 이용권] 위닝 수시예측' → '[3회 이용권] 위닝 수시예측'.
--      마커와 무관하게 자연 멱등이며, 어드민이 다른 문구로 고친 뒤에는
--      구 값이 아니므로 다시 덮어쓰지 않는다.
-- ---------------------------------------------------------------------
update public.products
   set name = '[3회 이용권] 위닝 수시예측'
 where slug = 'susi-3'
   and name = '[12개월 30회 이용권] 위닝 수시예측';

insert into public.schema_migrations (version)
select '52_pricing_susi_restore_v1'
where not exists (
  select 1 from public.schema_migrations
  where version = '52_pricing_susi_restore_v1'
);

-- ---------------------------------------------------------------------
-- 2) 회원가입 쿠폰 유효기간 연장
--
-- 2026-08-15 만료 → 2026-12-31. 이 날짜는 정책상 확정된 값이 아니라,
-- "5일 뒤 주문서 쿠폰 섹션이 통째로 비는" 상황을 막기 위한 잠정 연장이다.
-- 실제 종료일이 정해지면 이 값을 갱신할 것.
-- (dev 는 2026-08-10 14:30 UTC 적용 완료 — signup-6000 이 2026-12-31 로 연장됐고
--  discount_amount 등 운영 값은 그대로다. 이후 재실행은 구 값 불일치로 0행.)
-- (무기한으로 갈 생각이면 아래 3-a 를 먼저 읽을 것 — 현재 코드에서 valid_until
--  이 null 인 쿠폰은 조회에서 빠지므로, null 로 두면 오히려 사라진다.)
-- id + 구 값(valid_until = '2026-08-15')으로만 좁혀서 update 하므로
-- discount_amount 등 운영 값은 그대로 남는다.
--
-- 멱등 가드가 부등호(valid_until < '2026-12-31')가 아니라 구 값 일치인 이유:
-- 51번 규약대로 "옛 값이 아직 남아 있는가"만 물어야 한다. 부등호로 두면
-- 이후 운영자가 넣은 어떤 종료일(예: 2026-09-30 조기 종료)에도 계속 적중해
-- 파일 재실행이 종료된 할인을 2026-12-31 로 되살린다 → 주문당 청구액이 바뀐다.
-- (valid_until is null 케이스는 dev 에 실존하지 않고, null 이면 아래 3-a 의
--  논의 대상이라 이 문장이 손댈 사안이 아니다.)
-- ---------------------------------------------------------------------
update public.coupons
   set valid_until = '2026-12-31'
 where slug = 'signup-2000'
   and valid_until = '2026-08-15';

-- ---------------------------------------------------------------------
-- 3-a) [선택 / 기본은 적용 안 함] valid_until 이 null 인 쿠폰은 지금 아무 데도
--      안 보인다.
--      Checkout.jsx 와 api/create-order.js 가 둘 다
--      `.gte('valid_until', today)` 로 거르는데, PostgREST/SQL 비교에서
--      null 은 이 조건을 통과하지 못한다. 그래서 dev 의
--      over40k-3000 / over80k-5000 (is_active = true, valid_until = null,
--      운영자가 2026-07-31 생성) 은 주문서 목록에도 안 뜨고, 코드로 직접
--      선택해도 서버 검증에서 탈락한다.
--
--      "무기한 쿠폰"을 의도한 것이었다면 아래 update 로 명시적 종료일을 주면
--      즉시 노출된다. 다만 이건 할인 정책이 바뀌는 변경(쿠폰 2장 추가 노출)이라
--      기본 적용하지 않고 주석으로 둔다. 필요하면 주석을 풀고 실행할 것.
--      (코드 쪽에서 `or(valid_until.is.null, valid_until.gte.today)` 로 고치는
--       방법도 있으나, 그건 이 마이그레이션의 범위가 아니다.)
--
-- update public.coupons
--    set valid_until = '2026-12-31'
--  where slug in ('over40k-3000', 'over80k-5000')
--    and valid_until is null;

-- ---------------------------------------------------------------------
-- 4) 적용 후 확인용 조회 (읽기 전용)
-- ---------------------------------------------------------------------
-- 수시예측 3건이 활성으로 잡히고 라벨이 '[N회 이용권]' 인지 확인.
select slug, id, service_key, service_sort_order, sort_order, name, list_price, price, badge, is_active
  from public.products
 where service_key = 'susi'
 order by sort_order;

-- 서비스 블록 순서 확인 (goal → susi → mentor → suhaeng → diagnose).
select service_sort_order, service_key, count(*) as products
  from public.products
 where is_active = true
 group by service_sort_order, service_key
 order by service_sort_order;

-- 오늘 기준으로 주문서에 노출될 쿠폰 (null valid_until 은 위 3-a 때문에 빠진다).
select slug, id, title, discount_amount, min_amount, valid_until, is_active
  from public.coupons
 where is_active = true
   and valid_until >= current_date
 order by discount_amount desc;
