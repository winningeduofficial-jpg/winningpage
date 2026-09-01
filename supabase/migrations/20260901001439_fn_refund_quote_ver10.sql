-- =====================================================================
-- 환불 Ver10 3/3 — 산정·신청·회수·완료 함수 일괄 재작성
-- (docs/refund-quote-ver10-design.md §3-1·§3-2·§3-3 3번)
--
-- 한 파일에 묶는 이유: 다섯 함수가 서로 시그니처를 참조한다(신청·완료가
-- 산정을 부르고, 완료가 회수를 부른다). 쪼개면 중간 상태가 깨진다.
--
-- 약관 근거는 8/30 제자리 개정본(refund_policy v2 실문안, dev 활성 v3) —
-- 제32조 · 제33조의1(②계단·④~⑥ 1회권·⑦기간제·⑧회차제·⑪장기할인) ·
-- 제33조의2(⑤안분·⑥3단계·⑦조건부 할인) · 제33조의3(⑤쿠폰 복원).
-- 고객사 회신(8/31)으로 혼합 상품=회차제, 30일=1회권 한정 확정(갱신 3).
--
-- Ver9 대비 산식 변경 요약
--   배분    paid_amount 비율 내림 → 개별 정가 비율 절상(제33조의2 ⑤)
--   절사    라인 내림 + 합산 100원 내림 → 전 단계 원 단위 절상(⑤ ※)
--   기간제  시작한 달 전액 차감 → P − L×(k+c) (②-3호 계단 + ⑪, §2-4)
--   예외    회사 귀책·청약철회 7일 내는 정가 재산정 면제(⑪ 예외, L=M)
--   만료    expires_at 경과 라인은 0(⑤·⑥ — 1회권 30일은 2/3 마이그레이션)
--   부분    order_item_ids 로 구성서비스 단위 해지(제33조의2 ②)
--   쿠폰    전부 청약철회 시 사용 이력 자동 복원(제33조의3 ⑤)
--
-- 신규 오류 코드
--   WC060 refund_items_invalid            대상 항목이 주문에 없거나 살아있는 부여가 없다
--   WC061 refund_request_items_overlap    열린 신청과 대상 항목이 겹친다
--   WC062 refund_requote_terms_v9         v9 산정 건은 재산정 금지(§3-4)
--   WC063 refund_requote_decrease         재산정 감액은 어드민 단독 갱신 불가(§2-9 권장)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) fn_refund_quote — 인자가 늘어나므로 DROP 후 재생성(오버로드 공존 시
--    PostgREST 후보 충돌, 20260822000001 선례).
-- ---------------------------------------------------------------------
drop function if exists public.fn_refund_quote(text);

create function public.fn_refund_quote(
  p_order_id       text,
  p_order_item_ids bigint[]    default null,
  p_company_fault  boolean     default false,
  p_at             timestamptz default now()
) returns table (
  order_id             text,
  gross_amount         integer,
  refund_amount        integer,
  fee_amount           integer,
  started              boolean,
  needs_review         boolean,
  policy_code          text,
  lines                jsonb,
  scope                text,
  terms_version        text,
  within_withdrawal    boolean,
  company_fault        boolean,
  bundle_return_amount integer,
  coupon_restore       boolean
)
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_order        public.orders;
  v_caller       uuid := auth.uid();
  v_items        bigint[];
  v_scope        text;
  v_sum_list     bigint := 0;   -- 정가 합계액(주문의 모든 order_items, 회수 라인 포함)
  v_grant_count  integer := 0;  -- 대상 라인 수
  v_live_count   integer := 0;  -- 주문 전체의 살아있는 라인 수
  v_line_list    integer;       -- 개별 정가
  v_line_paid    integer;       -- 안분결제액 P_i
  v_step2        integer;       -- 제33조의1 적용 결과(공제 전)
  v_line_refund  integer;
  v_used         integer;
  v_ratio        numeric;
  v_months       integer;
  v_k            integer;       -- 완료 개월 수
  v_c            numeric;       -- 해당 월 계단 차감률(0 · 1/3 · 1/2 · 1)
  v_monthly      numeric;       -- L(정가 월액) 또는 M(안분 월액, ⑪ 예외)
  v_ms           timestamptz;
  v_me           timestamptz;
  v_wd           boolean;
  v_all_wd       boolean := true;
  v_all_before   boolean := true;
  v_cap          integer;
  v_code         text;
  v_started      boolean := false;
  v_review       boolean := false;
  v_sum_refund   bigint := 0;
  v_bundle_sum   integer := 0;
  v_codes        text[] := '{}';
  v_lines        jsonb := '[]'::jsonb;
  v_idx          integer := 0;
  v_restore      boolean := false;
  g              record;
