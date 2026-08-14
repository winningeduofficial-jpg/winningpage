-- =====================================================================
-- coupons.id / products.id 를 uuid 대체키(surrogate key)로 전환 + slug 분리
-- Supabase SQL Editor 에서 실행하세요. (idempotent — 여러 번 실행해도 안전)
--
-- 적용 상태: dev DB(gjowqdiopinhixfivnkx, 서울) 적용 완료 (2026-08-11)
-- =====================================================================
--
-- 왜 — id 가 거짓말을 한다
-- ---------------------------------------------------------------------
-- 지금까지 두 테이블의 PK 는 사람이 읽는 의미(금액·회차)를 담은 text 였다.
-- 그 의미는 이미 두 곳에서 값과 어긋나 있다(적용 전 dev 실측):
--   · coupons.id = 'signup-6000'  이지만 discount_amount = 2000
--     (운영자가 6,000원 → 2,000원으로 내렸는데 id 는 6000 그대로)
--   · products.id = 'susi-30'     이지만 name = '[3회 이용권] 위닝 수시예측'
--     (sql/53_pricing_susi_restore.sql 1-c 가 '12개월 30회' 라벨을 3회로
--      정정했다 — 라벨은 고쳤지만 id 의 30 은 실제 3회의 10배 거짓말로 남았다)
-- 의미가 바뀌면 키를 바꿔야 하고, 키를 바꾸면 FK 마이그레이션이 필요해서
-- 아무도 손대지 않는다 — 그래서 거짓말이 방치됐다(sql/55_coupon_policy.sql
-- 상단 "P1-2 보류" 절이 개명을 보류하고 이 전환을 예고한 이유다).
-- 값이 바뀌어도 절대 흔들리지 않는 키(uuid)와, 사람이 읽고 고칠 수 있는
-- 핸들(slug)을 분리한다.
--
-- 왜 slug 가 취향이 아니라 필수인가
-- ---------------------------------------------------------------------
-- sql/ 시드는 `on conflict (id) do nothing` 으로 멱등성을 얻는다. id 가
-- uuid + gen_random_uuid() 가 되면 시드가 id 를 리터럴로 쓸 수 없고(삽입
-- 시점 생성이라 재실행마다 새 uuid = 중복 행), 충돌 대상으로 삼을 열도
-- 사라진다. 멱등 시드에는 "값이 아니라 정체를 가리키는 안정적 자연키"가
-- 필요하고 그게 slug 다 — sql/10_pricing_orders.sql 과
-- sql/53_pricing_susi_restore.sql 을 전부 `on conflict (slug) do nothing` /
-- `where slug = ...` 로 바꿨다. 어드민이 읽을 핸들도 이것이다.
--
-- 목표 형태
-- ---------------------------------------------------------------------
--   coupons.id    uuid  primary key  default gen_random_uuid()
--   coupons.slug  text  not null unique   -- 'signup-2000'(개명 반영),
--                                            'over40k-3000', 'over80k-5000'
--   products.id   uuid  primary key  default gen_random_uuid()
--   products.slug text  not null unique   -- 'susi-3'(id 거짓말 정정),
--                                            나머지는 기존 id 를 그대로 이관
--   orders.coupon_id              uuid  → coupons(id) on delete restrict
--   coupon_redemptions.coupon_id  uuid  → coupons(id) on delete restrict
--   order_items.product_id        uuid  → products(id) on delete set null
--                                        (관계 — 3)절 참고. 애초 "변경 없음"이
--                                        었으나 전제가 틀려 번복했다)
--   order_items.product_slug      text  (구매 시점 스냅샷, FK 없음, 값 불변)
--
-- slug 두 건만 값이 바뀐다 (사용자 확정, 2026-08-11)
-- ---------------------------------------------------------------------
--   'signup-6000' → slug 'signup-2000'  (실제 할인액 2,000원)
--   'susi-30'     → slug 'susi-3'       (실제 3회권)
-- 나머지 15건은 기존 id 를 slug 로 그대로 옮긴다. name·title(화면 문구)은
-- 건드리지 않는다 — 이 저장소의 화면 문구는 코퍼스 승인 대상이라 전환
-- 마이그레이션이 임의로 고칠 수 없다(id 의 거짓말은 slug 로 정정하고,
-- 문구의 정합은 문구 승인 절차로 정정한다는 분담이다).
--
-- 전제 — 이 파일을 먼저 적용해야 한다 (파일 번호 순서와 어긋나는 유일한 지점)
-- ---------------------------------------------------------------------
-- 전환 후의 sql/10·53 시드는 slug 를 참조하고, sql/55 의 함수들은 인자·반환이
-- uuid 다. 따라서 "전환 전 스키마(text id)를 가진 기존 DB" 에 저장소를 파일명
-- 순서대로 통째로 재실행하는 경로는 성립하지 않는다 — 53 이 없는 slug 열을
-- 찾고, 55 가 uuid 인자로 text 열을 비교하려 한다. 그 DB 에는 이 파일을 먼저
-- 1회 적용해야 한다(sql/55 상단에 그 전제를 검사해 실패시키는 가드를 넣었다 —
-- 조용히 어긋나는 것보다 즉시 멈추는 편이 낫다).
-- 지원되는 두 경로는 그대로 성립한다:
--   (A) 빈 DB → 파일명 순서대로 전부 실행. sql/10 이 처음부터 uuid + slug 로
--       테이블을 만들고, 이 파일의 전환 블록은 "이미 uuid" 라 no-op 이다.
--   (B) 전환이 끝난 DB(= 이 파일 1회 적용 후의 dev) → 이후 전체 재실행은
--       (A) 와 동일하게 전부 no-op/멱등.
-- 운영 반영은 dev 기준 재생성 경로를 따르므로 (A)/(B) 밖의 경로는 없다.
--
-- 멱등성 — 마커가 아니라 컬럼 타입으로 판정한다
-- ---------------------------------------------------------------------
-- 이 파일은 schema_migrations 마커(30/32/50/53번 방식)를 쓰지 않는다.
-- "이미 전환됐는가" 를 information_schema.columns 의 실제 데이터 타입으로
-- 물으면 마커 테이블의 상태와 스키마의 상태가 어긋날 여지가 없다(마커만 남고
-- 대상은 0건이던 30번식 함정이 구조적으로 불가능하다). 전환 블록은
-- `if data_type is distinct from 'text' then return; end if` 로 시작한다.
--
-- 롤백 — 이 전환은 되돌리지 않는다
-- ---------------------------------------------------------------------
-- 구 text id 를 복원하려면 slug 를 id 로 되돌리면 되지만(slug 는 구 id 를
-- 그대로 보존한다 — 위 두 건 제외), 되돌리는 순간 uuid 를 참조하던 orders /
-- coupon_redemptions 행이 다시 text 로 내려가야 하고 sql/10·53·55 도 전부
-- 되돌려야 한다. 실질적 롤백 수단은 "적용 전 스냅샷 복원" 이다. 그래서 이
-- 파일은 데이터를 보존하는 방향으로만 설계했다 — 아래 어디에도 DELETE 가
-- 없고, 금액·문구·상태 컬럼을 UPDATE 하지 않는다(slug 백필만 쓴다).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 전환 전용 헬퍼 (구 text id → 신 uuid 매핑). 파일 끝 4)절에서 삭제한다.
--
-- 왜 매핑 테이블 + 함수인가
--   부모(coupons.id)와 자식(orders.coupon_id, coupon_redemptions.coupon_id)이
--   같은 uuid 를 받아야 하므로 uuid 를 한 번만 뽑아 세 곳이 같은 값을 읽어야
--   한다. `alter table ... alter column ... type uuid using (...)` 의 USING
--   식에는 서브쿼리를 쓸 수 없다("cannot use subquery in transform
--   expression") — 함수 호출은 쓸 수 있어서 매핑 조회를 함수로 감싼다.
--   이 방식은 컬럼을 추가·삭제·리네임하지 않으므로 컬럼 순서(attnum)가
--   유지된다 — 빈 DB 에서 sql/10 이 만든 형태와 전환된 dev 의 형태가
--   컬럼 순서까지 같아진다(신규 컬럼 추가 후 rename 방식은 id 가 맨 뒤로
--   밀려 두 환경이 어긋난다).
-- ---------------------------------------------------------------------
create table if not exists public._wc_coupon_id_map (
  old_id text primary key,
  new_id uuid not null default gen_random_uuid()
);

create or replace function public._wc_coupon_uuid(p_old_id text)
returns uuid
language sql
stable
set search_path = public, pg_temp
as $fn$
  select m.new_id from public._wc_coupon_id_map m where m.old_id = p_old_id;
$fn$;

-- ---------------------------------------------------------------------
-- 1) products : slug 분리 + id → uuid
--
-- products.id 를 참조하는 FK 는 0개다(적용 전 dev 실측 — pg_constraint 에
-- products 를 참조하는 외래키가 없다. 이 시점의 order_items.product_id 는
-- 아직 FK 없는 스냅샷 컬럼이다 — 3)절이 이 절 뒤에 order_items.product_id 를
-- products 를 참조하는 FK 로 새로 만든다. 그래서 "그 FK 로 인해 이 절의
-- 전제가 깨지지 않는가"를 걱정할 수 있는데, 3)절은 이 절 다음에 실행되므로
-- 이 시점엔 아직 그 FK 가 존재하지 않는다). 그래서 PK 를 떼고 타입만 바꿔 다시 붙이면
-- 끝이고, 매핑 테이블도 필요 없다 — USING 에서 gen_random_uuid() 를 행마다
-- 평가시킨다(volatile 식도 USING 에서 정상 동작한다. dev 스크래치 테이블로
-- 직접 확인함).
-- ---------------------------------------------------------------------
do $$
declare
  v_type text;
