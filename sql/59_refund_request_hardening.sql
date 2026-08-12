-- =====================================================================
-- 환불 신청(refund_requests) 경로 하드닝
-- Supabase SQL Editor 에서 실행하세요. (idempotent - 여러 번 실행해도 안전)
-- =====================================================================
--
-- 배경 — 감사 결과 M8 (P1)
--   refund_requests 는 pkey + FK 2개(order_id → orders SET NULL, user_id →
--   auth.users SET NULL) 뿐이고 CHECK 는 0건, 정책은 "insert own"(with check:
--   auth.uid() = user_id) / "select own"(using: auth.uid() = user_id) 두 개
--   뿐이었다 — 어드민 정책 0건(dev pg_policies 실측). src/pages/MyPage.jsx:
--   239 가 이 테이블에 **직접 INSERT** 하고 있었고, insert own 정책은
--   "본인 행인가"만 볼 뿐 컬럼 값은 전혀 제약하지 않는다. 즉 로그인 사용자가
--   브라우저 콘솔에서:
--     · amount 를 임의 값으로
--     · status 를 'completed' 로(기본값 'requested' 무시)
--     · order_id 에 타인의 주문번호로(FK 는 orders 존재만 보지 소유자를
--       안 본다 — orders 자체엔 select-own RLS 가 있어도 refund_requests
--       INSERT 문의 order_id 컬럼 값 자체엔 아무 검증이 없다)
--   를 자유롭게 보낼 수 있었다.
--
-- ---------------------------------------------------------------------
-- 0) 조사 (2026-08-11 dev 실측)
-- ---------------------------------------------------------------------
-- a) refund_requests 스키마·데이터 (00_base_schema.sql:866-881,
--    10_pricing_orders.sql:254-267 — 두 파일이 같은 테이블을 정의하는데
--    10 이 이 저장소의 실질 정본이다. 컬럼: id/user_id/order_id/order_name/
--    amount(default 0)/reason/refund_bank/refund_account/refund_holder/
--    status(default 'requested')/admin_memo/created_at. dev 실측 0행 —
--    이 파일이 새로 거는 CHECK 를 위반하는 기존 행이 없다(위반 시 데이터를
--    고치지 않고 보고만 하라는 지시였는데, 애초에 해당 사항 없음).
--
-- b) refunds 테이블 — refund_requests 와 무관한 별개 테이블이다(통합하지
--    않는다, 이번 범위 밖). 00_base_schema.sql:882-897 스키마:
--      id uuid, payment_id uuid, payer_name/program_name/class_name text,
--      paid_amount/refund_amount int, reason text,
--      status text default '취소요청'(한국어! '취소요청'/'환불완료'/'반려'
--      — Admin.jsx:2153 select 옵션과 일치), requested_at/memo/
--      created_at/updated_at.
--    refund_requests 로의 FK 가 없다(payment_id 는 이름상 결제 참조로
--    보이나 어떤 테이블도 참조하는 FK 제약이 없다 — 자유 텍스트/수기 입력에
--    가깝다). dev 실측 0행. 정책은 "refunds_admin_all"(is_admin() using +
--    with check, for ALL) 하나뿐 — 관리자가 Admin.jsx 화면에서 직접
--    타이핑해 만드는 수기 대장으로 보인다(payer_name/program_name/
--    class_name 컬럼 구성이 "학생별·클래스별 수강료 환불" 성격이라, 이
--    저장소의 온라인 체크아웃/쿠폰 도메인(orders/products)과는 다른 개념의
--    환불로 읽힌다).
--
-- c) src/pages/MyPage.jsx:239-249 — 환불 신청 INSERT 가 보내는 컬럼:
--    user_id/order_id/order_name/amount/reason/refund_bank/refund_account/
--    refund_holder/status('requested' 리터럴, 클라이언트가 명시). amount 는
--    화면에서 선택한 order.amount 를 그대로 보낸다(서버 재조회 없음 —
--    이번 하드닝의 핵심 결함).
--
-- d) src/pages/Admin.jsx:2131-2157 — '환불 요청 내역' 탭(activeKey
--    'refunds')의 config.table 은 **'refunds'** 다(2133행), 'refund_requests'
--    가 아니다. 즉 사용자가 MyPage 에서 신청한 refund_requests 행을 읽는
--    어드민 화면 경로가 이 저장소에 전혀 없다 — MyPage.jsx:259 가 "환불규정에
--    따라 검토 후 안내드리겠습니다" 라고 접수 확인을 띄우지만, 실제로는
--    아무도 그 신청을 보지 않는다. 이건 이번 하드닝(검증 도입)과는 다른
--    성격의 결함(테이블 간 배선 누락)이라 이 파일에서 고치지 않는다 — 아래
--    "발견했지만 손대지 않은 것" 참고. 이 파일은 3)절에서 refund_requests
--    에 어드민 select/update 정책만 추가해 "읽을 수 있는 경로"는 열어
--    두지만, Admin.jsx 화면을 refund_requests 로 연결하는 것은 별도 작업
--    (테이블 통합/화면 설계 판단, 팀 리드 지시로 범위 밖)이다.
--
-- e) status 어휘 — refund_requests.status 는 위 a)절 테이블 정의 주석에
--    이미 명시돼 있다: "-- requested | processing | completed | rejected"
--    (10_pricing_orders.sql:264). src/pages/MyPage.jsx:8-13 REFUND_STATUS
--    가 이 4개 값 전부에 라벨을 갖고 있고(접수/처리중/환불완료/반려),
--    INSERT 는 'requested' 리터럴만 보낸다(위 c)절) — 4개 외 다른 값을
--    쓰는 코드는 저장소 전체에 없다(grep 확인). 감사가 언급한
--    "환불완료/completed/refunded/canceled 4가지로 갈린다"는 사건은 이
--    테이블이 아니라 **refunds**(위 b)절, 한국어 어휘 '취소요청'/
--    '환불완료'/'반려') 및 orders.status(canceled) 를 뒤섞어 가리킨
--    것으로 보인다 — refund_requests 단독으로는 코드가 실제로 쓰는 값이
--    4개(requested/processing/completed/rejected)로 일관됐다. 그래서 이
--    4개를 CHECK 어휘로 확정한다(코드에 없는 값을 지어내지 않는다).
--
-- ---------------------------------------------------------------------
-- 결정 요약
-- ---------------------------------------------------------------------
--   · CHECK: amount > 0, status in ('requested','processing','completed',
--     'rejected'). 계좌 정보(refund_bank/account/holder) 는 제약 없음(팀
--     리드 지시 — 도메인 규칙 근거 없음).
--   · fn_request_refund(SECURITY DEFINER) 신설 — 클라이언트 직접 INSERT를
--     대체한다. 주문 소유권(orders.user_id = auth.uid()) · 결제 상태
--     (orders.status = 'paid') · 금액(서버가 orders.amount 를 그대로 사용,
--     부분 환불 미지원 — 근거는 아래) · 중복 신청 차단(같은 주문에
--     status in ('requested','processing') 인 행이 있으면 거부)을 강제한다.
--     status 는 함수가 'requested' 로 고정 — 호출자가 지정 불가.
--   · 부분 환불 미지원 이유 — MyPage.jsx/Checkout.jsx/api/ 전체에 "부분
--     환불액"을 사용자가 입력하거나 서버가 계산하는 경로가 없다(환불 신청
--     폼에 금액 입력 필드 자체가 없다 — order 선택만 한다). 전액 환불만
--     지원하는 현재 UX 와 어긋나지 않게, 금액은 항상 orders.amount 전액
--     이다. 부분 환불이 필요해지면 이 함수에 p_amount 인자를 추가하고
--     0 < p_amount <= orders.amount 검증을 넣는 것으로 확장 가능하되, 그건
--     새 UX 결정이라 지금 범위에 넣지 않는다.
--   · 중복 판정 — "진행 중" = status in ('requested','processing'). 이미
--     'completed'(환불 처리 끝) 나 'rejected'(반려, 재신청 여지가 있어야
--     한다)인 주문은 재신청을 막지 않는다 — 위 e)절 어휘 근거.
--   · insert own 정책 제거 — RPC 경유를 강제한다. 순서: 이 파일에서 RPC를
--     먼저 만들고, MyPage.jsx 를 RPC 호출로 먼저 바꾼 뒤에만 정책을
--     제거한다(같은 커밋/배포로 함께 나간다 — 순서가 어긋나면 정책 제거가
--     먼저 반영되는 배포 창에서 환불 신청 자체가 깨진다).
--   · 어드민 select/update 정책 추가 — profiles_admin_select_all 류 이름
--     규약(<테이블>_admin_<동사>_all)을 따른다.
--
-- SQLSTATE 배정 (기존 WC001~WC004 는 sql/55/58 — coupon/redemption 도메인)
--   WC005  order_not_found_or_not_owned   호출자가 이 주문의 소유자가
--                                         아니거나 존재하지 않는 주문.
--   WC006  order_not_refundable           orders.status <> 'paid'.
--   WC007  duplicate_refund_request       같은 주문에 진행 중(requested/
--                                         processing) 신청이 이미 있음.
--
-- 결제 상태 판정 근거 — orders.status 는 sql/55 0-d)절 CHECK 로
--   ('pending','paid','waiting_deposit','failed','canceled') 만 허용된다.
--   MyPage.jsx:220 refundableOrders 가 이미 status='paid' 만 환불 대상으로
--   필터링하고 있다(주석: "가상계좌 미입금(waiting_deposit) 건은 아직 들어온
--   돈이 없어 환불할 대상이 아니므로 목록에서 뺀다"). 그 판단을 그대로
--   서버 강제로 승격한다 — pending/waiting_deposit/failed/canceled 는 전부
--   거부(들어온 적 없는 돈이거나 이미 끝난 주문이라 환불 신청 대상이 아니다).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) CHECK 제약
-- ---------------------------------------------------------------------
alter table public.refund_requests
  drop constraint if exists refund_requests_amount_check;