begin
  select * into v_order from public.orders o where o.id = p_order_id;

  -- 소유권 — fn_request_refund 와 같은 쌍 판정(존재 스캐닝 방지, Ver9 유지).
  if v_order.id is null
     or (v_caller is distinct from v_order.student_profile_id
         and v_caller is distinct from v_order.parent_profile_id
         and not public.is_admin()) then
    raise exception 'order_not_found_or_not_owned' using errcode = 'WC005';
  end if;

  if v_order.status <> 'paid' then
    raise exception 'order_not_refundable' using errcode = 'WC006';
  end if;

  -- 대상 항목 정규화 — 중복 제거. 빈 배열은 신청이 아니다.
  if p_order_item_ids is not null then
    select array_agg(distinct x order by x) into v_items
      from unnest(p_order_item_ids) x;
    if v_items is null then
      raise exception 'refund_items_invalid'
        using errcode = 'WC060', detail = 'order_item_ids is empty';
    end if;
    -- 주문 밖의 항목은 거부한다.
    if exists (
      select 1 from unnest(v_items) x
       where not exists (
         select 1 from public.order_items oi
          where oi.id = x and oi.order_id = p_order_id)
    ) then
      raise exception 'refund_items_invalid'
        using errcode = 'WC060',
              detail  = format('order_id=%s items=%s — 주문에 속하지 않는 항목', p_order_id, v_items);
    end if;
    -- 살아있는 부여가 없는 항목(이미 회수됐거나 부여 자체가 없던 라인)은
    -- 환불할 실체가 없다.
    if exists (
      select 1 from unnest(v_items) x
       where not exists (
         select 1 from public.program_access_grants pg
          where pg.order_item_id = x and pg.revoked_at is null)
    ) then
      raise exception 'refund_items_invalid'
        using errcode = 'WC060',
              detail  = format('order_id=%s items=%s — 살아있는 부여가 없는 항목', p_order_id, v_items);
    end if;
  end if;

  select count(*) into v_live_count
    from public.program_access_grants pg
   where pg.order_id = p_order_id and pg.revoked_at is null;

  -- 대상이 살아있는 라인 전부를 덮으면 주문 전체 신청으로 승격한다 —
  -- "전부 해지" 판정(⑦-5 다목, 제33조의3 ⑤)과 유니크 인덱스 축이 한
  -- 표현으로 모인다(§2-10). RefundRequestModal 의 전체 선택도 이 경로다.
  if v_items is not null
     and not exists (
       select 1 from public.program_access_grants pg
        where pg.order_id = p_order_id
          and pg.revoked_at is null
          and not (pg.order_item_id = any(v_items))
     ) then
    v_items := null;
  end if;

  v_scope := case when v_items is null then 'order' else 'items' end;

  -- 부여 원장이 없는 주문 — 산정 근거 없음. 전액 + 검토 플래그(Ver9 유지).
  if v_live_count = 0 then
    return query select
      v_order.id, v_order.amount, v_order.amount, 0,
      false, true, 'no_grant'::text, '[]'::jsonb,
      'order'::text, 'v10'::text, null::boolean, p_company_fault, 0, false;
    return;
  end if;

  -- 정가 합계액(제33조의2 ⑤ 분모) — 주문의 모든 order_items. 회수된 라인도
  -- 포함한다: 분모는 주문 시점에 고정돼야 부분환불을 거듭해도 배분이 흔들리지
  -- 않는다(§3-1 1단계).
  select coalesce(sum(oi.list_price::bigint * oi.quantity), 0) into v_sum_list
    from public.order_items oi
   where oi.order_id = p_order_id;

  select count(*) into v_grant_count
    from public.program_access_grants pg
   where pg.order_id = p_order_id
     and pg.revoked_at is null
     and (v_items is null or pg.order_item_id = any(v_items));

  for g in
    select pg.id, pg.program_key, pg.product_slug, pg.paid_amount,
           pg.granted_months, pg.granted_sessions, pg.validity_days,
           pg.starts_at, pg.expires_at, pg.first_accessed_at,
           pg.order_item_id,
           oi.list_price, oi.quantity, oi.name as item_name
      from public.program_access_grants pg
      left join public.order_items oi on oi.id = pg.order_item_id
     where pg.order_id = p_order_id
       and pg.revoked_at is null
       and (v_items is null or pg.order_item_id = any(v_items))
     order by pg.id
  loop
    v_idx := v_idx + 1;

    v_line_list := coalesce(g.list_price, 0) * coalesce(g.quantity, 1);

    -- 1·2단계 — 안분결제액 P_i = 실결제액 × 개별 정가 / 정가 합계액, 절상
    -- (제33조의2 ⑤, ※ 절상 차액은 회사 부담). 정가 0 라인은 무상 취득분
    -- (제33조의3 ⑥) — 배분 0. 정가 합계 0은 orders_amount_check 상 도달
    -- 불가지만, 그래도 오면 사람이 보게 검토 플래그만 세운다.
    if v_sum_list > 0 then
      v_line_paid := ceil(v_order.amount::numeric * v_line_list / v_sum_list)::integer;
    else
      v_line_paid := ceil(v_order.amount::numeric / v_grant_count)::integer;
      v_review := true;
    end if;

    -- 청약철회기간(제32조 ①, 7일) — 기산은 이용 가능일(starts_at)과 결제
    -- 시각 중 늦은 쪽(§2-9: 재구매 체이닝으로 starts_at 이 미래일 수 있다).
    v_wd := p_at < greatest(g.starts_at, coalesce(v_order.paid_at, g.starts_at))
                   + interval '7 days';

    -- 회차 순소비(Ver9 유지).
    select coalesce(sum(-l.delta), 0)::integer into v_used
      from public.performance_credit_ledger l
     where l.grant_id = g.id;

    v_started := v_started or v_used > 0 or g.first_accessed_at is not null;

    v_ratio   := null;
    v_k       := null;
    v_c       := null;
    v_monthly := null;

    if v_line_list = 0 and v_sum_list > 0 then
      -- 무상 취득분(제33조의3 ⑥) — 환불 대상 아님, 검토 대상도 아님(§2-2).
      v_step2 := 0;
      v_code  := 'free_item';

    elsif g.expires_at is not null and p_at >= g.expires_at then
      -- 유효기간·이용기간 만료(제33조의1 ⑤·⑥) — 잔여 가치 소멸.
      v_step2 := 0;
      v_code  := 'expired';

    elsif g.granted_sessions is not null then
      -- 회차제(⑧). 기간+회차 혼합 상품도 회차제다(⑧ 후문 단서 + 고객사
      -- 회신 8/31, §2-6) — 기간은 위 만료 축으로만 작동한다.
      if v_used <= 0 then
        v_step2 := v_line_paid;
        v_code  := 'before_start';
      elsif g.granted_sessions = 1 then
        -- 1회권 개시 후 청약철회 제한(④ + 제32조 ②).
        v_step2 := 0;
        v_code  := 'single_use_closed';
      else
        -- 회차 단가 × 미사용 잔여, 절상(⑧ + ⑤ ※).
        v_step2 := ceil(
          v_line_paid::numeric
          * greatest(g.granted_sessions - v_used, 0)
          / g.granted_sessions
        )::integer;
        v_code := 'sessions_prorated';
      end if;

    elsif g.first_accessed_at is null then
      -- 기간제 미개시 — 이용 시작 전 전액(②-1).
      v_step2 := v_line_paid;
      v_code  := 'before_start';

    else
      v_months := g.granted_months;

      if g.expires_at is null or g.expires_at <= g.starts_at then
        -- 무기한/비정상 기간은 경과율을 정의할 수 없다(Ver9 유지).
        v_step2 := v_line_paid;
        v_code  := 'period_unbounded';

      elsif v_months = 1 then
        -- 1개월 이내 과정 — ②-2 계단, 절상.
        v_ratio := extract(epoch from (p_at - g.starts_at))
                 / extract(epoch from (g.expires_at - g.starts_at));
        v_step2 := case
          when v_ratio < (1.0/3.0) then ceil(v_line_paid::numeric * 2 / 3)::integer
          when v_ratio < 0.5       then ceil(v_line_paid::numeric / 2)::integer
          else 0
        end;
        v_code := 'period_tier';

      else
        -- 1개월 초과 과정 — 환불 = max(0, P − L×(k+c)) (§2-4 권장 (a)=(b):
        -- ②-3호 월 계단과 ⑪ 정가 재산정을 어느 순서로 읽어도 같은 값).
        --   k = 완료 개월 수, c = 해당 월 계단 차감률(그 월 안의 경과율로
        --   ②-2와 같은 기준), L = 정가 월액. 회사 귀책·청약철회기간 내면
        --   ⑪ 예외 — L 을 안분결제 월액(M = P/N)으로 바꿔 같은 식을 쓴다.
        select count(*)::integer into v_k
          from generate_series(1, v_months) i
         where public.fn_add_months_kst(g.starts_at, i) <= p_at;
        v_k := least(v_k, v_months);

        v_ms := public.fn_add_months_kst(g.starts_at, v_k);
        if p_at > v_ms and v_k < v_months then
          v_me := public.fn_add_months_kst(g.starts_at, v_k + 1);
          v_ratio := extract(epoch from (p_at - v_ms))
                   / extract(epoch from (v_me - v_ms));
          v_c := case
            when v_ratio < (1.0/3.0) then 1.0/3.0
            when v_ratio < 0.5       then 0.5
            else 1.0
          end;
        else
          v_c := 0;
        end if;

        if p_company_fault or v_wd then
          v_monthly := v_line_paid::numeric / v_months;
          v_code    := 'period_monthly_tier_noreprice';
        else
          v_monthly := v_line_list::numeric / v_months;
          v_code    := 'period_monthly_tier';
        end if;

        v_step2 := ceil(greatest(0::numeric, v_line_paid - v_monthly * (v_k + v_c)))::integer;
      end if;
    end if;

    -- 3단계 — 제33조의2 ⑦ 동시결제 조건부 할인 반환금. 현 데이터 모델에는
    -- 조건부 할인 컬럼이 없어 항상 0(§2-5 확정 — ⑦-1이 장기할인·쿠폰을
    -- 명시 제외). 컬럼이 생기면 ⑦-2 산식 + ⑦-4 표시 전제 + ⑦-5 면제
    -- (회사 귀책 ∨ 철회기간 내 ∨ 전부 해지)를 여기서 계산한다.
    v_line_refund := greatest(0, v_step2);
    v_sum_refund  := v_sum_refund + v_line_refund;
    v_codes       := v_codes || v_code;
    v_all_wd      := v_all_wd and v_wd;
    v_all_before  := v_all_before and v_code = 'before_start';
    v_review      := v_review or v_code = 'period_unbounded';

    v_lines := v_lines || jsonb_build_object(
      'grant_id',          g.id,
      'order_item_id',     g.order_item_id,
      'program_key',       g.program_key,
      'product_slug',      g.product_slug,
      'item_name',         g.item_name,
      'list_price',        v_line_list,
      'paid_allocated',    v_line_paid,
      'list_amount',       v_line_list,
      'granted_months',    g.granted_months,
      'granted_sessions',  g.granted_sessions,
      'used_sessions',     v_used,
      'first_accessed_at', g.first_accessed_at,
      'expires_at',        g.expires_at,
      'within_withdrawal', v_wd,
      'elapsed_ratio',     v_ratio,
      'charge_months',     v_k,
      'month_tier',        case when v_c is null then null else round(v_c, 4) end,
      'monthly_list',      case when v_monthly is null then null
                                else round(v_monthly, 2) end,
      'step2_amount',      v_step2,
      'bundle_return',     0,
      'refund',            v_line_refund,
      'policy_code',       v_code
    );
  end loop;

  -- 합산 — 100원 내림은 폐지(⑤ ※ 전면 절상). 클램프 상한은 누적 완료
  -- 환불을 반영한다(§3-1 8단계 — Ver9 는 orders.amount 만 봤다).
  v_cap := greatest(0, v_order.amount - public.fn_refund_completed_amount(p_order_id));
  v_sum_refund := greatest(0, least(v_sum_refund, v_cap));

  -- 전부 청약철회 쿠폰 복원(제33조의3 ⑤) — 주문 전체 + 모든 라인 철회기간
  -- 내 + 모든 라인 미개시 + 살아있는 쿠폰 사용이 있을 때.
  v_restore := v_scope = 'order'
    and v_all_wd
    and v_all_before
    and exists (
      select 1 from public.coupon_redemptions cr
       where cr.order_id = p_order_id and cr.voided_at is null);

  select case when count(distinct c) = 1 then min(c) else 'mixed' end
    into v_code
    from unnest(v_codes) c;

  return query select
    v_order.id,
    v_order.amount,
    v_sum_refund::integer,
    (v_order.amount - v_sum_refund)::integer,
    v_started,
    v_review,
    v_code,
    v_lines,
    v_scope,
    'v10'::text,
    v_all_wd,
    p_company_fault,
    v_bundle_sum,
    v_restore;
