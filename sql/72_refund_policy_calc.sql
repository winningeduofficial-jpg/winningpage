-- =====================================================================
-- 72_refund_policy_calc.sql — 제33조 환불 금액 산정기
--
-- 배경
--   마이페이지 환불 신청 모달 시안(Figma 3665:6635)은 "결제 금액 / 취소
--   수수료 / 환불 금액" 3행을 보여준다. 그런데 이 금액을 계산하는 코드가
--   저장소 어디에도 없었다(`취소 수수료`/`cancel_fee` 전역 검색 0건).
--   fn_request_refund 는 항상 orders.amount 전액을 기록했고, 이용을 시작한
--   주문은 아예 신청조차 거부했다(WC032). 즉 "전액 아니면 불가"의 2진
--   정책이었다. 이 파일이 그 자리를 이용약관 제33조 비례 환불로 바꾼다.
--
--   근거 문서 — src/data/legalDocs.js `refund` (유료서비스 결제·청약철회·
--   환불 규정, 시행 2026.08.01). 이하 조문 번호는 전부 그 문서 기준이다.
--
-- =====================================================================
-- 결정 요약 (2026-08-13 사용자 확정)
-- =====================================================================
-- D1. 회차제(⑤) — **잔여 회차 비례**. 미사용 잔여 회차에 해당하는 금액을
--     환불한다. 3회권 50,000원 중 1회 사용 → 33,333원.
--     (대안이던 "제2항 계단 준용"은 채택하지 않았다.)
--
-- D2. 1회 이용권(③) — **개시 후 환불 불가**. 제33조 ③ + 제32조 ②
--     그대로다. 시안(3665:6635)은 '[30분 이용권] 콜멘토'에 2/3 환불을
--     그려놓았지만, 그 숫자를 따르면 약관과 어긋난다 — 약관을 따른다.
--     화면에는 0원 + 제한 사유를 표시한다.
--
-- D3. 장기 할인(⑧) — **반영**. 1개월 초과 과정은 결제가가 아니라 **정가
--     월액** 기준으로 이용분을 차감한다. [12개월] 정가 360,000 / 결제
--     252,000 을 2개월 이용 후 환불하면 252,000 − 30,000×2 = 192,000원.
--
-- =====================================================================
-- WC032(소비 게이트) 완화 — 이 파일의 가장 큰 변경
-- =====================================================================
--   sql/69 5-d)/5-e) 는 fn_order_consumption_state 가 consumed 를 돌려주면
--   신청(fn_request_refund)과 완료(fn_complete_refund) 양쪽에서 WC032 로
--   거부했다. 그 게이트의 원래 의도는 "쓴 만큼 돌려받는 계산 근거가 없으니
--   일단 막는다"였다(sql/68 5-b절). 이 파일이 그 계산 근거를 만들었으므로
--   게이트는 목적을 다했다 — **거부에서 금액 산정으로 바꾼다.**
--
--   · fn_request_refund : WC032 raise 제거. 소비 여부는 이제 금액을
--     깎는 입력일 뿐이고, 신청 자체는 막지 않는다. 산정 결과가 0원이어도
--     신청은 접수된다(D2 같은 제한 케이스도 어드민이 사유를 보고 예외
--     판단할 수 있어야 한다 — 서비스 이용 장애 등).
--   · fn_complete_refund : WC032 재판정을 **WC039 재견적 불일치**로
--     교체한다. 원래 의도(신청→소비→완료 순서로 몰래 더 쓰는 것 방지)는
--     유지해야 하므로, 완료 직전에 다시 산정해서 **신청 시점 금액보다
--     줄었으면** 거부한다. 조용히 깎아서 완료하지 않는다 — 금액이 바뀌면
--     사용자에게 다시 동의를 받아야 하기 때문이다(어드민이 반려 →
--     사용자 재신청).
--
--   되돌리려면: fn_request_refund 의 v_quote 대입부를 v_order.amount 로,
--   fn_complete_refund 의 WC039 블록을 sql/69 원문 WC032 블록으로 되돌리면
--   된다. 이 파일 외의 다른 변경에는 의존하지 않는다.
--
-- =====================================================================
-- 산정 규칙 (fn_refund_quote)
-- =====================================================================
--   주문 1건은 부여 원장(program_access_grants) 라인 N개로 쪼개 각각
--   산정하고 합산한다. 라인이 판정 단위인 이유 — 한 주문에 기간권과
--   회차권이 섞여 팔릴 수 있고(예: 목표관리 6개월 + 수행평가 6회),
--   제33조는 상품 성격마다 다른 규칙을 준다.
--
--   (가) 라인 금액 배분
--        grants.paid_amount 는 order_items.price*quantity 스냅샷이라
--        **쿠폰 할인 전** 금액이다(sql/64 컬럼 주석이 "정산 정본이 아니다"
--        라고 명시). 실제 받은 돈은 orders.amount 하나뿐이므로, 이 값을
--        paid_amount 비율로 라인에 배분하고 나머지(반올림 잔돈)는 마지막
--        라인에 몰아 준다 — 라인 합 = orders.amount 를 정확히 보장한다.
--
--   (나) 이용 개시 판정
--        기간권 = grants.first_accessed_at is not null (실제 첫 접속).
--        회차권 = 순소비(sum(-delta)) > 0.
--        둘 다 fn_order_consumption_state(sql/69 5-b)와 **같은 어휘**다 —
--        판정 축을 새로 만들지 않았다. 결제만 하고 손대지 않은 주문은
--        제33조 ② "이용 시작 전: 전액 반환"에 그대로 해당한다.
--
--   (다) 회차권 (granted_sessions is not null) — D1/D2
--        미사용            → 전액
--        granted_sessions=1 → 0원  (③ 1회 이용권, 개시 후 제한)
--        그 외             → paid × (총회차 − 사용회차) / 총회차
--        기간·회차가 함께 부여된 상품(예: 3개월 6회권)은 **회차 기준**을
--        쓴다. 회차가 정해진 상품의 소진 단위는 회차이고, ⑤가 그 경우를
--        직접 규정하기 때문이다.
--
--   (라) 기간권 1개월 이내 과정 (granted_months <= 1) — ② 계단
--        경과율 r = (now − starts_at) / (expires_at − starts_at)
--        r < 1/3 → 2/3 반환 · r < 1/2 → 1/2 반환 · 그 외 → 0
--
--   (마) 기간권 1개월 초과 과정 (granted_months > 1) — ⑧ 정가 재산정
--        정가월액 = round(order_items.list_price*quantity / granted_months)
--        차감월수 = 이용 개시 시점부터 경과한 개월수의 **올림**
--                   (시작한 달은 한 달로 친다. 정확히 N개월이면 N)
--        환불액   = 배분된 결제액 − 정가월액 × 차감월수, [0, 결제액] clamp
--        정가(list_price)가 0이면 할인 근거가 없다는 뜻이므로 결제액
--        월액으로 대체한다(⑧은 "할인율을 적용 받은" 경우의 규정이다).
--
--   (바) 원 단위 절사
--        최종 환불액은 100원 단위로 **내림**한다. 시안 숫자(50,000의 2/3
--        → 33,300원, 수수료 16,700원)와 일치한다. 취소 수수료는 항상
--        파생값(결제액 − 환불액)이며 독립적으로 저장하지 않는다.
--
--   (사) 부여 원장이 없는 주문
--        결제는 됐는데 grants 가 한 줄도 없는 주문(무료 성격 상품, 부여
--        실패 등)은 산정 근거가 없다. 전액 환불 + needs_review=true 로
--        돌려주고 policy_code='no_grant' 를 남긴다 — 어드민이 반드시 눈으로
--        본다. 임의로 0원 처리하면 실제로 돈을 받은 건을 안 돌려주게 된다.
--
-- =====================================================================
-- 미구현 (의도적)
-- =====================================================================
--   · ⑦ 프리미엄 A/S·특화멘토링 단순변심 환불 불가 — 해당 상품이
--     orders 로 팔리지 않는다. products.service_key 어휘는
--     goal/mentor/suhaeng/susi/target 5종뿐이고(sql/10·53 시드 실측),
--     프리미엄 컨설팅은 상담 신청(api/create-consult-request.js) 경로다.
--     결제 상품으로 편입되면 이 파일에 사유 기반 분기를 추가해야 한다.
--   · ⑥ 실시간VOD 등 콘텐츠제공서비스 — 해당 상품 없음.
--   · 항목 단위(부분) 환불 — refund_requests.order_item_id 는 계속 NULL
--     이다(sql/68 컬럼 주석의 2차 범위). 이 파일은 주문 전체 산정만 한다.
--
-- SQLSTATE 배정 (기존 WC001~WC038 뒤를 잇는다)
--   WC039  refund_quote_changed  완료 직전 재산정액이 신청 시점 금액보다
--                                작다(신청 후 추가 소비 발생).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) refund_requests — 산정 근거 컬럼
--
--    amount 는 그대로 "실제 환불할 금액"이다(어드민 환불 API가 읽는 값).
--    의미가 전액에서 산정액으로 바뀌었으므로 gross_amount(원 결제액)를
--    나란히 둔다 — 이 둘이 없으면 나중에 "왜 이 금액인가"를 재구성할 수
--    없다. quote 는 산정 당시 라인별 근거 스냅샷이다(상품 정의가 나중에
--    바뀌어도 그때의 계산이 남아야 한다 — product_slug 스냅샷과 같은 원칙).
-- ---------------------------------------------------------------------
alter table public.refund_requests
  add column if not exists gross_amount integer,
  add column if not exists policy_code  text,
  add column if not exists needs_review boolean not null default false,
  add column if not exists quote        jsonb;