begin
  select c.data_type into v_type
    from information_schema.columns c
   where c.table_schema = 'public' and c.table_name = 'products' and c.column_name = 'id';

  if v_type is distinct from 'text' then
    -- 이미 uuid(= 전환 완료 또는 sql/10 이 처음부터 uuid 로 만든 빈 DB).
    return;
  end if;

  -- 1-a) slug 확보 + 백필. susi-30 만 실제 회차(3회)로 정정하고 나머지는
  --      구 id 를 그대로 이관한다 — 즉 slug 는 구 id 의 보존본이기도 하다.
  alter table public.products add column if not exists slug text;
  update public.products
     set slug = case when id = 'susi-30' then 'susi-3' else id end
   where slug is null;

  -- 1-b) id → uuid.
  alter table public.products drop constraint products_pkey;
  alter table public.products alter column id type uuid using gen_random_uuid();
  alter table public.products alter column id set default gen_random_uuid();
  alter table public.products add constraint products_pkey primary key (id);
end $$;

-- slug 제약은 전환 블록 밖에 둔다 — 빈 DB(sql/10 이 이미 not null unique 로
-- 만든 경우)와 전환된 DB 양쪽에서 같은 최종 형태를 보장하는 멱등 문장이다.
alter table public.products alter column slug set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'products_slug_key' and conrelid = 'public.products'::regclass
  ) then
    -- 제약 이름을 sql/10 의 `slug text not null unique` 가 자동 생성하는
    -- 이름(products_slug_key)과 일부러 맞춘다 — 두 경로의 스키마가 제약
    -- 이름까지 동일해야 어드민·덤프 비교에서 드리프트로 보이지 않는다.
    alter table public.products add constraint products_slug_key unique (slug);
  end if;