end;
$$;

comment on function public.fn_refund_quote(text, bigint[], boolean, timestamptz) is
  '제33조의1~3 Ver10 환불 산정 정본(20260901). 개별 정가 비율 절상 안분(제33조의2 ⑤) → 라인별 정책(②계단·⑧회차·⑪장기할인 = max(0, P−L×(k+c)), 만료 0원) → ⑦ 공제(현 모델 0) 3단계. p_order_item_ids 로 구성서비스 단위 부분 산정, p_company_fault·청약철회 7일 내는 ⑪ 예외(L=M), p_at 은 재견적 재현용. 모달 미리보기·fn_request_refund·fn_complete_refund 재견적이 이 함수 하나를 공유한다. 소유권 WC005, 결제 상태 WC006, 대상 항목 검증 WC060.';

revoke all on function public.fn_refund_quote(text, bigint[], boolean, timestamptz) from public;
grant all on function public.fn_refund_quote(text, bigint[], boolean, timestamptz) to authenticated;
grant all on function public.fn_refund_quote(text, bigint[], boolean, timestamptz) to service_role;

-- ---------------------------------------------------------------------
-- 2) fn_request_refund — p_order_item_ids 추가(DROP+CREATE, 오버로드 방지).
-- ---------------------------------------------------------------------
drop function if exists public.fn_request_refund(text, text, text, text, text);