comment on column public.refund_requests.amount is
  '실제 환불할 금액(제33조 산정 결과, sql/72). 어드민 환불 실행이 읽는 정본. 2026-08-13 이전에는 orders.amount 전액이었다 — 그때 생성된 행과 의미가 다르므로 gross_amount 와 함께 읽을 것.';
comment on column public.refund_requests.gross_amount is
  '신청 시점 orders.amount 스냅샷(원 결제 금액). 취소 수수료 = gross_amount − amount 로 파생한다 — 수수료를 따로 저장하지 않는 이유는 두 값이 어긋난 행을 만들 수 있기 때문이다(sql/72 (바)).';
comment on column public.refund_requests.policy_code is
  '적용된 제33조 규칙. before_start(이용 시작 전 전액) / sessions_prorated(⑤ 잔여 회차 비례) / single_use_closed(③ 1회 이용권 개시 후) / period_tier(② 1개월 이내 계단) / period_prorated(⑧ 정가 재산정) / mixed(라인별 상이) / no_grant(부여 원장 없음).';
comment on column public.refund_requests.needs_review is
  'true = 자동 산정 근거가 불충분해 어드민이 반드시 눈으로 확인해야 하는 건(현재는 no_grant 케이스 한 종류). 환불 실행 화면에서 경고를 띄우는 용도.';
