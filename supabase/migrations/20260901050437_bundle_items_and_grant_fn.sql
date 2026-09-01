-- 부산캠퍼스 번들 상품 1/4 — bundle_items 테이블 + 부여 함수 확장
--
-- 왜: "9,900원 부산캠퍼스 특별할인" 은 상품 1행(products)이 학습진단 1회 +
-- 목표관리 1개월 + 수행평가 2회, 총 세 개의 이용 권한(program_key)을 동시에
-- 부여해야 한다. products.program_key 는 단일 권한 축이라 이 형태를 표현할
-- 수 없다 — bundle_items 로 "상품 1행 → 권한 N행" 확장 테이블을 둔다.

-- ---------------------------------------------------------------------
-- 1) public.bundle_items
-- ---------------------------------------------------------------------

create table if not exists public.bundle_items (
  product_id       uuid not null references public.products(id) on delete cascade,
  program_key      text not null references public.programs(program_key),
  duration_months  integer,
  session_quota    integer,
  validity_days    integer,
  list_price       integer not null,
  created_at       timestamptz not null default now(),
  constraint bundle_items_pkey primary key (product_id, program_key),
  constraint bundle_items_entitlement_shape_check
    check (coalesce(duration_months, session_quota) is not null),
  constraint bundle_items_validity_days_shape_check
    check (validity_days is null or duration_months is null),
  constraint bundle_items_duration_months_positive_check
    check (duration_months is null or duration_months > 0),
  constraint bundle_items_session_quota_positive_check
    check (session_quota is null or session_quota > 0),
  constraint bundle_items_validity_days_positive_check
    check (validity_days is null or validity_days > 0),
  constraint bundle_items_list_price_check
    check (list_price >= 0)
);

comment on table public.bundle_items is
  '패키지 상품(products) 1행이 부여하는 권한 목록. products.program_key(단일 권한) 의 다권한 확장 — 이 테이블에 행이 있는 product_id 는 fn_grant_program_access_for_order 가 이 테이블 행별로 program_access_grants 를 부여한다(products 자체의 program_key/duration_months/session_quota 는 이 경우 전부 NULL 로 둔다).';

comment on column public.bundle_items.list_price is
  '이 구성 권한의 개별 정가(원). paid_amount 안분 기준 — 번들 판매가(products.price)를 이 값들의 비율로 나눠 program_access_grants.paid_amount 에 배분한다(fn_grant_program_access_for_order).';

comment on constraint bundle_items_entitlement_shape_check on public.bundle_items is
  'products_entitlement_shape_check 와 동일 원칙 — 기간이나 회차 중 최소 하나는 있어야 한다.';

comment on constraint bundle_items_validity_days_shape_check on public.bundle_items is
  'products.validity_days 와 동일 원칙(20260901001438) — 유효기간은 기간이 없는 상품(회차권)의 속성이라 duration_months 와 동시 보유를 금지한다.';

alter table public.bundle_items enable row level security;

drop policy if exists "bundle_items_select_all" on public.bundle_items;
create policy "bundle_items_select_all"
  on public.bundle_items for select
  to anon, authenticated
  using (true);

comment on policy "bundle_items_select_all" on public.bundle_items is
  'products 와 동일한 공개 수준 — 카탈로그 조회는 누구나. 쓰기 정책은 없다(어드민 화면 없음, seed/수기 UPDATE 전용 — products 와 동일 운영 방식).';

-- ---------------------------------------------------------------------
-- 2) program_access_grants_live_item_uniq — order_item_id 단독 유니크를
--    (order_item_id, program_key) 복합으로 교체
--
--    왜: baseline(20260821000000)의 이 유니크 인덱스는 "라인 하나(order_
--    item_id)당 살아있는 부여 하나"를 전제한다. 번들 분기(아래 3절)는 상품
--    라인 하나가 bundle_items 행 수만큼(부산 9,900 은 3개) program_access_
--    grants 를 만든다 — order_item_id 는 세 행 모두 같으므로 원래 인덱스로는
--    두 번째 INSERT 부터 23505(program_access_grants_live_item_uniq)로
--    죽는다. 부분 인덱스 조건(order_item_id is not null and revoked_at is
--    null)은 그대로 두고 컬럼만 program_key 를 더해, "라인+권한 조합당
--    살아있는 부여 하나"로 좁힌다 — 단일 상품 경로(order_item_id 하나에
--    program_key 하나)는 의미가 그대로 보존된다.
-- ---------------------------------------------------------------------