create function public.fn_request_refund(
  p_order_id       text,
  p_reason         text,
  p_refund_bank    text     default null,
  p_refund_account text     default null,
  p_refund_holder  text     default null,
  p_order_item_ids bigint[] default null
) returns public.refund_requests
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_order              public.orders;
  v_row                public.refund_requests;
  v_caller             uuid := auth.uid();
  v_status             text;
  v_resp_at            timestamptz;
  v_completed_amount   integer;
  v_quote              record;
  v_overlap            public.refund_requests;
  v_is_virtual_account boolean;
  v_normalized_account text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_order_id, 100));

  select * into v_order from public.orders where id = p_order_id;

  -- 쌍 당사자면 누구나 신청할 수 있다(sql/74 가 좁혔던 것을 되돌린다).
  if v_order.id is null
     or (v_caller is distinct from v_order.student_profile_id
         and v_caller is distinct from v_order.parent_profile_id) then
    raise exception 'order_not_found_or_not_owned' using errcode = 'WC005';
  end if;

  if v_order.status <> 'paid' then
    raise exception 'order_not_refundable' using errcode = 'WC006';
  end if;

  -- 산정 먼저 — 항목 검증(WC060)·전체 승격(§2-10)·금액이 여기서 정해진다.
  -- 이후의 겹침 판정은 산정이 확정한 scope 기준으로 한다(전체 승격된 부분
  -- 선택이 부분 신청으로 남으면 유니크 인덱스 축이 새는 구멍이 된다).
  select * into v_quote
    from public.fn_refund_quote(p_order_id, p_order_item_ids, false, now());

  -- (sql/88, WC057 → Ver10 확장) 학부모가 반려한 신청과 항목이 겹치면 환불
  -- 축 종결이다. 반려는 "이 대상은 환불하지 않는다"는 결정이므로 경로를
  -- 가리지 않는다. NULL(주문 전체)은 모든 항목과 겹친다.
  if exists (
    select 1 from public.refund_requests r
     where r.order_id = p_order_id
       and r.approval_status = 'rejected'
       and (r.order_item_ids is null
            or v_quote.scope = 'order'
            or r.order_item_ids && p_order_item_ids)
  ) then
    raise exception 'refund_request_parent_rejected' using errcode = 'WC057';
  end if;

  -- 열린 신청과의 겹침(WC007 유지 + WC061 신규). 같은 축(주문 전체끼리)은
  -- Ver9 그대로 WC007, 배열이 끼는 겹침은 WC061 — 유니크 인덱스가 못 잡는
  -- 축이라 이 advisory lock 아래 검사가 정본이다(§2-10).
  select r.* into v_overlap
    from public.refund_requests r
   where r.order_id = p_order_id
     and r.status in ('requested', 'processing')
     and r.approval_status <> 'rejected'
     and (r.order_item_ids is null
          or v_quote.scope = 'order'
          or r.order_item_ids && p_order_item_ids)
   limit 1;

  if v_overlap.id is not null then
    if v_overlap.order_item_ids is null and v_quote.scope = 'order' then
      raise exception 'duplicate_refund_request' using errcode = 'WC007';
    else
      raise exception 'refund_request_items_overlap'
        using errcode = 'WC061',
              detail  = format('order_id=%s open_request_id=%s — 열린 신청과 대상 항목이 겹친다',
                               p_order_id, v_overlap.id);
    end if;
  end if;

  v_completed_amount := public.fn_refund_completed_amount(p_order_id);
  if v_completed_amount >= v_order.amount then
    raise exception 'refund_amount_exceeds_paid'
      using errcode = 'WC037',
            detail  = format('order_id=%s completed_amount=%s orders.amount=%s',
                              p_order_id, v_completed_amount, v_order.amount);
  end if;

  -- 승인축 — 학생 신청은 학부모 확인 대기, 학부모(결제자) 신청은 즉시 승인
  -- (refund_requests_parent_auto_approve_check 가 요구하는 값이다).
  if v_caller = v_order.parent_profile_id then
    v_status  := 'approved';
    v_resp_at := now();
  else
    v_status  := 'requested';
    v_resp_at := null;
  end if;

  -- 계좌번호는 숫자만 남긴 뒤 판정·저장 양쪽에 쓴다(20260822000002 원문).
  v_normalized_account := regexp_replace(p_refund_account, '[^0-9]', '', 'g');

  -- WC058 — 학부모 본인 신청(즉시 approved)이 가상계좌 결제 건이면 환불계좌
  -- 3필드 필수(20260822000002 원문).
  if v_status = 'approved' then
    v_is_virtual_account := (v_order.raw -> 'virtualAccount') is not null
      and (v_order.raw -> 'virtualAccount') <> 'null'::jsonb;

    if v_is_virtual_account
       and (coalesce(btrim(p_refund_bank), '') = ''
            or coalesce(v_normalized_account, '') = ''
            or coalesce(btrim(p_refund_holder), '') = '') then
      raise exception 'refund_account_required_for_virtual_account'
        using errcode = 'WC058';
    end if;
  end if;

  insert into public.refund_requests (
    user_id, order_id, order_item_id, order_name, amount, reason,
    refund_bank, refund_account, refund_holder, status,
    student_profile_id, parent_profile_id, requested_by,
    approval_status, approval_responded_at,
    gross_amount, policy_code, needs_review, quote,
    order_item_ids, within_withdrawal, bundle_return_amount, terms_version
  ) values (
    v_caller, v_order.id, null, v_order.order_name, v_quote.refund_amount, p_reason,
    p_refund_bank, nullif(v_normalized_account, ''), p_refund_holder, 'requested',
    v_order.student_profile_id, v_order.parent_profile_id, v_caller,
    v_status, v_resp_at,
    v_quote.gross_amount, v_quote.policy_code, v_quote.needs_review, v_quote.lines,
    case when v_quote.scope = 'order' then null else p_order_item_ids end,
    v_quote.within_withdrawal, v_quote.bundle_return_amount, 'v10'
  )
  returning * into v_row;

  return v_row;