comment on column public.refund_requests.quote is
  '산정 당시 라인별 근거 스냅샷(fn_refund_quote.lines). 상품 정의·소비 이력이 나중에 바뀌어도 그때의 계산을 재구성할 수 있어야 한다.';

-- amount > 0 → >= 0. D2(1회 이용권 개시 후 0원)와 (라)의 1/2 경과 후 0원은
-- 정당한 산정 결과다. 신청 자체를 막지 않는 이유는 파일 상단 WC032 절 참고.
alter table public.refund_requests
  drop constraint if exists refund_requests_amount_check;
alter table public.refund_requests
  add constraint refund_requests_amount_check
  check (amount >= 0);

comment on constraint refund_requests_amount_check on public.refund_requests is
  '0원 환불 신청을 허용한다(sql/72). 제33조 ③(1회 이용권 개시 후)·②(1/2 경과 후)의 산정 결과가 정당하게 0원일 수 있다 — 그 경우에도 신청은 접수하고 어드민이 사유를 보고 판단한다. 2026-08-13 이전 제약은 amount > 0 이었다(sql/59, 전액 환불만 존재하던 시절).';

alter table public.refund_requests
  drop constraint if exists refund_requests_gross_amount_check;
alter table public.refund_requests
  add constraint refund_requests_gross_amount_check
  check (gross_amount is null or (gross_amount > 0 and amount <= gross_amount));