end $$;

comment on column public.products.id is
  '대체키(surrogate key). 의미를 담지 않는다 — 사람이 읽는 핸들은 slug 다.';
comment on column public.products.slug is
  '사람이 읽는 안정 자연키. sql/ 시드의 멱등 충돌 대상이자 어드민 핸들. 구 text id 의 보존본이기도 하다(susi-30 → susi-3 만 실제 회차로 정정). 상품의 의미가 바뀌면 이 값을 고치고 id 는 그대로 둔다.';

-- ---------------------------------------------------------------------
-- 2) coupons : slug 분리 + id → uuid + 자식 FK 2개 동반 전환
--
-- 순서가 곧 정합성이다. FK 는 양쪽 타입이 같아야 존재할 수 있으므로
-- "FK 떼기 → 부모 전환 → 자식 전환 → FK 다시 붙이기" 를 한 트랜잭션(DO
-- 블록 하나)에서 끝낸다. 중간 상태가 커밋되지 않으므로 "부모는 uuid,
-- 자식은 text" 인 시점을 다른 세션이 볼 수 없다.
-- FK 정의(on delete restrict)는 sql/55_coupon_policy.sql 1-c)절이 확정한
-- 규칙을 그대로 복원한다 — 삭제 규칙을 이 전환이 바꾸지 않는다.
-- ---------------------------------------------------------------------
do $$
declare
  v_type text;