end;
$$;

comment on function public.fn_request_refund(text, text, text, text, text, bigint[]) is
  '환불 신청 생성(20260901 Ver10 — p_order_item_ids 로 구성서비스 단위 부분해지, 제33조의2 ②). 금액은 fn_refund_quote v10 이 정하고, 선택이 살아있는 라인 전부를 덮으면 주문 전체 신청으로 승격된다(§2-10). 겹침 축: 반려 이력 겹침 WC057, 열린 신청 겹침 WC007(전체끼리)/WC061(배열 겹침, advisory lock 아래 검사). 승인축(학생 requested/학부모 즉시 approved)·WC005/WC006/WC037/WC058 은 20260822000002 원문 유지.';

revoke all on function public.fn_request_refund(text, text, text, text, text, bigint[]) from public;
grant all on function public.fn_request_refund(text, text, text, text, text, bigint[]) to authenticated;
grant all on function public.fn_request_refund(text, text, text, text, text, bigint[]) to service_role;

-- ---------------------------------------------------------------------
-- 3) fn_revoke_program_access_for_order — 대상 라인 인자 추가(DROP+CREATE).
-- ---------------------------------------------------------------------
drop function if exists public.fn_revoke_program_access_for_order(text, uuid, text, text);

create function public.fn_revoke_program_access_for_order(
  p_order_id       text,
  p_user_id        uuid,
  p_payment_status text     default 'refunded',
  p_reason         text     default 'order_revoked',
  p_order_item_ids bigint[] default null
) returns jsonb
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_order   public.orders;
  v_status  text;
  v_reason  text;
  v_keys    text[] := '{}';
  v_key     text;
  v_closed  int    := 0;
  v_sync    jsonb  := '[]'::jsonb;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'WC010';
  end if;

  -- 결제자(학부모) 확인. 부여 함수(5-e)와 동일 근거의 가드.
  if v_order.parent_profile_id is distinct from p_user_id then
    raise exception 'order_user_mismatch' using errcode = 'WC011';
  end if;

  -- student_profile_id 는 NOT NULL 이 보장돼 도달 불가에 가깝다(원문 유지).
  if v_order.student_profile_id is null then
    return jsonb_build_object(
      'ok', true, 'revoked', '[]'::jsonb, 'recalculated', '[]'::jsonb,
      'skipped', jsonb_build_array(jsonb_build_object('reason', 'order_has_no_user')),
      'ledger_closed', 0, 'synced', '[]'::jsonb);
  end if;

  -- 5-e절과 같은 락 순서(주문 행 → advisory, 대상은 student_profile_id).
  perform pg_advisory_xact_lock(hashtextextended(v_order.student_profile_id::text, 101));

  v_status := case when p_payment_status in ('refunded', 'cancelled')
                   then p_payment_status else 'refunded' end;
  v_reason := coalesce(nullif(btrim(p_reason), ''), 'order_revoked');

  -- 부분해지(20260901 Ver10) — p_order_item_ids 가 있으면 그 라인만 닫는다.
  -- 잔여 구성서비스는 존속한다(제33조의2 ⑧).
  with closed as (
    update public.program_access_grants g
       set revoked_at    = now(),
           revoke_reason = v_reason,
           updated_at    = now()
     where g.order_id = p_order_id
       and g.revoked_at is null
       and (p_order_item_ids is null or g.order_item_id = any(p_order_item_ids))
    returning g.program_key
  )
  select coalesce(array_agg(distinct program_key), '{}'), count(*)
    into v_keys, v_closed
    from closed;

  if array_length(v_keys, 1) is null then
    select coalesce(array_agg(distinct g.program_key), '{}')
      into v_keys
      from public.program_access_grants g
     where g.order_id = p_order_id
       and (p_order_item_ids is null or g.order_item_id = any(p_order_item_ids));
  end if;

  -- 캐시 재계산 — fn_sync_program_access_cache 는 살아있는 부여에서 다시
  -- 계산하므로, 같은 program_key 의 다른 부여가 남아 있으면 활성이 유지되고
  -- 전부 닫혔을 때만 v_status 로 종결된다(부분해지에 그대로 안전).
  foreach v_key in array v_keys loop
    v_sync := v_sync || public.fn_sync_program_access_cache(v_order.student_profile_id, v_key, v_status);
  end loop;

  return jsonb_build_object(
    'ok',            true,
    'revoked',       to_jsonb(v_keys),
    'recalculated',  to_jsonb(v_keys),
    'skipped',       '[]'::jsonb,
    'ledger_closed', v_closed,
    'synced',        v_sync
  );