comment on constraint refund_requests_gross_amount_check on public.refund_requests is
  '환불액이 원 결제액을 넘을 수 없다. NULL 허용은 sql/72 이전 행(gross_amount 백필 근거 없음) 때문이다 — 신규 행은 fn_request_refund 가 항상 채운다.';


-- ---------------------------------------------------------------------
-- 2) fn_refund_quote : 제33조 산정 정본
--
--    읽기 전용(stable)이다. 모달이 금액을 미리 보여줄 때와
--    fn_request_refund 가 실제로 기록할 때가 **같은 함수**를 쓴다 —
--    화면과 DB가 다른 숫자를 말하는 일이 구조적으로 불가능해야 한다.
-- ---------------------------------------------------------------------
create or replace function public.fn_refund_quote(p_order_id text)
returns table (
  order_id      text,
  gross_amount  integer,
  refund_amount integer,
  fee_amount    integer,
  started       boolean,
  needs_review  boolean,
  policy_code   text,
  lines         jsonb
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_order        public.orders;
  v_caller       uuid := auth.uid();
  v_total_weight bigint := 0;
  v_allocated    integer := 0;
  v_idx          integer := 0;
  v_grant_count  integer := 0;
  v_line_paid    integer;
  v_line_list    integer;
  v_line_refund  integer;
  v_used         integer;
  v_ratio        numeric;
  v_completed    integer;
  v_charge       integer;
  v_monthly      integer;
  v_code         text;
  v_started      boolean := false;
  v_sum_refund   bigint := 0;
  v_codes        text[] := '{}';
  v_lines        jsonb := '[]'::jsonb;
  g              record;
begin
  select * into v_order from public.orders where id = p_order_id;

  -- 소유권 — fn_request_refund(sql/69)와 같은 쌍 판정. 존재하지 않음과
  -- 남의 주문을 같은 코드로 묶는다(존재 여부 스캐닝 방지).
  if v_order.id is null
     or (v_caller is distinct from v_order.student_profile_id
         and v_caller is distinct from v_order.parent_profile_id
         and not public.is_admin()) then
    raise exception 'order_not_found_or_not_owned' using errcode = 'WC005';
  end if;

  if v_order.status <> 'paid' then
    raise exception 'order_not_refundable' using errcode = 'WC006';
  end if;

  -- (가) 배분 가중치 — 살아있는 부여 라인의 paid_amount 합.
  select count(*), coalesce(sum(pg.paid_amount), 0)
    into v_grant_count, v_total_weight
    from public.program_access_grants pg
   where pg.order_id = p_order_id
     and pg.revoked_at is null;

  -- (사) 부여 원장이 없는 주문 — 산정 근거 없음. 전액 + 검토 플래그.
  if v_grant_count = 0 then
    return query select
      v_order.id, v_order.amount, v_order.amount, 0,
      false, true, 'no_grant'::text, '[]'::jsonb;
    return;
  end if;

  for g in
    select pg.id, pg.program_key, pg.product_slug, pg.paid_amount,
           pg.granted_months, pg.granted_sessions,
           pg.starts_at, pg.expires_at, pg.first_accessed_at,
           oi.list_price, oi.quantity, oi.name as item_name
      from public.program_access_grants pg
      left join public.order_items oi on oi.id = pg.order_item_id
     where pg.order_id = p_order_id
       and pg.revoked_at is null
     order by pg.id
  loop
    v_idx := v_idx + 1;

    -- (가) orders.amount 를 paid_amount 비율로 배분. 마지막 라인은 잔돈까지
    -- 흡수해 합이 정확히 orders.amount 가 되게 한다. 가중치 합이 0이면
    -- (paid_amount 가 전부 0인 비정상) 균등 배분으로 떨어뜨린다.
    if v_idx = v_grant_count then
      v_line_paid := v_order.amount - v_allocated;
    elsif v_total_weight > 0 then
      v_line_paid := floor(v_order.amount::numeric * g.paid_amount / v_total_weight)::integer;
    else
      v_line_paid := floor(v_order.amount::numeric / v_grant_count)::integer;
    end if;
    v_allocated := v_allocated + v_line_paid;

    v_line_list := coalesce(g.list_price, 0) * coalesce(g.quantity, 1);

    -- (나) 회차 순소비.
    select coalesce(sum(-l.delta), 0)::integer into v_used
      from public.performance_credit_ledger l
     where l.grant_id = g.id;

    v_ratio    := null;
    v_charge   := null;
    v_monthly  := null;

    if g.granted_sessions is not null then
      -- ── (다) 회차권 ──────────────────────────────────────────────
      if v_used <= 0 then
        v_line_refund := v_line_paid;
        v_code := 'before_start';
      elsif g.granted_sessions = 1 then
        -- D2 — 제33조 ③ + 제32조 ②. 개시 후 청약철회 제한.
        v_line_refund := 0;
        v_code := 'single_use_closed';
        v_started := true;
      else
        -- D1 — 미사용 잔여 회차분.
        v_line_refund := floor(
          v_line_paid::numeric
          * greatest(g.granted_sessions - v_used, 0)
          / g.granted_sessions
        )::integer;
        v_code := 'sessions_prorated';
        v_started := true;
      end if;

    elsif g.first_accessed_at is null then
      -- ── (나) 기간권 미개시 — ② 이용 시작 전 전액 ────────────────
      v_line_refund := v_line_paid;
      v_code := 'before_start';

    elsif coalesce(g.granted_months, 0) > 1 then
      -- ── (마) 1개월 초과 과정 — ⑧ 정가 재산정 ────────────────────
      v_started := true;

      -- 차감 월수 = 개시 후 경과 개월수의 올림. 완료 개월수를 세고,
      -- 그 경계를 넘어섰으면 +1(시작한 달은 한 달로 친다).
      select count(*)::integer into v_completed
        from generate_series(1, g.granted_months) i
       where public.fn_add_months_kst(g.starts_at, i) <= now();

      v_charge := least(
        g.granted_months,
        v_completed + case
          when now() > public.fn_add_months_kst(g.starts_at, v_completed) then 1
          else 0
        end
      );

      -- ⑧은 "할인율을 적용 받은" 경우의 규정이다. 정가 근거가 없으면
      -- (list_price 0) 결제액 월액으로 대체한다 — 없는 정가를 지어내지 않는다.
      v_monthly := round(
        (case when v_line_list > 0 then v_line_list else v_line_paid end)::numeric
        / g.granted_months
      )::integer;

      v_line_refund := greatest(0, least(v_line_paid, v_line_paid - v_monthly * v_charge));
      v_code := 'period_prorated';

    else
      -- ── (라) 1개월 이내 과정 — ② 계단 ───────────────────────────
      v_started := true;

      if g.expires_at is null or g.expires_at <= g.starts_at then
        -- 무기한/비정상 기간은 경과율을 정의할 수 없다. 전액으로 두고
        -- 검토 플래그가 서도록 아래에서 no_grant 와 같은 취급은 하지 않되,
        -- 사람이 볼 수 있게 별도 코드를 남긴다.
        v_line_refund := v_line_paid;
        v_code := 'period_unbounded';
      else
        v_ratio := extract(epoch from (now() - g.starts_at))
                 / extract(epoch from (g.expires_at - g.starts_at));

        v_line_refund := case
          when v_ratio < (1.0/3.0) then floor(v_line_paid::numeric * 2 / 3)::integer
          when v_ratio < 0.5       then floor(v_line_paid::numeric / 2)::integer
          else 0
        end;
        v_code := 'period_tier';
      end if;
    end if;

    v_sum_refund := v_sum_refund + v_line_refund;
    v_codes := v_codes || v_code;

    v_lines := v_lines || jsonb_build_object(
      'grant_id',          g.id,
      'program_key',       g.program_key,
      'product_slug',      g.product_slug,
      'item_name',         g.item_name,
      'paid_allocated',    v_line_paid,
      'list_amount',       v_line_list,
      'granted_months',    g.granted_months,
      'granted_sessions',  g.granted_sessions,
      'used_sessions',     v_used,
      'first_accessed_at', g.first_accessed_at,
      'elapsed_ratio',     v_ratio,
      'charge_months',     v_charge,
      'monthly_list',      v_monthly,
      'refund',            v_line_refund,
      'policy_code',       v_code
    );
  end loop;

  -- (바) 100원 단위 내림. 라인 합에 한 번만 적용한다(라인마다 절사하면
  -- 라인 수만큼 오차가 누적된다).
  v_sum_refund := floor(v_sum_refund::numeric / 100)::bigint * 100;
  v_sum_refund := greatest(0, least(v_sum_refund, v_order.amount));

  -- 대표 policy_code — 라인이 모두 같으면 그 값, 섞였으면 mixed.
  select case when count(distinct c) = 1 then min(c) else 'mixed' end
    into v_code
    from unnest(v_codes) c;

  return query select
    v_order.id,
    v_order.amount,
    v_sum_refund::integer,
    (v_order.amount - v_sum_refund)::integer,
    v_started,
    ('period_unbounded' = any(v_codes)),
    v_code,
    v_lines;
end;
$$;

comment on function public.fn_refund_quote(text) is
  '제33조 환불 금액 산정 정본(sql/72). 부여 원장 라인별로 ②/③/⑤/⑧을 적용해 합산하고 100원 단위로 내림한다. 모달 미리보기와 fn_request_refund 기록이 이 함수 하나를 공유한다 — 화면과 DB가 다른 금액을 말할 수 없게 하는 것이 이 함수의 존재 이유다. 소유권은 orders 의 학생/학부모 쌍 또는 is_admin()(WC005), 결제 상태는 paid 만(WC006).';

revoke all on function public.fn_refund_quote(text) from public, anon;
grant execute on function public.fn_refund_quote(text) to authenticated, service_role;


-- ---------------------------------------------------------------------
-- 3) fn_request_refund 재작성
--
--    sql/69 5-d) 원문에서 바뀐 곳은 두 군데뿐이다.
--      · WC032 소비 게이트 raise 제거 (파일 상단 절 참고)
--      · insert 의 amount 를 v_order.amount → 산정액으로 교체하고
--        gross_amount/policy_code/needs_review/quote 를 함께 기록
--    나머지(advisory lock, 쌍 판정 WC005, 결제 상태 WC006, 미종결 중복
--    WC007, 누적액 가드 WC037, 승인축 분기)는 원문 그대로다.
-- ---------------------------------------------------------------------
create or replace function public.fn_request_refund(
  p_order_id       text,
  p_reason         text,
  p_refund_bank    text default null,
  p_refund_account text default null,
  p_refund_holder  text default null
)
returns public.refund_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order             public.orders;
  v_row               public.refund_requests;
  v_caller            uuid := auth.uid();
  v_status            text;
  v_resp_at           timestamptz;
  v_completed_amount  integer;
  v_quote             record;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_order_id, 100));

  select * into v_order from public.orders where id = p_order_id;

  if v_order.id is null
     or (v_caller is distinct from v_order.student_profile_id
         and v_caller is distinct from v_order.parent_profile_id) then
    raise exception 'order_not_found_or_not_owned' using errcode = 'WC005';
  end if;

  if v_order.status <> 'paid' then
    raise exception 'order_not_refundable' using errcode = 'WC006';
  end if;

  -- ⚠ sql/69 에 있던 WC032 소비 게이트를 여기서 제거했다. 소비는 이제
  -- 신청을 막는 사유가 아니라 아래 산정의 입력이다(파일 상단 WC032 절).

  if exists (
    select 1 from public.refund_requests
     where order_id = p_order_id
       and order_item_id is null
       and status in ('requested', 'processing')
       and approval_status <> 'rejected'
  ) then
    raise exception 'duplicate_refund_request' using errcode = 'WC007';
  end if;

  v_completed_amount := public.fn_refund_completed_amount(p_order_id);
  if v_completed_amount >= v_order.amount then
    raise exception 'refund_amount_exceeds_paid'
      using errcode = 'WC037',
            detail  = format('order_id=%s completed_amount=%s orders.amount=%s',
                              p_order_id, v_completed_amount, v_order.amount);
  end if;

  -- 제33조 산정 — 화면이 보여준 것과 같은 함수(sql/72 2절).
  select * into v_quote from public.fn_refund_quote(p_order_id);

  -- 학생 신청 → 학부모 응답 대기. 학부모 신청 → 즉시 승인(사용자 확정 3번).
  if v_caller = v_order.parent_profile_id then
    v_status  := 'approved';
    v_resp_at := now();
  else
    v_status  := 'requested';
    v_resp_at := null;
  end if;

  insert into public.refund_requests (
    user_id, order_id, order_item_id, order_name, amount, reason,
    refund_bank, refund_account, refund_holder, status,
    student_profile_id, parent_profile_id, requested_by,
    approval_status, approval_responded_at,
    gross_amount, policy_code, needs_review, quote
  ) values (
    v_caller, v_order.id, null, v_order.order_name, v_quote.refund_amount, p_reason,
    p_refund_bank, p_refund_account, p_refund_holder, 'requested',
    v_order.student_profile_id, v_order.parent_profile_id, v_caller,
    v_status, v_resp_at,
    v_quote.gross_amount, v_quote.policy_code, v_quote.needs_review, v_quote.lines
  )
  returning * into v_row;

  return v_row;