begin
  select c.data_type into v_type
    from information_schema.columns c
   where c.table_schema = 'public' and c.table_name = 'coupons' and c.column_name = 'id';

  if v_type is distinct from 'text' then
    return;
  end if;

  -- 2-a) slug 확보 + 백필. signup-6000 만 실제 할인액(2,000원)으로 정정.
  alter table public.coupons add column if not exists slug text;
  update public.coupons
     set slug = case when id = 'signup-6000' then 'signup-2000' else id end
   where slug is null;

  -- 2-b) 구 id → 신 uuid 매핑 확정. 부모·자식이 이 한 벌을 공유한다.
  insert into public._wc_coupon_id_map (old_id)
  select c.id from public.coupons c
  on conflict (old_id) do nothing;

  -- 2-c) FK 떼기. coupon_redemptions 는 sql/55 가 만드는 테이블이라
  --      아직 없을 수 있다(10 만 적용된 DB) — 존재 확인 후에만 손댄다.
  alter table public.orders drop constraint if exists orders_coupon_id_fkey;
  if to_regclass('public.coupon_redemptions') is not null then
    alter table public.coupon_redemptions drop constraint if exists coupon_redemptions_coupon_id_fkey;
  end if;

  -- 2-d) 부모 전환.
  alter table public.coupons drop constraint coupons_pkey;
  alter table public.coupons alter column id type uuid using public._wc_coupon_uuid(id);
  alter table public.coupons alter column id set default gen_random_uuid();
  alter table public.coupons add constraint coupons_pkey primary key (id);

  -- 2-e) 자식 전환. NULL 은 매핑 함수가 NULL 을 돌려주므로 그대로 NULL 이다
  --      (쿠폰 없는 주문이 깨지지 않는다).
  alter table public.orders alter column coupon_id type uuid using public._wc_coupon_uuid(coupon_id);
  if to_regclass('public.coupon_redemptions') is not null then
    alter table public.coupon_redemptions
      alter column coupon_id type uuid using public._wc_coupon_uuid(coupon_id);
  end if;

  -- 2-f) FK 복원 (sql/55 1-c)절과 동일한 삭제 규칙).
  alter table public.orders
    add constraint orders_coupon_id_fkey
    foreign key (coupon_id) references public.coupons (id) on delete restrict;
  if to_regclass('public.coupon_redemptions') is not null then
    alter table public.coupon_redemptions
      add constraint coupon_redemptions_coupon_id_fkey
      foreign key (coupon_id) references public.coupons (id) on delete restrict;
  end if;
end $$;

alter table public.coupons alter column slug set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'coupons_slug_key' and conrelid = 'public.coupons'::regclass
  ) then
    alter table public.coupons add constraint coupons_slug_key unique (slug);
  end if;
