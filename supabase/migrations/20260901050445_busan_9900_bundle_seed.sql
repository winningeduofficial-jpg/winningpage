-- 부산캠퍼스 번들 상품 4/4 — 시드
--
-- "9,900원 부산캠퍼스 특별할인 학습관리 서비스" — 위닝 부산캠퍼스 소속
-- 회원 전용, 학습진단 1회 + 목표관리 1개월 + 수행평가 2회를 상품 1행으로
-- 판매한다. program_key 는 NULL(products_entitlement_shape_check 는
-- program_key IS NULL 이면 무조건 통과 — bundle_items 가 권한을 대신
-- 정의하므로 이 상품 자체는 단일 권한을 갖지 않는다). 부분환불 없음(전체
-- 환불만, 이 마이그레이션 범위 밖 — fn_refund_quote 쪽 과제).
--
-- 판매 마감 2026-09-30T15:00:00Z = KST 2026-09-30 24:00(=10/1 00:00).
-- service_sort_order 는 기존 카탈로그 최솟값보다 앞(음수)으로 두어 특가
-- 섹션이 항상 최상단에 오게 한다.

do $$
declare
  v_sort       integer;
  v_product_id uuid;
begin
  select least(-1, coalesce(min(service_sort_order), 0) - 1)
    into v_sort
    from public.products;

  insert into public.products (
    slug, service_key, service_name, service_desc,
    service_sort_order,
    name, list_price, price,
    program_key, duration_months, session_quota, validity_days,
    is_active, is_orderable, is_recommended, badge,
    org_code, sale_ends_at
  ) values (
    'busan-9900', 'special', '부산캠퍼스 특별할인',
    '위닝 부산캠퍼스 소속 회원 전용 특별할인 패키지입니다. 학습진단 1회, 목표관리 1개월, 수행평가 2회를 한 번의 결제로 이용할 수 있습니다.',
    v_sort,
    '9,900원 부산캠퍼스 특별할인 학습관리 서비스', 40000, 9900,
    null, null, null, null,
    true, true, false, '75% 할인',
    '위닝부산캠퍼스', '2026-09-30T15:00:00Z'::timestamptz
  )
  on conflict (slug) do nothing;

  select id into v_product_id from public.products where slug = 'busan-9900';

  -- bundle_items 3행 — 정가 안분 기준(list_price)은 카탈로그 개별 상품
  -- 정가(학습진단 10,000 / 목표관리 25,000 / 수행평가 2회 5,000)를 그대로
  -- 쓴다. diagnose 는 기간 없는 1회권이라 validity_days=30(20260901001438
  -- 과 동일 관례). target 은 1개월. suhaeng 은 2회 + 1개월 유효(기간·회차
  -- 동시 보유).
  insert into public.bundle_items (
    product_id, program_key, duration_months, session_quota, validity_days, list_price
  ) values
    (v_product_id, 'diagnose', null, 1,    30,   10000),
    (v_product_id, 'target',   1,    null, null, 25000),
    (v_product_id, 'suhaeng',  1,    2,    null, 5000)
  on conflict (product_id, program_key) do update
    set duration_months = excluded.duration_months,
        session_quota   = excluded.session_quota,
        validity_days   = excluded.validity_days,
        list_price      = excluded.list_price;
end $$;