end;
$$;

comment on function public.fn_revoke_program_access_for_order(text, uuid, text, text, bigint[]) is
  '주문의 이용 권한을 회수한다(M6 재작성 + 20260901 Ver10 부분 회수). p_order_item_ids 가 있으면 그 구성서비스 라인만 닫는다(제33조의2 ② 부분해지 — 잔여 라인 존속 ⑧). 회수 대상은 orders.student_profile_id(학생), p_user_id 는 WC011 가드 전용. 원장 행은 DELETE 하지 않고 revoked_at/revoke_reason 으로 닫는다. 캐시는 fn_sync_program_access_cache 가 살아있는 부여에서 재계산한다.';

revoke all on function public.fn_revoke_program_access_for_order(text, uuid, text, text, bigint[]) from public;
grant all on function public.fn_revoke_program_access_for_order(text, uuid, text, text, bigint[]) to service_role;

-- ---------------------------------------------------------------------
-- 4) fn_complete_refund — 20260831081100 정본(완료 기록 3종) 위에 Ver10 을
--    얹는다: v9 레거시 WC039 우회(§3-4) · 항목 조건 재현 재견적 · 부분 회수 ·
--    잔여 라인 존속 시 orders.status 유지 · 전부 청약철회 쿠폰 복원.
--    시그니처가 같으므로 CREATE OR REPLACE.
-- ---------------------------------------------------------------------
create or replace function public.fn_complete_refund(
  p_refund_request_id bigint,
  p_admin_memo text default null
) returns public.refund_requests
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_order_id         text;
  v_row              public.refund_requests;
  v_order            public.orders;
  v_completed_amount integer;
  v_revoke_result    jsonb;
  v_quote            record;
  v_method           text;
  v_restored         integer := 0;
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select r.order_id into v_order_id
    from public.refund_requests r
   where r.id = p_refund_request_id;

  if v_order_id is null then
    raise exception 'refund_request_not_found' using errcode = 'WC026';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_order_id, 100));

  select * into v_row from public.refund_requests where id = p_refund_request_id for update;
  if not found then
    raise exception 'refund_request_not_found' using errcode = 'WC026';
  end if;

  select * into v_order from public.orders where id = v_row.order_id for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'WC010';
  end if;

  if v_row.approval_status <> 'approved' then
    raise exception 'refund_not_approved_for_completion' using errcode = 'WC035';
  end if;

  if v_row.status not in ('requested', 'processing') then
    raise exception 'refund_completion_not_processable'
      using errcode = 'WC036',
            detail  = format('refund_request_id=%s status=%s', p_refund_request_id, v_row.status);
  end if;

  -- 재견적 가드(WC039) — 신청 이후 추가 이용이 생겨 산정액이 줄었으면
  -- 거부한다. 금액이 바뀌면 신청자에게 다시 동의를 받아야 하므로 조용히
  -- 깎지 않는다. 신청 시점과 같은 조건(대상 항목·회사 귀책)으로 재현한다.
  --
  -- terms_version='v9' 행은 이 비교를 건너뛴다(§3-4) — Ver9 산식(100원
  -- 내림)으로 확정·동의된 금액을 v10 산식과 비교하면 만료 규칙(expired
  -- 0원) 등으로 정당한 완료까지 막힌다. WC037 누적 상한은 그대로 지킨다.
  if v_row.terms_version <> 'v9' then
    select * into v_quote
      from public.fn_refund_quote(v_row.order_id, v_row.order_item_ids,
                                  v_row.company_fault, now());
    if v_quote.refund_amount < v_row.amount then
      raise exception 'refund_quote_changed'
        using errcode = 'WC039',
              detail  = format('refund_request_id=%s requested_amount=%s current_quote=%s — 신청 이후 추가 이용이 발생했다. 반려 후 재신청을 받을 것.',
                               p_refund_request_id, v_row.amount, v_quote.refund_amount);
    end if;
  end if;

  select coalesce(sum(r.amount), 0) into v_completed_amount
    from public.refund_requests r
   where r.order_id = v_row.order_id
     and r.status = 'completed'
     and r.id <> p_refund_request_id;

  if v_completed_amount + v_row.amount > v_order.amount then
    raise exception 'refund_amount_exceeds_paid'
      using errcode = 'WC037',
            detail  = format('order_id=%s completed_amount=%s this_amount=%s orders.amount=%s',
                             v_row.order_id, v_completed_amount, v_row.amount, v_order.amount);
  end if;

  -- 환불방법 확정(QA 273·275, 20260831081100 원문).
  v_method := case
    when coalesce(btrim(v_row.refund_bank), '') <> '' then '계좌이체'
    else '카드취소'
  end;

  perform set_config('winning.refund_completing', p_refund_request_id::text, true);

  update public.refund_requests
     set status        = 'completed',
         admin_memo    = coalesce(p_admin_memo, admin_memo),
         completed_at  = coalesce(completed_at, now()),
         processed_by  = coalesce(processed_by, auth.uid()),
         refund_method = coalesce(refund_method, v_method)
   where id = p_refund_request_id
  returning * into v_row;

  -- 부분해지면 대상 라인만 회수한다(제33조의2 ② — 잔여 구성서비스 존속 ⑧).
  v_revoke_result := public.fn_revoke_program_access_for_order(
    v_row.order_id, v_order.user_id, 'refunded', 'refund_completed',
    v_row.order_item_ids);

  -- 주문 종결은 살아있는 부여가 0이 됐을 때만(§3-2). 부분환불 주문은
  -- 'paid' 로 남고, "일부 환불" 표시는 화면이 완료 누적액으로 파생한다
  -- (§2-11 — orders_status_check 에 새 상태를 만들지 않는다).
  if not exists (
    select 1 from public.program_access_grants g
     where g.order_id = v_row.order_id and g.revoked_at is null
  ) then
    update public.orders
       set status = 'refunded'
     where id = v_row.order_id;
  end if;

  -- 전부 청약철회 쿠폰 복원(제33조의3 ⑤) — v10 재견적이 조건 충족을
  -- 판정했고, 쿠폰 자체가 아직 유효기간 안일 때만 사용 이력을 무효화해
  -- 되살린다(coupon_redemptions.voided_at — fn_coupon_is_redeemed 가 보는
  -- 단일 축). 유효기간이 지난 쿠폰은 복원해도 쓸 수 없으므로 건드리지
  -- 않는다(⑤ 단서).
  -- v9 행은 v_quote 가 애초에 실행되지 않으므로(WC039 우회) 바깥 if 로
  -- 먼저 갈라 미할당 record 필드 접근을 원천 차단한다.
  if v_row.terms_version <> 'v9' then
    if coalesce(v_quote.coupon_restore, false) then
      with restored as (
        update public.coupon_redemptions cr
           set voided_at   = now(),
               void_reason = 'refund_withdrawal_full'
          from public.coupons c
         where c.id = cr.coupon_id
           and cr.order_id = v_row.order_id
           and cr.voided_at is null
           and (c.valid_until is null
                or c.valid_until >= (now() at time zone 'Asia/Seoul')::date)
        returning cr.id
      )
      select count(*) into v_restored from restored;

      if v_restored > 0 then
        update public.refund_requests
           set coupon_restored_at = now()
         where id = p_refund_request_id
        returning * into v_row;
      end if;
    end if;
  end if;

  return v_row;