alter table public.refund_requests
  add constraint refund_requests_amount_check
  check (amount > 0);

comment on constraint refund_requests_amount_check on public.refund_requests is
  '0원 이하 환불 신청 차단. fn_request_refund 가 항상 orders.amount(이미 orders_amount_check 로 > 0 보장됨)를 그대로 쓰므로 RPC 경유 신청은 항상 이 조건을 만족한다(M8, 2026-08-11).';

alter table public.refund_requests
  drop constraint if exists refund_requests_status_check;
alter table public.refund_requests
  add constraint refund_requests_status_check
  check (status in ('requested', 'processing', 'completed', 'rejected'));

comment on constraint refund_requests_status_check on public.refund_requests is
  '10_pricing_orders.sql:264 테이블 주석 및 src/pages/MyPage.jsx REFUND_STATUS 라벨과 일치하는 4개 값(M8, 2026-08-11). 신규 값 도입 시 두 파일과 함께 갱신할 것.';

-- ---------------------------------------------------------------------
-- 2) fn_request_refund : 클라이언트 직접 INSERT 를 대체하는 SECURITY
--    DEFINER RPC. 주문 소유권·결제 상태·금액·중복 신청을 서버에서 강제한다.
-- ---------------------------------------------------------------------
drop function if exists public.fn_request_refund(text, text, text, text, text);

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
  v_order public.orders;
  v_row   public.refund_requests;