drop index if exists public.program_access_grants_live_item_uniq;

create unique index program_access_grants_live_item_uniq
  on public.program_access_grants (order_item_id, program_key)
  where (order_item_id is not null and revoked_at is null);

-- ---------------------------------------------------------------------
-- 3) fn_grant_program_access_for_order — 번들 분기 추가
--
--    20260901001438 최신판 전체를 기반으로 재정의한다. 바뀌는 곳:
--      (a) 루프 안에서 v_item.product_id 에 bundle_items 행이 있으면
--          번들 분기로 — bundle_items 행별로 program_access_grants 를
--          부여한다(program_key/duration_months/session_quota/
--          validity_days 는 bundle_items 값, paid_amount 는 list_price
--          비율 안분 + 마지막 행 잔차 흡수).
--      (b) 없으면 기존 스칼라 경로 그대로 — 동작 불변.
--      (c) 멱등 가드(already_granted)·restore_revoked 가드를
--          order_item_id 단위에서 (order_item_id, program_key) 단위로
--          변경 — 번들 2번째·3번째 권한이 skip 되지 않게. 기존 단일
--          상품(경로 (b))은 v_item.program_key 하나뿐이라 의미 동일.
--    가드(WC010·WC011·WC033·WC034)·체이닝·suspended 판정·skipped 판정·
--    캐시 동기화는 원문 그대로다.
-- ---------------------------------------------------------------------