end;
$$;

comment on function public.fn_complete_refund(bigint, text) is
  '환불 완료 단일 정본 RPC(20260901 Ver10). 20260831081100 의 완료 기록 3종(completed_at·processed_by·refund_method) 위에: 재견적을 신청 조건(order_item_ids·company_fault)으로 재현, v9 행은 WC039 비교 우회(§3-4, WC037 유지), 부분 회수(잔여 구성서비스 존속), orders.status=refunded 는 살아있는 부여 0일 때만, 전부 청약철회면 유효기간 내 쿠폰 사용 이력을 자동 복원(제33조의3 ⑤, coupon_restored_at 기록). 가드 42501/WC026/WC035/WC036/WC037/WC039.';

-- ---------------------------------------------------------------------
-- 5) fn_admin_requote_refund — 회사 귀책(⑪ 예외 1호) 세팅 + 재산정.
--    사용자가 고른 사유는 주장일 뿐이다 — 판정은 어드민이 하고, 이 RPC 가
--    산정을 다시 돌려 amount/quote 를 갱신한다(§2-9).
--    금액이 줄어드는 재산정은 신청자 재동의가 필요하므로 어드민 단독으로는
--    거부한다(WC063 — 반려 후 재신청 경로로 유도, §2-9 권장).
-- ---------------------------------------------------------------------
create function public.fn_admin_requote_refund(
  p_refund_request_id bigint,
  p_company_fault     boolean
) returns public.refund_requests
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_order_id text;
  v_row      public.refund_requests;
  v_quote    record;
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  -- 락 순서는 fn_complete_refund 와 동일하게 advisory(주문) → 행 FOR UPDATE.
  -- 역순으로 잡으면 완료 RPC 와 데드락 쌍이 된다.
  select r.order_id into v_order_id
    from public.refund_requests r
   where r.id = p_refund_request_id;

  if v_order_id is null then
    raise exception 'refund_request_not_found' using errcode = 'WC026';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_order_id, 100));

  select * into v_row from public.refund_requests where id = p_refund_request_id for update;
  if not found then
    raise exception 'refund_request_not_found' using errcode = 'WC026';
  end if;

  if v_row.approval_status <> 'approved' then
    raise exception 'refund_not_approved_for_completion' using errcode = 'WC035';
  end if;

  if v_row.status not in ('requested', 'processing') then
    raise exception 'refund_completion_not_processable'
      using errcode = 'WC036',
            detail  = format('refund_request_id=%s status=%s', p_refund_request_id, v_row.status);
  end if;

  -- Ver9 행은 재산정 금지(§3-4) — 신청 시점 약관으로 확정된 금액이다.
  if v_row.terms_version = 'v9' then
    raise exception 'refund_requote_terms_v9'
      using errcode = 'WC062',
            detail  = format('refund_request_id=%s — v9 산정 건은 재산정하지 않는다(§3-4)', p_refund_request_id);
  end if;

  select * into v_quote
    from public.fn_refund_quote(v_row.order_id, v_row.order_item_ids,
                                p_company_fault, now());

  -- 감액은 어드민 단독 갱신 불가 — 신청자가 동의한 금액보다 줄어드는
  -- 변경은 재동의(반려 후 재신청)가 필요하다(§2-9 권장: 증액만 허용).
  if v_quote.refund_amount < v_row.amount then
    raise exception 'refund_requote_decrease'
      using errcode = 'WC063',
            detail  = format('refund_request_id=%s current=%s requote=%s — 감액 재산정은 반려 후 재신청으로 처리할 것',
                             p_refund_request_id, v_row.amount, v_quote.refund_amount);
  end if;

  update public.refund_requests
     set company_fault        = p_company_fault,
         amount               = v_quote.refund_amount,
         gross_amount         = v_quote.gross_amount,
         policy_code          = v_quote.policy_code,
         needs_review         = v_quote.needs_review,
         within_withdrawal    = v_quote.within_withdrawal,
         bundle_return_amount = v_quote.bundle_return_amount,
         quote                = v_quote.lines
   where id = p_refund_request_id
  returning * into v_row;

  return v_row;
end;
$$;

comment on function public.fn_admin_requote_refund(bigint, boolean) is
  '어드민 전용(20260901 Ver10, §2-9). 회사 귀책(제33조의1 ⑪ 예외 1호)을 세팅하고 fn_refund_quote 를 같은 대상 항목으로 다시 돌려 amount/quote 를 갱신한다. approved·미완료(requested/processing) 건만(WC035/WC036), v9 산정 건 금지(WC062), 감액 재산정은 신청자 재동의가 필요해 거부(WC063 — 반려 후 재신청 경로). 사용자 화면에는 회사 귀책 입력이 없다 — 신청 사유는 주장, 판정은 어드민.';

revoke all on function public.fn_admin_requote_refund(bigint, boolean) from public;
grant all on function public.fn_admin_requote_refund(bigint, boolean) to authenticated;
grant all on function public.fn_admin_requote_refund(bigint, boolean) to service_role;