end $$;

comment on column public.coupons.id is
  '대체키(surrogate key). 의미를 담지 않는다 — 사람이 읽는 핸들은 slug 다.';
comment on column public.coupons.slug is
  '사람이 읽는 안정 자연키. sql/ 시드의 멱등 충돌 대상이자 어드민 핸들. 구 text id 의 보존본이기도 하다(signup-6000 → signup-2000 만 실제 할인액으로 정정). 할인액이 바뀌면 이 값을 고치고 id 는 그대로 둔다.';

-- ---------------------------------------------------------------------
-- 3) order_items : product_id 를 관계(FK)로, product_slug 를 스냅샷으로 분리
--
-- 애초 이 절은 "product_id 는 바꾸지 않는다"였다 — 그런데 그 전제가 틀렸다.
-- api/create-order.js 는 products.slug 를 조회하지도, p_items 에 싣지도
-- 않았고 실제로는 products.id(당시 text, 지금은 uuid)를 그대로 넘긴다
-- (api/create-order.js:76, :113). 즉 이 전환 이후 생성되는 주문은
-- order_items.product_id(text) 에 uuid 문자열이 들어가 기존 slug 값
-- ('goal-1m' 등)과 한 컬럼에 섞인다 — 방치하면 정산 담당자가 값만 보고는
-- slug 인지 uuid 인지 구분할 수 없다.
--
-- 그래서 관계와 스냅샷을 컬럼으로 분리한다:
--   product_id    uuid  → products(id) on delete set null   (카탈로그 조인용)
--   product_slug  text  (구매 시점 스냅샷, FK 없음, 값 불변)
-- restrict 가 아니라 set null 인 이유 — restrict 면 한 번이라도 팔린 상품을
-- 영구히 삭제할 수 없어 어드민이 soft-delete 만 쓸 수 있게 된다. product_id 가
-- null 이 되어도 product_slug 스냅샷이 남으므로 정산·환불 대응에 필요한
-- "무엇을 샀는가"는 여전히 사람이 읽을 수 있다. 상품이 단종·개명·가격
-- 개편돼도 과거 주문 기록이 흔들리지 않아야 한다는 원래 취지(스냅샷)는
-- product_slug 가 그대로 잇는다.
--
-- 백필 — 기존 2행('goal-1m', 'mentor-1')은 이미 products.slug 와 정확히
-- 일치한다(적용 전 dev 실측, 2/2 클린 매칭). 마이그레이션 이후 생성된 주문은
-- 0건이라 uuid 가 slug 자리에 들어간 오염 행은 존재하지 않는다. 그래도
-- 방어적으로, slug 가 products.slug 와 매칭되지 않는 행이 있으면 조용히
-- null 로 넘기지 않고 RAISE WARNING 으로 드러낸다 — 백필 결과를 사람이
-- 확인해야 한다.
-- ---------------------------------------------------------------------
do $$
declare
  v_id_type  text;
  v_has_slug boolean;
begin
  select c.data_type into v_id_type
    from information_schema.columns c
   where c.table_schema = 'public' and c.table_name = 'order_items' and c.column_name = 'product_id';

  select exists (
    select 1 from information_schema.columns c
     where c.table_schema = 'public' and c.table_name = 'order_items' and c.column_name = 'product_slug'
  ) into v_has_slug;

  if v_id_type = 'uuid' and v_has_slug then
    -- 이미 전환 완료(재실행) 또는 sql/10 이 처음부터 이 형태로 만든 빈 DB.
    return;
  end if;

  if v_id_type = 'text' and not v_has_slug then
    -- 3-a) 기존 text 컬럼을 슬러그 스냅샷으로 이름만 바꾼다(값 보존).
    alter table public.order_items rename column product_id to product_slug;
  end if;

  -- 3-b) 관계용 uuid 컬럼 신설(재실행 안전 — 이미 있으면 스킵).
  alter table public.order_items
    add column if not exists product_id uuid references public.products (id) on delete set null;

  -- 3-c) slug 로 uuid 백필(아직 비어 있는 행만 — 재실행해도 덮어쓰지 않는다).
  update public.order_items oi
     set product_id = p.id
    from public.products p
   where p.slug = oi.product_slug
     and oi.product_id is null;

  -- 3-d) 매칭 안 된 행이 있으면 조용히 null 로 넘기지 않고 알린다.
  if exists (
    select 1 from public.order_items where product_slug is not null and product_id is null
  ) then
    raise warning 'order_items 백필 경고: product_slug 가 products.slug 와 매칭되지 않는 행이 있다(수동 확인 필요).';
  end if;