create or replace function public.fn_grant_program_access_for_order(
  p_order_id text,
  p_user_id uuid,
  p_paid_at timestamp with time zone default null,
  p_restore_revoked boolean default false
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_order        public.orders;
  v_existing     public.program_access;
  v_item         record;
  v_bundle       record;
  v_paid_at      timestamptz;
  v_anchor       timestamptz;
  v_start        timestamptz;
  v_expires      timestamptz;
  v_key          text;
  v_item_count   int    := 0;
  v_inserted     int    := 0;
  v_is_bundle    boolean;
  v_total_list   numeric;
  v_alloc        integer;
  v_skipped      jsonb  := '[]'::jsonb;
  v_service_keys text[] := '{}';
  v_blocked      text[] := '{}';
  v_keys         text[] := '{}';
  v_sync         jsonb  := '[]'::jsonb;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'WC010';
  end if;

  -- 결제자(학부모) 확인. p_user_id 는 호출부가 orders.user_id(=parent_
  -- profile_id, orders_user_id_is_parent_check)를 그대로 넘긴다.
  if v_order.parent_profile_id is distinct from p_user_id then
    raise exception 'order_user_mismatch' using errcode = 'WC011';
  end if;

  -- 2-a) R2c 상태 가드. 미승인·미결제 주문에는 권한을 줄 수 없다.
  if v_order.status <> 'paid' then
    raise exception 'order_not_paid'
      using errcode = 'WC033',
            detail  = format('order_id=%s status=%s', p_order_id, v_order.status);
  end if;

  -- 도달 불가에 가까운 방어적 가드(orders_approval_before_payment_check 가
  -- 이미 묶어 둔다) — baseline 원문 유지.
  if v_order.approval_status <> 'approved' then
    raise exception 'order_not_approved'
      using errcode = 'WC034',
            detail  = format('order_id=%s approval_status=%s', p_order_id, v_order.approval_status);
  end if;

  if v_order.student_profile_id is null then
    return jsonb_build_object(
      'ok', true, 'granted', '[]'::jsonb, 'service_keys', '[]'::jsonb,
      'skipped', jsonb_build_array(jsonb_build_object('reason', 'order_has_no_user')),
      'ledger_inserted', 0, 'synced', '[]'::jsonb);
  end if;

  -- 부여 대상(학생) 단위로 부여·회수를 직렬화한다(sql/64 salt=101).
  perform pg_advisory_xact_lock(hashtextextended(v_order.student_profile_id::text, 101));

  v_paid_at := coalesce(p_paid_at, v_order.paid_at, now());
  v_anchor  := public.fn_kst_day_start(v_paid_at);

  select count(*) into v_item_count from public.order_items where order_id = p_order_id;
  if v_item_count = 0 then
    return jsonb_build_object(
      'ok', false, 'error', 'no_order_items', 'granted', '[]'::jsonb,
      'service_keys', '[]'::jsonb, 'skipped', '[]'::jsonb,
      'ledger_inserted', 0, 'synced', '[]'::jsonb);
  end if;

  for v_item in
    select oi.id as order_item_id, oi.quantity, oi.price,
           oi.product_slug, oi.service_key,
           p.id as product_id, p.program_key, p.duration_months, p.session_quota,
           p.validity_days
      from public.order_items oi
      left join public.products p
             on p.id = oi.product_id
             or (oi.product_id is null and p.slug = oi.product_slug)
     where oi.order_id = p_order_id
     order by oi.id asc
  loop
    if v_item.service_key is not null
       and not (v_item.service_key = any(v_service_keys)) then
      v_service_keys := v_service_keys || v_item.service_key;
    end if;

    select exists(
      select 1 from public.bundle_items bi where bi.product_id = v_item.product_id
    ) into v_is_bundle;

    if not v_is_bundle and v_item.program_key is null then
      v_skipped := v_skipped || jsonb_build_object(
        'order_item_id', v_item.order_item_id, 'product_slug', v_item.product_slug,
        'service_key', v_item.service_key, 'program_key', null,
        'reason', 'no_program_key_mapping');
      continue;
    end if;

    if v_item.quantity <> 1 then
      v_skipped := v_skipped || jsonb_build_object(
        'order_item_id', v_item.order_item_id, 'product_slug', v_item.product_slug,
        'service_key', v_item.service_key, 'program_key', v_item.program_key,
        'reason', 'unsupported_quantity');
      continue;
    end if;

    if not v_is_bundle
       and v_item.duration_months is null and v_item.session_quota is null then
      raise exception 'product_entitlement_spec_missing'
        using errcode = 'WC012',
              detail  = format('order_item_id=%s product_slug=%s program_key=%s',
                               v_item.order_item_id, v_item.product_slug, v_item.program_key);
    end if;

    if v_is_bundle then
      -- 번들 분기 — bundle_items 행별로 부여한다. paid_amount 는 list_price
      -- 비율 안분(반올림), 마지막 행(program_key 오름차순)이 잔차를 흡수해
      -- 합계가 라인 결제액(price*quantity)과 정확히 일치하게 한다.
      select coalesce(sum(bi.list_price), 0) into v_total_list
        from public.bundle_items bi
       where bi.product_id = v_item.product_id;

      for v_bundle in
        select bi.program_key, bi.duration_months, bi.session_quota, bi.validity_days,
               row_number() over (order by bi.program_key) as rn,
               count(*) over () as cnt,
               coalesce(
                 sum(round(bi.list_price::numeric * (v_item.price * v_item.quantity) / nullif(v_total_list, 0)))
                   over (order by bi.program_key rows between unbounded preceding and 1 preceding),
                 0
               )::int as prior_alloc,
               round(bi.list_price::numeric * (v_item.price * v_item.quantity) / nullif(v_total_list, 0))::int as row_alloc
          from public.bundle_items bi
         where bi.product_id = v_item.product_id
         order by bi.program_key
      loop
        v_alloc := case when v_bundle.rn = v_bundle.cnt
                        then (v_item.price * v_item.quantity) - v_bundle.prior_alloc
                        else v_bundle.row_alloc
                   end;

        select * into v_existing
          from public.program_access
         where id = v_order.student_profile_id and program_key = v_bundle.program_key
           for update;

        if found and v_existing.access_status = 'suspended' then
          v_skipped := v_skipped || jsonb_build_object(
            'order_item_id', v_item.order_item_id, 'product_slug', v_item.product_slug,
            'service_key', v_item.service_key, 'program_key', v_bundle.program_key,
            'reason', 'suspended_by_admin');
          if not (v_bundle.program_key = any(v_blocked)) then
            v_blocked := v_blocked || v_bundle.program_key;
          end if;
          continue;
        end if;

        if not p_restore_revoked
           and exists (
             select 1 from public.program_access_grants g
              where g.order_item_id = v_item.order_item_id
                and g.program_key = v_bundle.program_key
                and g.revoked_at is not null
           ) then
          v_skipped := v_skipped || jsonb_build_object(
            'order_item_id', v_item.order_item_id, 'product_slug', v_item.product_slug,
            'service_key', v_item.service_key, 'program_key', v_bundle.program_key,
            'reason', 'revoked_not_restored');
          if not (v_bundle.program_key = any(v_blocked)) then
            v_blocked := v_blocked || v_bundle.program_key;
          end if;
          continue;
        end if;

        if exists (
          select 1 from public.program_access_grants g
           where g.order_item_id = v_item.order_item_id
             and g.program_key = v_bundle.program_key
             and g.revoked_at is null
        ) then
          v_skipped := v_skipped || jsonb_build_object(
            'order_item_id', v_item.order_item_id, 'product_slug', v_item.product_slug,
            'service_key', v_item.service_key, 'program_key', v_bundle.program_key,
            'reason', 'already_granted');
          continue;
        end if;

        select greatest(v_anchor, max(g.expires_at)) into v_start
          from public.program_access_grants g
         where g.profile_id  = v_order.student_profile_id
           and g.program_key = v_bundle.program_key
           and g.revoked_at is null;
        v_start := coalesce(v_start, v_anchor);

        v_expires := coalesce(
          public.fn_add_months_kst(v_start, v_bundle.duration_months),
          case when v_bundle.validity_days is not null
               then v_start + make_interval(days => v_bundle.validity_days)
          end);

        insert into public.program_access_grants (
          profile_id, program_key, order_id, order_item_id,
          product_id, product_slug, granted_by,
          granted_months, granted_sessions, paid_amount, starts_at, expires_at,
          validity_days
        ) values (
          v_order.student_profile_id, v_bundle.program_key, p_order_id, v_item.order_item_id,
          v_item.product_id, v_item.product_slug, 'payment',
          v_bundle.duration_months, v_bundle.session_quota,
          v_alloc,
          v_start, v_expires,
          v_bundle.validity_days
        );
        v_inserted := v_inserted + 1;
      end loop;

      continue;
    end if;

    -- 스칼라 경로(기존 단일 권한 상품) — 가드 키만 (order_item_id,
    -- program_key) 로 좁혔을 뿐 v_item.program_key 는 이 라인의 유일한
    -- 권한이라 결과는 원문과 동일하다.
    select * into v_existing
      from public.program_access
     where id = v_order.student_profile_id and program_key = v_item.program_key
       for update;

    if found and v_existing.access_status = 'suspended' then
      v_skipped := v_skipped || jsonb_build_object(
        'order_item_id', v_item.order_item_id, 'product_slug', v_item.product_slug,
        'service_key', v_item.service_key, 'program_key', v_item.program_key,
        'reason', 'suspended_by_admin');
      if not (v_item.program_key = any(v_blocked)) then
        v_blocked := v_blocked || v_item.program_key;
      end if;
      continue;
    end if;

    -- 2-b) R7 — restore_revoked 판정을 원장(program_access_grants)으로.
    if not p_restore_revoked
       and exists (
         select 1 from public.program_access_grants g
          where g.order_item_id = v_item.order_item_id
            and g.program_key = v_item.program_key
            and g.revoked_at is not null
       ) then
      v_skipped := v_skipped || jsonb_build_object(
        'order_item_id', v_item.order_item_id, 'product_slug', v_item.product_slug,
        'service_key', v_item.service_key, 'program_key', v_item.program_key,
        'reason', 'revoked_not_restored');
      if not (v_item.program_key = any(v_blocked)) then
        v_blocked := v_blocked || v_item.program_key;
      end if;
      continue;
    end if;

    if exists (
      select 1 from public.program_access_grants g
       where g.order_item_id = v_item.order_item_id
         and g.program_key = v_item.program_key
         and g.revoked_at is null
    ) then
      v_skipped := v_skipped || jsonb_build_object(
        'order_item_id', v_item.order_item_id, 'product_slug', v_item.product_slug,
        'service_key', v_item.service_key, 'program_key', v_item.program_key,
        'reason', 'already_granted');
      continue;
    end if;

    select greatest(v_anchor, max(g.expires_at)) into v_start
      from public.program_access_grants g
     where g.profile_id  = v_order.student_profile_id
       and g.program_key = v_item.program_key
       and g.revoked_at is null;
    v_start   := coalesce(v_start, v_anchor);

    -- 만료 파생(20260901 Ver10, §2-7) — 기간(개월)이 있으면 KST 달력 개월
    -- 덧셈, 없고 유효기간(일)이 있으면 시작 + 일수, 둘 다 없으면 무기한.
    -- fn_add_months_kst 는 p_months NULL 이면 NULL 을 돌려주는 규약이라
    -- coalesce 로 두 축이 자연스럽게 이어진다.
    v_expires := coalesce(
      public.fn_add_months_kst(v_start, v_item.duration_months),
      case when v_item.validity_days is not null
           then v_start + make_interval(days => v_item.validity_days)
      end);

    insert into public.program_access_grants (
      profile_id, program_key, order_id, order_item_id,
      product_id, product_slug, granted_by,
      granted_months, granted_sessions, paid_amount, starts_at, expires_at,
      validity_days
    ) values (
      v_order.student_profile_id, v_item.program_key, p_order_id, v_item.order_item_id,
      v_item.product_id, v_item.product_slug, 'payment',
      v_item.duration_months, v_item.session_quota,
      coalesce(v_item.price, 0) * coalesce(v_item.quantity, 1),
      v_start, v_expires,
      v_item.validity_days
    );
    v_inserted := v_inserted + 1;
  end loop;

  select coalesce(array_agg(distinct g.program_key), '{}')
    into v_keys
    from public.program_access_grants g
   where g.order_id = p_order_id
     and g.revoked_at is null
     and not (g.program_key = any(v_blocked));

  foreach v_key in array v_keys loop
    v_sync := v_sync || public.fn_sync_program_access_cache(v_order.student_profile_id, v_key, null);
  end loop;

  return jsonb_build_object(
    'ok',              true,
    'granted',         to_jsonb(v_keys),
    'service_keys',    to_jsonb(v_service_keys),
    'skipped',         v_skipped,
    'ledger_inserted', v_inserted,
    'synced',          v_sync
  );