begin
  -- 같은 주문에 대한 동시 이중 클릭/중복 호출을 직렬화한다. sql/55
  -- fn_redeem_coupons 의 advisory lock 패턴과 동일 원칙 — 아래 3)절
  -- 중복 판정(EXISTS)이 잠금 없이는 두 트랜잭션이 동시에 통과할 수 있다
  -- (TOCTOU). salt 100 은 sql/55 가 이미 쓰는 salt 1/2(쿠폰 도메인)와
  -- 겹치지 않는 별도 네임스페이스다.
  perform pg_advisory_xact_lock(hashtextextended(p_order_id, 100));

  select * into v_order from public.orders where id = p_order_id;

  -- 주문이 없거나(오타·존재하지 않는 id) 호출자 소유가 아니면 둘 다 같은
  -- 코드로 묶는다 — "존재하지 않음"과 "타인 소유"를 구분해 알려주면 존재
  -- 여부 스캐닝에 쓰일 수 있다(다른 하드닝 파일들과 동일 원칙).
  if v_order.id is null or v_order.user_id is distinct from auth.uid() then
    raise exception 'order_not_found_or_not_owned' using errcode = 'WC005';
  end if;

  -- 입금이 확인된 주문만 환불 신청 대상이다. MyPage.jsx:220 의 클라이언트
  -- 필터(status='paid')를 서버 강제로 승격 — waiting_deposit(입금 전)·
  -- pending·failed·canceled 는 전부 거부.
  if v_order.status <> 'paid' then
    raise exception 'order_not_refundable' using errcode = 'WC006';
  end if;

  -- 같은 주문에 진행 중인 신청이 있으면 거부. completed/rejected 는 진행
  -- 중이 아니므로 재신청을 막지 않는다(위 "결정 요약" 참고).
  if exists (
    select 1 from public.refund_requests
     where order_id = p_order_id
       and status in ('requested', 'processing')
  ) then
    raise exception 'duplicate_refund_request' using errcode = 'WC007';
  end if;

  -- 금액은 호출자가 보낸 값을 신뢰하지 않는다 — orders.amount(과금 정본,
  -- orders_amount_check 로 이미 > 0 보장됨)에서 서버가 가져온다. 부분 환불은
  -- 미지원(전액) — 근거는 파일 상단 "결정 요약" 참고. status 는 함수가
  -- 'requested' 로 고정하며 호출자가 지정할 수 없다.
  insert into public.refund_requests (
    user_id, order_id, order_name, amount, reason,
    refund_bank, refund_account, refund_holder, status
  ) values (
    auth.uid(), v_order.id, v_order.order_name, v_order.amount, p_reason,
    p_refund_bank, p_refund_account, p_refund_holder, 'requested'
  )
  returning * into v_row;

  return v_row;