end;
$$;

comment on function public.fn_request_refund(text, text, text, text, text) is
  '환불 신청 생성(sql/72 재작성). 금액은 fn_refund_quote(제33조 산정)가 정하고 호출자 입력은 받지 않는다 — gross_amount(원 결제액)·policy_code·quote(라인별 근거)를 함께 기록한다. sql/69 대비 변경점은 WC032 소비 게이트 제거(소비는 이제 금액을 깎는 입력) 하나뿐이며, 나머지 가드(WC005/WC006/WC007/WC037)와 승인축 분기는 원문 그대로다.';

revoke all on function public.fn_request_refund(text, text, text, text, text) from public, anon;
grant execute on function public.fn_request_refund(text, text, text, text, text) to authenticated;


-- ---------------------------------------------------------------------
-- 4) fn_complete_refund — 소비 재판정(WC032)을 재견적 가드(WC039)로 교체
--
--    sql/69 5-e) 원문에서 4)단계 블록만 바뀐다. 나머지 단계(권한 확인,
--    advisory lock, 승인축 WC035, 처리 가능 상태 WC036, 누적액 WC037,
--    완료 UPDATE, 권한 회수, 주문 종결)는 원문 그대로 유지한다.
-- ---------------------------------------------------------------------
create or replace function public.fn_complete_refund(
  p_refund_request_id bigint,
  p_admin_memo         text default null
)
returns public.refund_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order_id         text;
  v_row              public.refund_requests;
  v_order            public.orders;
  v_completed_amount integer;
  v_revoke_result    jsonb;
  v_quote            record;
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

  -- 4) 재견적 가드(WC039, sql/72) — sql/69 의 WC032 소비 재판정을 대체한다.
  -- 원래 의도(신청 → 추가 소비 → 완료 순서를 막는다)는 그대로 살리되,
  -- 이제는 소비가 있어도 환불 자체는 가능하므로 "금액이 줄었는가"로 판정한다.
  -- 줄었으면 조용히 깎지 않고 거부한다 — 금액이 바뀌면 신청자에게 다시
  -- 동의를 받아야 한다(어드민 반려 → 사용자 재신청).
  select * into v_quote from public.fn_refund_quote(v_row.order_id);
  if v_quote.refund_amount < v_row.amount then
    raise exception 'refund_quote_changed'
      using errcode = 'WC039',
            detail  = format('refund_request_id=%s requested_amount=%s current_quote=%s — 신청 이후 추가 이용이 발생했다. 반려 후 재신청을 받을 것.',
                              p_refund_request_id, v_row.amount, v_quote.refund_amount);
  end if;

  v_completed_amount := public.fn_refund_completed_amount(v_row.order_id);
  if v_completed_amount + v_row.amount > v_order.amount then
    raise exception 'refund_amount_exceeds_paid'
      using errcode = 'WC037',
            detail  = format('order_id=%s completed_amount=%s this_amount=%s orders.amount=%s',
                              v_row.order_id, v_completed_amount, v_row.amount, v_order.amount);
  end if;

  perform set_config('winning.refund_completing', p_refund_request_id::text, true);

  update public.refund_requests
     set status     = 'completed',
         admin_memo = coalesce(p_admin_memo, admin_memo)
   where id = p_refund_request_id
  returning * into v_row;

  v_revoke_result := public.fn_revoke_program_access_for_order(
    v_row.order_id, v_order.user_id, 'refunded', 'refund_completed');

  update public.orders
     set status = 'refunded'
   where id = v_row.order_id;

  return v_row;