end;
$$;

comment on function public.fn_grant_program_access_for_order(text, uuid, timestamp with time zone, boolean) is
  '주문 하나에 대해 이용 권한을 부여한다(sql/69 재작성 + 20260901001438 유효기간 + 20260901 부산캠퍼스 번들). product_id 가 bundle_items 에 행을 가진 라인은 그 행별로 program_access_grants 를 부여한다(program_key/duration_months/session_quota/validity_days 는 bundle_items 값, paid_amount 는 list_price 비율 안분 + program_key 오름차순 마지막 행 잔차 흡수) — 없으면 기존 스칼라 경로(products.program_key/duration_months/session_quota) 그대로. 멱등 가드(already_granted)·복구 가드(revoked_not_restored)는 (order_item_id, program_key) 단위로 판정해 번들 2·3번째 권한이 첫 권한 존재만으로 skip 되지 않게 한다(단일 상품 경로는 program_key 가 하나뿐이라 의미 동일, 동작 불변). 기간(duration_months)이 없는 상품은 validity_days(1회권 30일 등)를 expires_at = starts_at + N일 로 환산한다. 그 외(R2c 상태 가드·R7 원장 기반 restore_revoked·라인별 skipped·WC010~012·체이닝·suspended 판정)는 이전 정본과 동일.';
