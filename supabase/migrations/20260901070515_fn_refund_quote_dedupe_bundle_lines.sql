-- fn_refund_quote — 번들 상품(bundle_items) 표시 라인 order_item_id 단위 합산
--
-- 왜: fn_refund_quote(20260901001439)의 lines 는 grant(program_access_grants)
-- 단위로 한 줄씩 쌓는다. 부산캠퍼스 9,900 같은 번들은 order_item 하나가
-- bundle_items 행 수만큼(3개) grant 를 만드는데(20260901050437 번들 분기),
-- 그 3개 grant 가 전부 같은 order_item_id·item_name(주문의 유일한 order_item
-- 이름, "9,900원 부산캠퍼스 특별할인 학습관리 서비스")을 가진다. 그 결과
-- RefundRequestModal 의 "구성서비스 선택" 체크박스와 RefundApprovalModal 의
-- 견적 라인에 완전히 똑같아 보이는 항목이 3개 뜬다(마이페이지 QA,
-- 2026-09-01). 부분환불 선택 단위(p_order_item_ids, WC060)도 order_item_id
-- 이지 grant_id 가 아니다 — 애초에 화면에 보여야 할 단위가 grant 가 아니라
-- order_item 이었다. 20260901050445 시드 주석도 "부분환불 없음 — fn_refund_
-- quote 쪽 과제"라고 이 갭을 명시해 두었다.
--
-- 고침: 루프가 만드는 grant 단위 원본 라인은 그대로 v_grant_lines 에 쌓고,
-- 루프가 끝난 뒤 order_item_id 로 묶어 v_lines(응답 필드)를 다시 만든다.
--   - grant 가 하나뿐인 order_item(일반 단품 — 압도적 다수)은 원본 라인을
--     그대로 내보낸다. product_slug·charge_months 등 grant 전용 필드가 전부
--     보존되므로 scripts/refund-quote-ver10.spec.sql 의 기존 단언(T4·T6·T13
--     등)은 값이 그대로다.
--   - grant 가 여럿인 order_item(번들)은 paid_allocated·refund 등 금액
--     필드를 합산한 라인 하나로 합친다. item_name 은 공유 order_item 이름
--     그대로(중복 아님), policy_code 는 구성 권한들의 정책이 전부 같으면
--     그 값, 다르면 'mixed'. grant 전용 필드(product_slug·granted_months 등)
--     는 합쳐진 라인에서는 의미가 없어 null 로 비운다 — 지어내지 않는다.
--     결과: 부산 9,900 주문은 lines 가 1개뿐이라 RefundRequestModal 의
--     allLines.length >= 2 조건을 못 넘어 체크박스 UI 자체가 안 뜬다 —
--     시드 주석대로 "주문 전체 환불만" 이 자연히 성립한다.
-- 총 환불액(refund_amount)은 이 라인 합산과 무관하게 grant 단위 합(v_sum_
-- refund)을 그대로 쓴다 — 여기서 바뀌는 건 화면 표시용 lines 구조뿐이다.
--
-- 시그니처는 20260901001439 와 동일(text, bigint[], boolean, timestamptz)이라
-- DROP 없이 CREATE OR REPLACE 로 충분하다.

create or replace function public.fn_refund_quote(
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
  -- grant 단위 원본 라인(루프가 쌓는다) — order_item_id 로 다시 합쳐 v_lines 로
  -- 만든다(아래 "표시 라인 합산" 블록).
  v_grant_lines  jsonb := '[]'::jsonb;
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

    v_grant_lines := v_grant_lines || jsonb_build_object(
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

  -- 표시 라인 합산 — order_item_id 단위로 grant 라인을 다시 묶는다(위 설명
  -- 주석 참고). grant 가 하나뿐인 order_item은 원본 라인을 그대로 내보내고,
  -- 여럿(번들)이면 금액을 합산한 라인 하나로 합친다.
  with numbered as (
    select row_number() over () as seq,
           elem,
           (elem->>'order_item_id')::bigint as item_id
      from jsonb_array_elements(v_grant_lines) elem
  ),
  grouped as (
    select
      item_id,
      count(*) as n,
      min(seq) as first_seq,
      (array_agg(elem order by seq))[1] as sole_elem,
      jsonb_build_object(
        'grant_id',          null,
        'order_item_id',     item_id,
        'program_key',       null,
        'product_slug',      null,
        'item_name',         min(elem->>'item_name'),
        'list_price',        sum((elem->>'list_price')::bigint),
        'paid_allocated',    sum((elem->>'paid_allocated')::bigint),
        'list_amount',       sum((elem->>'list_amount')::bigint),
        'granted_months',    null,
        'granted_sessions',  null,
        'used_sessions',     null,
        'first_accessed_at', null,
        'expires_at',        null,
        'within_withdrawal', bool_and((elem->>'within_withdrawal')::boolean),
        'elapsed_ratio',     null,
        'charge_months',     null,
        'month_tier',        null,
        'monthly_list',      null,
        'step2_amount',      sum((elem->>'step2_amount')::bigint),
        'bundle_return',     0,
        'refund',            sum((elem->>'refund')::bigint),
        'policy_code',       case when count(distinct elem->>'policy_code') = 1
                                   then min(elem->>'policy_code')
                                   else 'mixed' end
      ) as merged_elem
      from numbered
     group by item_id
  )
  select coalesce(
           jsonb_agg(
             case when n = 1 then sole_elem else merged_elem end
             order by first_seq
           ),
           '[]'::jsonb
         )
    into v_lines
    from grouped;

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
  '제33조의1~3 Ver10 환불 산정 정본(20260901, 20260901070515 표시 라인 order_item_id 합산 패치). 개별 정가 비율 절상 안분(제33조의2 ⑤) → 라인별 정책(②계단·⑧회차·⑪장기할인 = max(0, P−L×(k+c)), 만료 0원) → ⑦ 공제(현 모델 0) 3단계. 응답 lines 는 grant 단위 산정을 order_item_id 로 다시 합쳐 노출한다 — 번들 상품(한 order_item이 grant 여러 개를 만드는 경우)이 화면에 중복 항목으로 보이지 않게 한다(grant 하나뿐인 일반 상품은 원본 필드 그대로 보존). p_order_item_ids 로 구성서비스 단위 부분 산정, p_company_fault·청약철회 7일 내는 ⑪ 예외(L=M), p_at 은 재견적 재현용. 모달 미리보기·fn_request_refund·fn_complete_refund 재견적이 이 함수 하나를 공유한다. 소유권 WC005, 결제 상태 WC006, 대상 항목 검증 WC060.';