end;
$$;

comment on function public.fn_complete_refund(bigint, text) is
  '환불 완료 단일 정본 RPC(sql/72 재작성). sql/69 대비 변경점은 4)단계뿐 — 소비 재판정(WC032 거부)을 재견적 가드(WC039)로 교체했다. 신청 이후 추가 이용이 생겨 산정액이 줄었으면 거부하고, 어드민이 반려한 뒤 사용자가 재신청하게 한다(금액 변경을 조용히 반영하지 않는다). 나머지(42501·WC026·WC035·WC036·WC037·권한 회수·주문 종결·5-f 트리거 연동)는 sql/69 원문 그대로다.';

revoke all on function public.fn_complete_refund(bigint, text) from public, anon;
grant execute on function public.fn_complete_refund(bigint, text) to authenticated, service_role;


-- =====================================================================
-- 확인용 (실행 후 눈으로 볼 것 — 아래는 주석, 자동 실행되지 않는다)
-- =====================================================================
-- 1) 컬럼·제약
-- select column_name, data_type, is_nullable from information_schema.columns
--  where table_schema='public' and table_name='refund_requests'
--    and column_name in ('amount','gross_amount','policy_code','needs_review','quote');
--
-- select conname, pg_get_constraintdef(oid) from pg_constraint
--  where conrelid='public.refund_requests'::regclass and contype='c'
--    and conname in ('refund_requests_amount_check','refund_requests_gross_amount_check');
--
-- 2) 산정 — 실제 paid 주문 하나로(학생/학부모 세션에서 실행할 것).
-- select * from public.fn_refund_quote('<order_id>');
--
-- 3) 회귀 — 미개시 주문은 전액이어야 한다(policy_code='before_start',
--    fee_amount=0). 소비된 주문은 더 이상 WC032 로 죽지 않아야 한다.
--
-- 4) 권한
-- select proname, pg_get_function_identity_arguments(oid), proacl from pg_proc
--  where proname in ('fn_refund_quote','fn_request_refund','fn_complete_refund');
-- =====================================================================
--
-- 적용 이력
-- =====================================================================
-- dev 적용: (미적용 — 적용 후 이 줄에 날짜를 남길 것)
-- 운영 반영은 별도 절차(dev sql 정본 재생성 → 운영 diff → 마이그레이션).