end;
$$;

comment on function public.fn_request_refund(text, text, text, text, text) is
  '환불 신청 생성. 주문 소유권(WC005)·결제 상태=paid(WC006)·중복 신청(WC007)을 강제하고, 금액은 orders.amount 에서 서버가 가져온다(호출자 입력 무시, 전액만 지원). status 는 항상 requested 로 시작한다(M8, 2026-08-11).';

-- 비회원은 주문 소유권을 증명할 수 없다(auth.uid() 가 필요) — authenticated 에만 부여.
revoke all on function public.fn_request_refund(text, text, text, text, text) from public, anon;
grant execute on function public.fn_request_refund(text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 3) RLS 정책 정리
--    insert own 제거 — RPC 경유를 강제한다. select own 은 유지(본인 신청
--    조회는 계속 필요 — MyPage.jsx:262-266).
-- ---------------------------------------------------------------------
drop policy if exists "refund_requests insert own" on public.refund_requests;

-- 어드민 select/update. 이름 규약은 profiles_admin_select_all 류
-- (<테이블>_admin_<동사>_all)를 따른다. delete 정책은 만들지 않는다 —
-- 이 파일의 다른 하드닝(sql/55 1-d/1-g, sql/56)과 같은 원칙: 처리 상태는
-- status/admin_memo UPDATE 로 남기고 원장 행 자체는 삭제하지 않는다.
drop policy if exists "refund_requests_admin_select_all" on public.refund_requests;
create policy "refund_requests_admin_select_all" on public.refund_requests
  for select to authenticated
  using (public.is_admin());

drop policy if exists "refund_requests_admin_update_all" on public.refund_requests;
create policy "refund_requests_admin_update_all" on public.refund_requests
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- =====================================================================
-- 확인용 (실행 후 눈으로 볼 것 — 아래는 주석, 자동 실행되지 않는다)
-- =====================================================================
-- select conname, pg_get_constraintdef(oid) as def from pg_constraint
-- where conrelid = 'public.refund_requests'::regclass and contype = 'c';
--
-- select policyname, cmd, roles, qual, with_check from pg_policies
-- where schemaname='public' and tablename='refund_requests' order by policyname;
--
-- select proname, pg_get_function_identity_arguments(oid) as args, proacl
-- from pg_proc where proname = 'fn_request_refund';
-- =====================================================================
--
-- 적용 이력
-- =====================================================================
-- dev(gjowqdiopinhixfivnkx) 적용·검증 완료: 2026-08-11. 운영 반영은 별도
-- 절차(dev sql 정본 재생성 → 운영 diff → 마이그레이션). 운영 DB는 이 작업
-- 범위에서 접근하지 않았다(사용자 지시).