end $$;

create index if not exists order_items_product_id_idx on public.order_items (product_id);

comment on column public.order_items.product_id is
  '관계(FK). products.id(uuid) 참조, on delete set null — restrict 로 걸면 한 번이라도 팔린 상품을 영구히 삭제할 수 없어 어드민이 soft-delete 만 쓸 수 있게 된다. 카탈로그 조인(현재가·상태 조회)에 쓴다.';
comment on column public.order_items.product_slug is
  '구매 시점 상품 식별자 스냅샷(products.slug). FK 가 없다 — 상품이 단종·개명·가격 개편되거나 product_id 가 on delete set null 로 비어도, 이 값은 바뀌지 않아 정산·환불 대응에 필요한 "무엇을 샀는가"를 사람이 읽을 수 있다(sql/56_surrogate_uuid_keys.sql 3)절).';

-- ---------------------------------------------------------------------
-- 4) 전환 전용 헬퍼 정리. 여기까지 오면 매핑은 스키마에 반영이 끝났고
--    다시 필요할 일이 없다(재실행 시 1)/2)절은 타입 가드로 no-op).
-- ---------------------------------------------------------------------
drop function if exists public._wc_coupon_uuid(text);
drop table if exists public._wc_coupon_id_map;

-- =====================================================================
-- 5) 확인용 조회 (읽기 전용 — 실행 후 눈으로 볼 것)
-- =====================================================================
-- uuid ↔ slug 매핑과 가격 보존 확인.
-- select id, slug, service_key, name, list_price, price, badge, is_active
--   from public.products order by service_sort_order, sort_order;
-- select id, slug, title, discount_amount, min_amount, valid_until,
--        is_active, max_uses_per_user, max_redemptions, stackable
--   from public.coupons order by slug;
--
-- 주문 1행이 새 uuid 를 가리키는지 + 할인액 보존.
-- select o.id, o.coupon_id, c.slug, o.discount_amount, o.amount
--   from public.orders o left join public.coupons c on c.id = o.coupon_id;
--
-- order_items 최종 형태 — product_id(uuid) 가 채워지고 product_slug(text) 가
-- 원래 slug 값을 보존하는지, 카탈로그 조인이 되는지.
-- select oi.id, oi.order_id, oi.product_id, oi.product_slug, oi.service_key, oi.name,
--        p.slug as joined_slug, p.name as joined_name
--   from public.order_items oi left join public.products p on p.id = oi.product_id
--  order by oi.id;
--
-- 최종 형태(타입·제약).
-- select table_name, column_name, data_type, column_default, is_nullable
--   from information_schema.columns
--  where table_schema = 'public'
--    and (table_name, column_name) in (
--          ('products','id'), ('products','slug'),
--          ('coupons','id'), ('coupons','slug'),
--          ('orders','coupon_id'), ('coupon_redemptions','coupon_id'),
--          ('order_items','product_id'), ('order_items','product_slug'))
--  order by table_name, column_name;
--
-- order_items → products FK(on delete set null)가 생겼는지.
-- select conname, confrelid::regclass, confdeltype
--   from pg_constraint
--  where conrelid = 'public.order_items'::regclass and contype = 'f';
