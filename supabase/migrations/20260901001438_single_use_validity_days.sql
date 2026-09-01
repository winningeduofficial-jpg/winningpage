-- =====================================================================
-- 환불 Ver10 2/3 — 1회권 유효기간 30일 (제33조의1 ⑤·⑥, §2-7)
--
-- 고객사 회신(2026-08-31 저녁)으로 범위 확정: 30일 유효기간은 "기간이
-- 정해져 있지 않은 1회차 이용권"(diagnose-1 · mentor-1 · suhaeng-1)에만
-- 적용된다. 회차권(suhaeng-6/14/30)·기간제·혼합 상품은 대상이 아니다.
--
-- 소급 없음(§2-7 권장 유지): 무기한 → 30일은 회원에게 불리한 변경이므로
-- 시행일 이후 부여분부터만 적용한다. 기존 살아있는 grant 는 backfill 하지
-- 않는다 — 이 파일에는 program_access_grants 의 기존 행 UPDATE 가 없다.
--
-- 배선 원리: 소비 게이트(consume_performance_credit · consume_diagnosis_
-- attempt)와 요약(fn_program_access_grants_summary)·입장 판정(fn_program_
-- access_state)은 이미 expires_at 만 본다. 부여 시 expires_at 을 채우면
-- 만료 강제는 추가 배선 없이 따라온다(§2-7). 산정 쪽 만료 0원 처리는
-- 3/3(fn_refund_quote v10)이 맡는다.
--
-- 만료 7일 전 전자적 통지(⑥)는 통지 인프라가 없어 이번 범위 밖이다 —
-- 설계 문서 §1 #7 미구현 항목으로 남는다.
-- =====================================================================

-- 1) products.validity_days — 상품 정의. 기간(개월)과 동시 보유는 금지한다
--    (유효기간은 "기간이 정해져 있지 않은" 이용권의 속성이다 — 회신 문언).
alter table public.products
  add column if not exists validity_days integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'products_validity_days_positive_check'
       and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_validity_days_positive_check
      check (validity_days is null or validity_days > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'products_validity_days_shape_check'
       and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_validity_days_shape_check
      check (validity_days is null or duration_months is null);
  end if;
end $$;

comment on column public.products.validity_days is
  '기간이 정해져 있지 않은 회차 이용권의 유효기간(일). 제33조의1 ⑤ — 1회권은 구매일부터 30일. duration_months 와 동시 보유 금지(유효기간은 기간이 없는 상품의 속성). NULL = 유효기간 없음.';

-- 기간이 없는 1회차 이용권에 30일을 건다(diagnose-1 · mentor-1 · suhaeng-1).
-- slug 하드코딩 대신 상품 모양(기간 없음 + 1회)으로 지정한다 — 같은 모양의
-- 상품이 새로 생기면 약관도 같은 조항이 적용된다.
update public.products
   set validity_days = 30
 where duration_months is null
   and session_quota = 1
   and validity_days is null;

-- 2) program_access_grants.validity_days — 부여 시점 스냅샷(granted_months ·
--    granted_sessions 와 같은 원칙: 상품 정의가 나중에 바뀌어도 이미 판
--    조건은 바뀌지 않는다).
alter table public.program_access_grants
  add column if not exists validity_days integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'pag_validity_days_positive_check'
       and conrelid = 'public.program_access_grants'::regclass
  ) then
    alter table public.program_access_grants
      add constraint pag_validity_days_positive_check
      check (validity_days is null or validity_days > 0);
  end if;
end $$;

comment on column public.program_access_grants.validity_days is
  '부여 시점 products.validity_days 스냅샷(1회권 30일, 제33조의1 ⑤). 이 컬럼이 생기기 전(20260901)에 부여된 1회권은 NULL = 무기한 그대로다 — 불리 변경 비소급(§2-7).';

-- 3) pag_expiry_derivation_check 완화 — 기존 "(개월 NULL) = (만료 NULL)" 은
--    유효기간 축이 생기면 거짓이 된다(1회권: 개월 NULL 인데 만료 있음).
alter table public.program_access_grants
  drop constraint if exists pag_expiry_derivation_check;

alter table public.program_access_grants
  add constraint pag_expiry_derivation_check
  check ((granted_months is null and validity_days is null) = (expires_at is null));

comment on constraint pag_expiry_derivation_check on public.program_access_grants is
  '만료는 기간(granted_months) 또는 유효기간(validity_days)에서만 파생된다. 둘 다 NULL 이면 무기한(expires_at NULL) — 20260901 에 validity_days 축을 더해 완화(§2-7). 이 완화 전에 부여된 1회권(둘 다 NULL·만료 NULL)은 그대로 유효하다.';

-- 4) fn_grant_program_access_for_order — 부여 시 유효기간을 만료로 환산한다.
--    baseline:1644 원문에서 바뀌는 곳은 셋뿐이다:
--      (a) 상품 조회에 p.validity_days 추가
--      (b) v_expires 계산 — 기간이 없으면 starts_at + validity_days
--      (c) INSERT 에 validity_days 스냅샷 추가
--    가드(WC010·WC011·WC033·WC034)·체이닝·skipped 판정·캐시 동기화는 원문
--    그대로다. 시그니처가 같으므로 CREATE OR REPLACE 로 충분하다.
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
  v_paid_at      timestamptz;
  v_anchor       timestamptz;
  v_start        timestamptz;
  v_expires      timestamptz;
  v_key          text;
  v_item_count   int    := 0;
  v_inserted     int    := 0;
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

    if v_item.program_key is null then
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

    if v_item.duration_months is null and v_item.session_quota is null then
      raise exception 'product_entitlement_spec_missing'
        using errcode = 'WC012',
              detail  = format('order_item_id=%s product_slug=%s program_key=%s',
                               v_item.order_item_id, v_item.product_slug, v_item.program_key);
    end if;

    -- 부여 대상은 학생이다(사용자 확정 5번) — v_order.student_profile_id.
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
          where g.order_item_id = v_item.order_item_id and g.revoked_at is not null
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
       where g.order_item_id = v_item.order_item_id and g.revoked_at is null
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
  '주문 하나에 대해 이용 권한을 부여한다(sql/69 재작성 + 20260901 Ver10 유효기간). 기간(duration_months)이 없는 상품은 products.validity_days(1회권 30일, 제33조의1 ⑤)를 expires_at = starts_at + N일 로 환산해 부여한다 — 소비 게이트·요약·입장 판정이 이미 expires_at 만 보므로 만료 강제는 이 한 줄로 따라온다(§2-7). 그 외(R2c 상태 가드·R7 원장 기반 restore_revoked·라인별 skipped·WC010~012·체이닝·suspended 판정)는 이전 정본과 동일.';
