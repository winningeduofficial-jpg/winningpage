-- =====================================================================
-- 68_enrollment_request_pair.sql
-- 결제(수강신청)를 "학생 + 학부모" 쌍으로 고정 — 신청→수락 흐름 + 환불
-- 학생·학부모 양쪽 신청/승인 축 도입
-- Supabase SQL Editor 에서 실행하세요. (idempotent - 여러 번 실행해도 안전)
-- =====================================================================
--
-- 배경 (2026-08-12 팀 리드 지시, dev(gjowqdiopinhixfivnkx) 실측)
--   orders 0행 · order_items 0행 · program_access 0행 · program_access_grants 0행
--   performance_credit_ledger 0행 · payments 0행 · refunds 0행 · refund_requests 0행
--   profiles: student 4, parent 1, member_type NULL 3(그중 1명 role=admin)
--   parent_child_links: approved 4건(이동희 parent ↔ 학생 4명)
--   → 백필 부담 없음. 그래도 재실행 안전 관례(sql/64~67)를 그대로 따른다.
--
-- 제품 규칙 (사용자 확정, 변경 금지)
--   1) 결제건은 "학생" + "학부모"가 항상 쌍이다(단독 결제 없음).
--   2) 흐름: 학생이 결제 요청(수강신청) → 학부모가 수락/반려 → 수락된 건만 결제.
--   3) 환불은 학생·학부모 각자 신청 가능. 학생 신청은 학부모 승인이 필요하고,
--      학부모 신청은 승인 단계 없이 바로 어드민 처리로 간다.
--   4) 학부모가 환불 신청을 반려하면 학생이 같은 주문으로 재신청 가능(반려
--      건은 이력으로 남긴다).
--   5) 권한 수혜자는 항상 학생. 결제자는 학부모.
--   6) 권한 회수 시점은 환불 status='completed'. 학부모 승인만으로는 회수 안 함.
--
-- ---------------------------------------------------------------------
-- 조사 — orders 를 insert 하는 경로 / 쌍이 채워질 지점
-- ---------------------------------------------------------------------
--   orders 에 INSERT 하는 코드 경로는 sql/55_coupon_policy.sql fn_redeem_coupons
--   단 하나다(sql/58 0절에서 이미 grep 확인된 사실, 재확인). 호출부는
--   api/create-order.js:117-134 로 p_user_id 자리에 로그인한 사용자(auth.uid())
--   하나만 보낸다 — "학생/학부모 쌍" 개념 자체가 이 함수에 없었다. orders 에
--   student_profile_id/parent_profile_id 를 NOT NULL 로 걸면 이 INSERT 문이
--   그대로는 항상 실패하므로, 이 파일은 fn_redeem_coupons 의 시그니처를 바꿔
--   쌍을 받는다(3)절). api 배선(create-order.js 수정)은 팀 리드 지시대로
--   다음 단계 — 이 파일은 DB 쪽만 완결시킨다.
--
--   coupon_redemptions.user_id(쿠폰 사용 이력의 "누가")는 학생(수혜자) 축을
--   쓴다(2026-08-12 사용자 확정: "학부모가 결제 측. 학생의 쿠폰을 학부모도
--   쓸 수 있음. 사용 시 학생의 쿠폰인 걸 명시"). 결제자=학부모 축이 아니다.
--   근거(dev 실측) — 발급 트리거 on_auth_user_created_coupon_grant →
--   fn_grant_signup_coupons 는 auth.users AFTER INSERT 에 걸려 있고, 그
--   시점엔 member_type 이 아직 없다(가입 RPC가 나중에 채운다) — 즉 학생·
--   학부모 구분 없이 전원에게 발급된다. dev 쿠폰 3종 중 축이 갈리는 건
--   signup-2000(발급형, max_uses_per_user=1) 하나뿐이고(나머지 2종은
--   max_uses_per_user NULL=무제한이라 축 무관), 학부모 축을 쓰면 자녀 N명이
--   딸린 학부모 1명이 축하쿠폰을 1회만 쓸 수 있어(dev 이동희 케이스: 자녀
--   4명, 학부모 축=전역 1회) 학생 4명분 쿠폰이 죽는다 — 사용자는 반대(학생
--   축, 자녀별 1회)를 확정했다. 결제 실행자(학부모)는 coupon_redemptions 에
--   복제하지 않는다 — order_id FK 로 orders.parent_profile_id 를 타고 도출된다
--   (program_access_grants 에 학부모를 안 넣은 것과 같은 원칙, 5-e/5-f절).
--
-- ---------------------------------------------------------------------
-- 이 파일이 하지 않는 것 (명시적 제외)
-- ---------------------------------------------------------------------
--   · api/create-order.js·api/confirm-payment.js·api/toss-webhook.js 등
--     호출부 수정 — 다음 단계(별도 작업). 아래 4)/5)절 함수 시그니처가
--     바뀐 지점을 보고서에 명시한다.
--   · 어드민 화면(환불 처리 등) — 기존 sql/59 그대로.
--   · parent_child_links 상태를 판정에 사용 — 의도적으로 배제한다(아래
--     fn_request_refund 주석 참고, 링크가 나중에 revoked 돼도 그 주문의
--     환불 권한은 유지되어야 한다).
-- =====================================================================


-- =====================================================================
-- 1) orders — 쌍 + 승인축
-- =====================================================================
alter table public.orders
  add column if not exists student_profile_id uuid,
  add column if not exists parent_profile_id  uuid,
  add column if not exists approval_status    text not null default 'requested',
  add column if not exists requested_at       timestamptz not null default now(),
  add column if not exists responded_at       timestamptz,
  add column if not exists reject_reason      text;

-- NOT NULL 가드 — dev 는 0행이라 그냥 걸리지만, 혹시 행이 있으면 그 사실을
-- 먼저 알리고(조용히 넘기지 않는다) 바로 아래 ALTER 가 23502 로 명확히
-- 실패하게 둔다. 쌍 정보는 이번에 새로 도입되는 개념이라 백필 근거가 없다.
do $$
declare
  v_cnt int;
begin
  select count(*) into v_cnt from public.orders;
  if v_cnt > 0 then
    raise warning 'orders 기존 % 행 발견 — student_profile_id/parent_profile_id 를 채울 근거(백필 규칙)가 없다. 아래 NOT NULL 추가가 23502 로 실패할 것이다(sql/68, 의도된 동작).', v_cnt;
  end if;
end $$;

alter table public.orders alter column student_profile_id set not null;
alter table public.orders alter column parent_profile_id  set not null;

alter table public.orders drop constraint if exists orders_student_profile_id_fkey;
alter table public.orders add constraint orders_student_profile_id_fkey
  foreign key (student_profile_id) references public.profiles (id) on delete restrict;

alter table public.orders drop constraint if exists orders_parent_profile_id_fkey;
alter table public.orders add constraint orders_parent_profile_id_fkey
  foreign key (parent_profile_id) references public.profiles (id) on delete restrict;

comment on column public.orders.student_profile_id is
  '권한 수혜자(학생). 결제로 이용 권한을 받는 쪽은 항상 학생이다(사용자 확정, sql/68).';
comment on column public.orders.parent_profile_id is
  '결제 실행자(학부모). orders.user_id 는 이 값과 항상 같다(orders_user_id_is_parent_check).';

-- 승인축 CHECK 5종.
alter table public.orders drop constraint if exists orders_approval_status_check;
alter table public.orders add constraint orders_approval_status_check
  check (approval_status in ('requested', 'approved', 'rejected'));

alter table public.orders drop constraint if exists orders_pair_distinct_check;
alter table public.orders add constraint orders_pair_distinct_check
  check (student_profile_id <> parent_profile_id);

alter table public.orders drop constraint if exists orders_reject_reason_pairing_check;
alter table public.orders add constraint orders_reject_reason_pairing_check
  check ((approval_status = 'rejected') = (reject_reason is not null));

alter table public.orders drop constraint if exists orders_responded_at_pairing_check;
alter table public.orders add constraint orders_responded_at_pairing_check
  check ((approval_status = 'requested') = (responded_at is null));

-- 미승인 결제 차단 — 학부모가 수락하기 전에는 status 가 pending/canceled
-- 바깥으로 나갈 수 없다(paid/waiting_deposit/failed 는 승인 후에만 가능).
alter table public.orders drop constraint if exists orders_approval_before_payment_check;
alter table public.orders add constraint orders_approval_before_payment_check
  check (approval_status = 'approved' or status in ('pending', 'canceled'));

comment on constraint orders_approval_before_payment_check on public.orders is
  '학부모 수락 전에는 결제가 진행될 수 없다 — approval_status 가 requested/rejected 인 동안 orders.status 는 pending 또는 canceled 만 허용된다(사용자 확정 흐름: 학생 신청 → 학부모 수락 → 결제, sql/68).';

-- 결제 실행자 = 학부모. orders.user_id 는 지우지 않는다 — 코드 전체와 RLS가
-- 이 컬럼에 걸려 있다. 의미를 "결제 실행자 = parent_profile_id" 로 고정한다.
alter table public.orders drop constraint if exists orders_user_id_is_parent_check;
alter table public.orders add constraint orders_user_id_is_parent_check
  check (user_id = parent_profile_id);

comment on constraint orders_user_id_is_parent_check on public.orders is
  'orders.user_id(결제 실행자, sql/67 로 NOT NULL)는 이제 항상 parent_profile_id 와 같다 — 기존 컬럼·RLS·호출부를 깨지 않으면서 의미를 고정한다(사용자 확정: 결제자=학부모, sql/68).';

-- 조회 편의 인덱스(학생/학부모 각자 자기 주문 목록).
create index if not exists orders_student_idx on public.orders (student_profile_id, created_at desc);
create index if not exists orders_parent_idx  on public.orders (parent_profile_id, created_at desc);


-- =====================================================================
-- 2) orders RLS — 학생도 자기 주문을 볼 수 있도록 확장
--    기존 "orders select own" 은 auth.uid() = user_id(=학부모) 하나뿐이라
--    학생이 자기 주문을 못 봤다. INSERT 정책은 만들지 않는다 — RPC 경유
--    유지가 이 저장소 방침이다(sql/59 동일 원칙).
-- =====================================================================
drop policy if exists "orders select own" on public.orders;
create policy "orders select own" on public.orders
  for select to authenticated
  using (auth.uid() in (student_profile_id, parent_profile_id) or public.is_admin());


-- =====================================================================
-- 3) refund_requests — 쌍 + 승인축
-- =====================================================================
alter table public.refund_requests
  add column if not exists student_profile_id     uuid,
  add column if not exists parent_profile_id      uuid,
  add column if not exists requested_by           uuid,
  add column if not exists approval_status        text,
  add column if not exists approval_responded_at  timestamptz,
  add column if not exists approval_reject_reason text,
  -- 항목 단위(부분) 환불 설계를 열어두는 자리(2026-08-12 팀 리드 지시,
  -- 2차 범위) — nullable 로 둔다. 아래 comment on column 참고.
  add column if not exists order_item_id          bigint;

do $$
declare
  v_cnt int;
begin
  select count(*) into v_cnt from public.refund_requests;
  if v_cnt > 0 then
    raise warning 'refund_requests 기존 % 행 발견 — student_profile_id/parent_profile_id/requested_by/approval_status 를 채울 근거(백필 규칙)가 없다. 아래 NOT NULL 추가가 23502 로 실패할 것이다(sql/68, 의도된 동작).', v_cnt;
  end if;
end $$;

alter table public.refund_requests alter column student_profile_id set not null;
alter table public.refund_requests alter column parent_profile_id  set not null;
alter table public.refund_requests alter column requested_by       set not null;
alter table public.refund_requests alter column approval_status    set not null;

-- user_id/order_id — SET NULL 은 승인 주체·주문이 사라진 환불 건을 만든다.
-- NOT NULL + RESTRICT 로 바꾼다(sql/67 orders.user_id 와 동일 판단 근거).
alter table public.refund_requests alter column user_id  set not null;
alter table public.refund_requests alter column order_id set not null;

alter table public.refund_requests drop constraint if exists refund_requests_user_id_fkey;
alter table public.refund_requests add constraint refund_requests_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete restrict;

alter table public.refund_requests drop constraint if exists refund_requests_order_id_fkey;
alter table public.refund_requests add constraint refund_requests_order_id_fkey
  foreign key (order_id) references public.orders (id) on delete restrict;

alter table public.refund_requests drop constraint if exists refund_requests_student_profile_id_fkey;
alter table public.refund_requests add constraint refund_requests_student_profile_id_fkey
  foreign key (student_profile_id) references public.profiles (id) on delete restrict;

alter table public.refund_requests drop constraint if exists refund_requests_parent_profile_id_fkey;
alter table public.refund_requests add constraint refund_requests_parent_profile_id_fkey
  foreign key (parent_profile_id) references public.profiles (id) on delete restrict;

alter table public.refund_requests drop constraint if exists refund_requests_requested_by_fkey;
alter table public.refund_requests add constraint refund_requests_requested_by_fkey
  foreign key (requested_by) references public.profiles (id) on delete restrict;

-- order_items 는 주문 삭제 시 CASCADE(sql/10)지만, 그 CASCADE 가 여기
-- RESTRICT 에 걸려 실패한다 — program_access_grants.order_item_id 와 같은
-- 판단 근거(sql/64): 환불 이력이 있는 항목은 지울 수 없다.
alter table public.refund_requests drop constraint if exists refund_requests_order_item_id_fkey;
alter table public.refund_requests add constraint refund_requests_order_item_id_fkey
  foreign key (order_item_id) references public.order_items (id) on delete restrict;

comment on column public.refund_requests.order_item_id is
  '항목 단위(부분) 환불 확장 지점(2026-08-12 팀 리드 지시) — 1차는 이 컬럼을 항상 NULL 로 채운다(fn_request_refund 가 인자를 받지 않는다). NULL = 주문 전체 환불(1차가 쓰는 유일한 값). 값이 있으면 그 order_item 하나에 대한 부분 환불(2차, 미구현) — 그때 fn_request_refund 에 p_order_item_id 인자와 항목 금액 산정(order_items.price * quantity 기준이 될 것)을 추가하면 스키마 변경 없이 열린다.';

comment on column public.refund_requests.student_profile_id is
  '이 환불이 속한 주문의 학생(orders.student_profile_id 스냅샷). 승인 판정은 이 값으로 하지 parent_child_links 현재 상태로 하지 않는다(sql/68 fn_request_refund 주석).';
comment on column public.refund_requests.parent_profile_id is
  '이 환불이 속한 주문의 학부모(orders.parent_profile_id 스냅샷).';
comment on column public.refund_requests.requested_by is
  '이 환불을 실제로 신청한 사람(학생 또는 학부모). user_id 와 항상 같다(refund_requests_user_id_is_requester_check).';
comment on column public.refund_requests.approval_status is
  '학부모 승인축. 학생 신청은 requested 로 시작해 학부모 응답을 기다린다. 학부모 본인 신청은 즉시 approved(refund_requests_parent_auto_approve_check). status(어드민 처리축)와는 별개다 — status 는 approval_status=approved 가 되기 전까지 requested 를 벗어나지 못한다(refund_requests_approval_before_processing_check).';

-- 승인축 CHECK 5종 + user_id 의미 고정 CHECK.
alter table public.refund_requests drop constraint if exists refund_requests_approval_status_check;
alter table public.refund_requests add constraint refund_requests_approval_status_check
  check (approval_status in ('requested', 'approved', 'rejected'));

alter table public.refund_requests drop constraint if exists refund_requests_requested_by_pair_check;
alter table public.refund_requests add constraint refund_requests_requested_by_pair_check
  check (requested_by in (student_profile_id, parent_profile_id));

-- 학부모 신청은 승인 단계 없이 바로 어드민 처리로 간다(사용자 확정 3번).
alter table public.refund_requests drop constraint if exists refund_requests_parent_auto_approve_check;
alter table public.refund_requests add constraint refund_requests_parent_auto_approve_check
  check (requested_by <> parent_profile_id or approval_status = 'approved');

-- 미승인은 어드민 처리(status)로 못 넘어간다 — status 는 그대로 이 파일
-- 이전부터 있던 어드민 처리축(requested/processing/completed/rejected,
-- sql/59)이고, approval_status(학부모 승인축)와 완전히 별개다.
alter table public.refund_requests drop constraint if exists refund_requests_approval_before_processing_check;
alter table public.refund_requests add constraint refund_requests_approval_before_processing_check
  check (approval_status = 'approved' or status = 'requested');

alter table public.refund_requests drop constraint if exists refund_requests_reject_reason_pairing_check;
alter table public.refund_requests add constraint refund_requests_reject_reason_pairing_check
  check ((approval_status = 'rejected') = (approval_reject_reason is not null));

alter table public.refund_requests drop constraint if exists refund_requests_responded_at_pairing_check;
alter table public.refund_requests add constraint refund_requests_responded_at_pairing_check
  check ((approval_status = 'requested') = (approval_responded_at is null));

alter table public.refund_requests drop constraint if exists refund_requests_user_id_is_requester_check;
alter table public.refund_requests add constraint refund_requests_user_id_is_requester_check
  check (user_id = requested_by);

-- 재신청 허용 — UNIQUE(order_id) 대신 "미종결 건 1개만" 부분 유니크.
--   미종결 = 어드민 처리가 아직 안 끝났고(status in requested/processing)
--   AND 학부모가 반려하지 않은 건(approval_status <> rejected).
--   이 조건 하나로 두 반려 경로가 모두 빠진다:
--     · 학부모 반려 → approval_status='rejected' (student_id 재신청 허용,
--       refund_requests_approval_before_processing_check 상 이때 status 는
--       항상 'requested' 로 고정돼 있다 — status 축만으로는 안 빠지므로
--       approval_status 조건이 반드시 필요하다)
--     · 어드민 반려 → status='rejected' (status 축만으로 이미 빠짐)
--   완료(completed) 건도 status 축만으로 빠진다. 반려·완료 건은 여러 개
--   쌓일 수 있어야 하므로(사용자 확정 4번) 이 인덱스 대상에서 제외한다.
--   ⚠ 부분 유니크는 ON CONFLICT arbiter 로 못 쓴다(42P10) — 아래 4)절
--   fn_request_refund 는 advisory lock + 명시적 EXISTS 분기로 처리한다.
--
--   2026-08-12 팀 리드 지시 — 항목 단위(2차) 설계를 열어두려고 인덱스
--   축에 order_item_id 를 더한다. 1차는 이 함수가 항상 order_item_id=NULL
--   만 넣지만, 인덱스는 이미 지금부터 (order_id, order_item_id) 조합으로
--   미종결 1건을 강제해야 2차(항목별 다른 미종결 건 허용)가 스키마 변경
--   없이 열린다.
--
--   ⚠ NULLS NOT DISTINCT 필수 — 기본(NULLS DISTINCT) unique 는 NULL 을
--   서로 다르게 취급해 (order_id, NULL) 이 몇 번을 반복해도 전부 서로
--   다른 값으로 보고 통과시킨다. 팀 리드가 PG 17.6 dev 에서 직접 측정:
--     NULLS NOT DISTINCT (a, b)  (o1, NULL) 두 번 → 두 번째 rejected 23505 (정상)
--                                 (o1, 7)    두 번 → 두 번째 rejected 23505 (정상)
--     기본값(NULLS DISTINCT)      (o1, NULL) 두 번 → 두 번째도 ACCEPTED (중복 통과 — 뚫림)
--   1차는 order_item_id 가 항상 NULL 이므로, 이 옵션이 없으면 "주문당
--   미종결 1건"이라는 이 인덱스의 존재 이유 자체가 무효화된다.
--
--   `create ... if not exists` 는 이름만 보고 정의(컬럼·옵션)는 비교하지
--   않는다 — 이 파일 앞선 판이 이미 (order_id) 1컬럼짜리로 적용됐다면
--   그 정의가 조용히 남는다. DROP 후 CREATE 로 교체한다(팀 리드 지시).
drop index if exists public.refund_requests_open_order_uniq;
create unique index if not exists refund_requests_open_order_uniq
  on public.refund_requests (order_id, order_item_id) nulls not distinct
  where status in ('requested', 'processing') and approval_status <> 'rejected';

comment on index public.refund_requests_open_order_uniq is
  '(주문, 항목) 당 미종결(어드민 미처리 + 학부모 미반려) 환불 신청은 1건만. order_item_id 는 1차엔 항상 NULL(주문 전체 환불) — NULLS NOT DISTINCT 가 없으면 NULL 은 서로 다른 값으로 취급돼 같은 주문에 대한 중복 신청이 조용히 통과한다(팀 리드 dev 실측, sql/68). 반려·완료 건은 이 인덱스 대상이 아니라 여러 개 쌓일 수 있다 — 학부모 반려 후 재신청 허용(사용자 확정 4번, sql/68).';

create index if not exists refund_requests_student_idx on public.refund_requests (student_profile_id, created_at desc);
create index if not exists refund_requests_parent_idx  on public.refund_requests (parent_profile_id, created_at desc);


-- =====================================================================
-- 4) refund_requests RLS — select 를 쌍으로 넓힌다.
--    insert own 정책은 sql/59 가 이미 제거했다(위조 방지, RPC 경유 강제) —
--    다시 만들지 않는다. admin_select_all/admin_update_all(sql/59)은 그대로
--    둔다(permissive 정책은 OR 로 합쳐지므로 이 select 정책과 공존한다).
-- =====================================================================
drop policy if exists "refund_requests select own" on public.refund_requests;
create policy "refund_requests select own" on public.refund_requests
  for select to authenticated
  using (auth.uid() in (student_profile_id, parent_profile_id) or public.is_admin());


-- =====================================================================
-- 5) RPC
-- =====================================================================

-- ---------------------------------------------------------------------
-- 5-a) fn_respond_enrollment : 학부모가 학생의 수강신청(주문)에 응답한다.
--    orders 행 자체를 SELECT ... FOR UPDATE 로 잠그므로 별도 advisory lock
--    이 필요 없다(이 함수가 그 행에 쓰는 유일한 동시 경합 지점이다).
-- ---------------------------------------------------------------------
create or replace function public.fn_respond_enrollment(
  p_order_id      text,
  p_approve       boolean,
  p_reject_reason text default null
)
returns public.orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders;
  v_bad   int;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'WC021';
  end if;

  if v_order.parent_profile_id is distinct from auth.uid() then
    raise exception 'not_order_parent' using errcode = 'WC022';
  end if;

  if v_order.approval_status <> 'requested' then
    raise exception 'enrollment_not_pending' using errcode = 'WC023';
  end if;

  if p_approve then
    -- 요청과 수락 사이에 쿠폰이 만료·소진될 수 있다. 재검증에서 하나라도
    -- ok=false 면 승인을 막는다 — 금액을 여기서 몰래 조정하지 않는다
    -- (orders_amount_balance_check 가 있어 조용히 어긋날 수 없다). 사용자는
    -- 새 신청(새 주문)으로 다시 진행해야 한다.
    select count(*) into v_bad
      from public.fn_revalidate_order_coupons(p_order_id) r
     where r.ok = false;

    if v_bad > 0 then
      raise exception 'coupon_revalidation_failed' using errcode = 'WC024';
    end if;

    update public.orders
       set approval_status = 'approved',
           responded_at    = now()
     where id = p_order_id
    returning * into v_order;
  else
    if coalesce(btrim(p_reject_reason), '') = '' then
      raise exception 'reject_reason_required' using errcode = 'WC025';
    end if;

    update public.orders
       set approval_status = 'rejected',
           responded_at    = now(),
           reject_reason   = p_reject_reason,
           -- 승인 전 주문은 orders_approval_before_payment_check 상 항상
           -- pending/canceled 였다 — 반려는 그 주문을 종결시킨다.
           status          = 'canceled'
     where id = p_order_id
    returning * into v_order;
  end if;

  return v_order;
end;
$$;

comment on function public.fn_respond_enrollment(text, boolean, text) is
  '학부모가 학생의 수강신청(주문)을 수락/반려한다. 호출자는 반드시 그 주문의 parent_profile_id(WC022) 여야 하고 approval_status 가 requested 여야 한다(WC023). 승인 시 fn_revalidate_order_coupons 로 쿠폰을 재검증해 실패하면 막는다(WC024, 재신청 유도). 반려 시 사유 필수(WC025)이며 orders.status 를 canceled 로 내린다(sql/68).';

revoke all on function public.fn_respond_enrollment(text, boolean, text) from public, anon;
grant execute on function public.fn_respond_enrollment(text, boolean, text) to authenticated;


-- ---------------------------------------------------------------------
-- 5-b) fn_request_refund 재작성 : 시그니처 그대로, 학생/학부모 쌍 판정 도입.
--    금액 파라미터는 추가하지 않는다(sql/59 설계 유지 — 금액은 orders 에서
--    도출, 위조 불가). 신청자가 그 주문의 학생/학부모인지는 orders 에 박힌
--    쌍 스냅샷으로 판정한다 — parent_child_links 의 "지금" 상태를 보지
--    않는다. 그 링크가 나중에 revoked 되어도 이미 성립한 결제 건의 환불
--    권한은 유지되어야 하기 때문이다(사용자 지시, 중요).
--
--    2026-08-12 팀 리드 추가 지시 2건 — 시그니처는 여전히 바뀌지 않는다.
--      · order_item_id — 이 함수는 인자를 받지 않고 항상 NULL 로 넣는다
--        (=주문 전체 환불, 1차). 2차(항목 단위)에 인자를 얹는 확장 지점만
--        마련한다(3)절 컬럼 코멘트 참고).
--      · 소비 시 환불 불가 게이트(WC032) — 사용자 확정: 소비했으면 환불
--        불가. 1차는 주문 단위 판정이다(아래 본문 주석 참고).
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
  v_order              public.orders;
  v_row                public.refund_requests;
  v_caller             uuid := auth.uid();
  v_status             text;
  v_resp_at            timestamptz;
  v_consumed_sessions  text;
  v_consumed_period    text;
begin
  -- sql/59 와 동일 원칙 — 같은 주문에 대한 동시 이중 클릭/중복 호출을 직렬화.
  perform pg_advisory_xact_lock(hashtextextended(p_order_id, 100));

  select * into v_order from public.orders where id = p_order_id;

  -- 존재하지 않음과 쌍 소속 아님을 같은 코드로 묶는다(존재 여부 스캐닝 방지,
  -- sql/59 와 동일 원칙). 판정은 orders 쌍 스냅샷으로만 한다(위 헤더 참고).
  if v_order.id is null
     or (v_caller is distinct from v_order.student_profile_id
         and v_caller is distinct from v_order.parent_profile_id) then
    raise exception 'order_not_found_or_not_owned' using errcode = 'WC005';
  end if;

  if v_order.status <> 'paid' then
    raise exception 'order_not_refundable' using errcode = 'WC006';
  end if;

  -- 소비 시 환불 불가 게이트(WC032, 2026-08-12 사용자 확정). 이 주문에
  -- 연결된 program_access_grants(order_id=p_order_id) 중 하나라도 소비
  -- 흔적이 있으면 거부한다. 판정 축 둘:
  --   회차권 — performance_credit_ledger 순소비(sum(-delta)) > 0. 되돌림
  --     (reversal_of)은 delta 부호가 반대라 자동으로 상쇄된다 — 별도
  --     분기를 만들지 않는다. fn_program_access_grants_summary(sql/65 §2)
  --     가 이미 같은 계산(sum(-l.delta))을 하므로 그 방식을 그대로 따른다.
  --   기간권 — program_access_grants.first_accessed_at is not null(최초
  --     진입 기록, 아래 5-j절 신설). 1차는 이 컬럼을 채우는 호출자가 없다
  --     (목표관리 앱은 goal-app-api 브랜치에 미머지, 배선은 그 작업 소유)
  --     — 즉 1차 운영에서는 회차권(수행평가·콜멘토)만 이 게이트가 실질적
  --     으로 작동하고, 기간권(목표관리)은 배선 전까지 항상 "미소비"로
  --     판정된다.
  --
  --   detail 에 무엇이 소비됐는지(program_key·소비 회차 수 또는 진입
  --   시각)를 넣는다 — CS 가 승인/반려를 판단할 근거가 필요하다.
  --
  --   ⚠ 1차 한계 — 판정이 주문 단위라 혼합 주문(여러 상품)에서 한 항목만
  --   소비해도 전액이 막힌다. 콘텐츠이용자 보호지침의 "가분적 디지털
  --   콘텐츠는 개시되지 않은 부분에 대해 청약철회 가능" 원칙과 어긋나므로
  --   항목 단위 판정(2차, 3)절 order_item_id 확장 지점)이 운영 출시 전에
  --   필요하다(팀 리드가 사용자에게 고지한 내용).
  select string_agg(format('%s:%s회', t.program_key, t.used), ', ')
    into v_consumed_sessions
    from (
      select g.program_key, sum(-l.delta) as used
        from public.performance_credit_ledger l
        join public.program_access_grants g on g.id = l.grant_id
       where g.order_id = p_order_id
       group by g.program_key
      having sum(-l.delta) > 0
    ) t;

  select string_agg(
           format('%s:%s', g.program_key, to_char(g.first_accessed_at, 'YYYY-MM-DD HH24:MI')),
           ', '
         )
    into v_consumed_period
    from public.program_access_grants g
   where g.order_id = p_order_id and g.first_accessed_at is not null;

  if v_consumed_sessions is not null or v_consumed_period is not null then
    raise exception 'order_already_consumed'
      using errcode = 'WC032',
            detail  = format('order_id=%s 회차소비=[%s] 기간권진입=[%s]',
                              p_order_id, coalesce(v_consumed_sessions, '-'), coalesce(v_consumed_period, '-'));
  end if;

  -- 미종결 신청이 이미 있으면 거부 — 3)절 부분 유니크 인덱스와 정확히 같은
  -- 조건식이다(그 인덱스는 이 판정이 틀렸을 때의 DB 백스톱). order_item_id
  -- is null 을 명시한다 — 이 함수는 항상 주문 전체(item NULL) 슬롯만
  -- 채우므로, 그 인덱스가 보는 (order_id, order_item_id) 축과 정확히
  -- 맞춰야 한다(인덱스와 조건식이 어긋나면 안 된다는 이 파일의 원칙 유지).
  if exists (
    select 1 from public.refund_requests
     where order_id = p_order_id
       and order_item_id is null
       and status in ('requested', 'processing')
       and approval_status <> 'rejected'
  ) then
    raise exception 'duplicate_refund_request' using errcode = 'WC007';
  end if;

  -- 학생 신청 → 학부모 응답 대기. 학부모 신청 → 승인 단계 없이 즉시 승인
  -- (사용자 확정 3번) — refund_requests_parent_auto_approve_check 와 대응.
  if v_caller = v_order.parent_profile_id then
    v_status  := 'approved';
    v_resp_at := now();
  else
    v_status  := 'requested';
    v_resp_at := null;
  end if;

  -- 금액은 여전히 호출자 입력을 신뢰하지 않는다 — orders.amount(과금 정본)
  -- 에서 서버가 가져온다(sql/59 설계 유지, 전액만 지원). order_item_id 는
  -- 항상 NULL(주문 전체 환불, 1차) — 2차 확장 지점(3)절 컬럼 코멘트 참고).
  insert into public.refund_requests (
    user_id, order_id, order_item_id, order_name, amount, reason,
    refund_bank, refund_account, refund_holder, status,
    student_profile_id, parent_profile_id, requested_by,
    approval_status, approval_responded_at
  ) values (
    v_caller, v_order.id, null, v_order.order_name, v_order.amount, p_reason,
    p_refund_bank, p_refund_account, p_refund_holder, 'requested',
    v_order.student_profile_id, v_order.parent_profile_id, v_caller,
    v_status, v_resp_at
  )
  returning * into v_row;

  return v_row;
end;
$$;

comment on function public.fn_request_refund(text, text, text, text, text) is
  '환불 신청 생성(sql/68 재작성). 신청자는 그 주문의 학생 또는 학부모여야 한다 — 판정은 orders 에 박힌 쌍 스냅샷으로 하고 parent_child_links 현재 상태는 보지 않는다(링크가 나중에 revoked 돼도 이 주문의 환불 권한은 유지). 학생 신청은 approval_status=requested 로 시작(학부모 응답 대기), 학부모 신청은 즉시 approved. 소비 시 환불 불가(WC032) — 그 주문의 program_access_grants 에 회차 순소비(performance_credit_ledger) 또는 기간권 최초 진입(first_accessed_at) 흔적이 있으면 거부한다(1차는 주문 단위 판정, 항목 단위는 2차). order_item_id 는 항상 NULL(주문 전체, 1차) — p_order_item_id 인자는 아직 없다. 그 외(주문 소유권 WC005·결제 상태 WC006·중복 WC007)는 sql/59 와 동일. 금액은 orders.amount 에서 서버가 가져온다(전액만 지원).';

revoke all on function public.fn_request_refund(text, text, text, text, text) from public, anon;
grant execute on function public.fn_request_refund(text, text, text, text, text) to authenticated;


-- ---------------------------------------------------------------------
-- 5-c) fn_respond_refund : 학부모가 학생이 신청한 환불에 응답한다(신규).
--    학부모 본인이 신청한 건은 이미 approval_status='approved' 로 시작하므로
--    (refund_requests_parent_auto_approve_check) 이 함수로 응답할 대상이
--    아니다 — approval_status='requested' 가드가 자연히 그 경우를 막는다.
-- ---------------------------------------------------------------------
create or replace function public.fn_respond_refund(
  p_refund_request_id bigint,
  p_approve            boolean,
  p_reject_reason      text default null
)
returns public.refund_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.refund_requests;
begin
  select * into v_row from public.refund_requests where id = p_refund_request_id for update;
  if not found then
    raise exception 'refund_request_not_found' using errcode = 'WC026';
  end if;

  if v_row.parent_profile_id is distinct from auth.uid() then
    raise exception 'not_refund_parent' using errcode = 'WC027';
  end if;

  if v_row.approval_status <> 'requested' then
    raise exception 'refund_not_pending' using errcode = 'WC028';
  end if;

  if p_approve then
    update public.refund_requests
       set approval_status        = 'approved',
           approval_responded_at  = now()
     where id = p_refund_request_id
    returning * into v_row;
  else
    if coalesce(btrim(p_reject_reason), '') = '' then
      raise exception 'reject_reason_required' using errcode = 'WC029';
    end if;

    update public.refund_requests
       set approval_status         = 'rejected',
           approval_responded_at   = now(),
           approval_reject_reason  = p_reject_reason
       -- status(어드민 처리축)는 건드리지 않는다 — refund_requests_approval_
       -- before_processing_check 상 이미 'requested' 로 고정돼 있고, 학생은
       -- 3)절 부분 유니크 인덱스 대상에서 이 행이 빠지는 즉시(approval_status
       -- <> 'requested' 가 되는 순간) 같은 주문으로 재신청할 수 있다.
     where id = p_refund_request_id
    returning * into v_row;
  end if;

  return v_row;
end;
$$;

comment on function public.fn_respond_refund(bigint, boolean, text) is
  '학부모가 학생이 신청한 환불(approval_status=requested)에 응답한다(sql/68 신규). 호출자는 그 신청의 parent_profile_id 여야 한다(WC027). 반려 시 사유 필수(WC029) — 반려되면 3)절 부분 유니크 인덱스 대상에서 빠져 학생이 같은 주문으로 재신청할 수 있다(사용자 확정 4번). status(어드민 처리축)는 건드리지 않는다.';

revoke all on function public.fn_respond_refund(bigint, boolean, text) from public, anon;
grant execute on function public.fn_respond_refund(bigint, boolean, text) to authenticated;


-- ---------------------------------------------------------------------
-- 5-d) fn_redeem_coupons 재작성 : 학생/학부모 쌍을 받도록 시그니처 변경.
--
--    ⚠ signature 변경 — 호출부(api/create-order.js:117-134)는 이 파일
--    범위 밖(다음 단계, api 배선)이라 아직 구 시그니처로 호출한다. 그
--    호출은 이 파일 적용 후 즉시 깨진다(PostgREST 가 새 시그니처를 찾지
--    못한다) — 배선 커밋과 함께 나가야 한다. 구 시그니처는 아래에서
--    명시적으로 DROP 한다(두 판이 공존하면 PostgREST 오버로드 선택을
--    호출자가 통제할 수 없다, sql/55 1-f)절과 동일 원칙).
--
--    구: fn_redeem_coupons(text, uuid, text, text, jsonb, integer, integer, uuid[])
--        p_order_id, p_user_id, p_customer_email, p_order_name, p_items,
--        p_list_amount, p_subtotal, p_coupon_ids
--    신: fn_redeem_coupons(text, uuid, uuid, text, text, jsonb, integer, integer, uuid[])
--        p_order_id, p_student_profile_id, p_parent_profile_id,
--        p_customer_email, p_order_name, p_items, p_list_amount, p_subtotal,
--        p_coupon_ids
--
--    p_user_id 이던 자리는 학생/학부모 두 인자로 갈라졌다. orders 삽입에는
--    두 컬럼(student_profile_id/parent_profile_id)과 user_id=parent_profile_id
--    를 함께 채운다(결제 실행자 축, 쿠폰 판정 축과는 별개).
--
--    2026-08-12 판정 축 재정정 — 쿠폰 후보 자격은 "학생(수혜자) 단독"이
--    아니라 "쌍 OR" 다(직전 판은 학생 전용으로 좁혔었는데, 그러면 학부모가
--    가진 쿠폰을 자녀 결제에 못 써 학부모 쪽 쿠폰이 죽는다). 규칙:
--      · grant_type='granted' : 학생 소유·미소진이면 학생 우선, 아니면
--        학부모 소유·미소진이면 학부모, 둘 다 아니면 이 쿠폰은 후보에서
--        빠진다. 소진 순서를 학생 먼저로 두는 이유 — 학생 쿠폰은 그
--        학생 주문 전용이라 자유도가 낮고, 학부모 쿠폰은 자녀 누구 주문에나
--        쓸 수 있어 자유도가 높다. 제약이 큰 자원을 먼저 소진하고 유연한
--        쪽을 남긴다.
--      · grant_type<>'granted'(auto) : 소유 판정 자체를 하지 않는다
--        (v_owner := null). 개인별 cap(max_uses_per_user)은 5-d-2)절
--        CHECK 로 auto 에서 아예 금지하므로 축이 없어도 안전하다.
--    coupon_redemptions.user_id 는 "귀속된 소유자(v_owner)" — 둘 다 소유한
--    경우에도 소진된 쪽 하나만 기록되고, auto 는 NULL(5-d-1)절 FK 를
--    RESTRICT 로 바꿔 이 NULL 의 뜻을 "소유자 없음" 하나로 고정했다).
--    fn_usable_coupons/fn_coupon_by_code(5-h절)도 동일 규칙을 쓴다 —
--    로직을 복제했다(공통 함수로 빼지 않음, 아래 5-h절 주석 참고).
--
--    2026-08-12 추가 지시 — 쌍 OR 가 sql/55 의 (coupon_id, user_id) 단일
--    축 advisory lock 을 무력화하는 문제를 발견해, 아래 후보 루프의 락을
--    granted 쿠폰은 학생·학부모 양쪽(순서는 프로필 id 문자열 비교로 고정)
--    으로 넓혔다. 백스톱은 최종적으로 (a) CHECK+unique(DB 층, 5-d-3절)와
--    (b) 아래 6-a) 함수 내 재검증(WC031) 두 겹으로 확정됐다 — 중간에
--    BEFORE INSERT 트리거 안을 시도했다가 팀 리드가 최종 철회했다(5-d-3절
--    "트리거 시도 철회" 참고).
-- ---------------------------------------------------------------------
drop function if exists public.fn_redeem_coupons(text, uuid, text, text, jsonb, integer, integer, uuid[]);

create or replace function public.fn_redeem_coupons(
  p_order_id           text,
  p_student_profile_id uuid,
  p_parent_profile_id  uuid,
  p_customer_email     text,
  p_order_name         text,
  p_items              jsonb,    -- [{product_id, product_slug, service_key, name, list_price, price, quantity}]
  p_list_amount        integer,
  p_subtotal           integer,  -- products 합산 판매가 (쿠폰 적용 전)
  p_coupon_ids         uuid[]
)
returns table (
  order_id           text,
  amount             integer,
  discount_amount    integer,
  coupon_discount    integer,
  applied_coupon_ids uuid[]
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now              timestamptz := now();
  v_coupon           record;
  v_coupon_discount  integer := 0;
  v_applied_ids      uuid[] := '{}';
  v_applied_discounts integer[] := '{}';
  -- 그 쿠폰이 귀속될 소유자(v_owner) — granted 는 학생 또는 학부모,
  -- auto 는 항상 NULL. v_cand_*/v_applied_* 세 배열과 항상 같은 인덱스로
  -- append 되어 정합을 유지한다(아래 1)/3)단계, 보고 2번 참고).
  v_applied_owners   uuid[] := '{}';
  v_cand_ids         uuid[] := '{}';
  v_cand_discounts   integer[] := '{}';
  v_cand_stackable   boolean[] := '{}';
  v_cand_owners      uuid[] := '{}';
  v_owner            uuid;
  v_best_nonstack_idx integer;
  v_i                integer;
  v_discount_total   integer;
  v_amount           integer;
  v_coupon_id_repr   uuid;
begin
  if p_order_id is null or p_subtotal is null or p_list_amount is null then
    raise exception 'order_id/list_amount/subtotal required';
  end if;

  -- 쌍 필수 + 자기 자신을 자기 학부모로 신청하는 경로 차단. orders 의
  -- orders_pair_distinct_check 가 결국 같은 것을 막지만, INSERT 시점의
  -- 원문 23514 보다 여기서 먼저 걸러 원인이 분명한 코드로 알린다.
  if p_student_profile_id is null or p_parent_profile_id is null then
    raise exception 'enrollment_pair_required' using errcode = 'WC019';
  end if;
  if p_student_profile_id = p_parent_profile_id then
    raise exception 'enrollment_pair_same_profile' using errcode = 'WC020';
  end if;

  -- 1) 쿠폰 판정 (DB 쓰기는 아직 없음). 판정 축은 "쌍 OR"다 — 위 5-d)절
  --    헤더 재정정 근거 참고. fn_coupon_global_redeemed(전역 발행량, 사용자
  --    무관)만 축과 무관해 그대로 둔다.
  for v_coupon in
    select c.id, c.slug, c.discount_amount, c.min_amount, c.valid_until, c.is_active,
           c.max_uses_per_user, c.max_redemptions, c.stackable, c.grant_type
    from public.coupons c
    where c.id = any (coalesce(p_coupon_ids, '{}'::uuid[]))
    order by c.slug
  loop
    if v_coupon.max_redemptions is not null then
      perform pg_advisory_xact_lock(hashtextextended(v_coupon.id::text, 1));
    end if;

    -- (coupon_id, 프로필) 쌍 락 — 2026-08-12 팀 리드 추가 지시. 쌍 OR 판정이
    -- sql/55 의 (coupon_id, user_id) 단일 축 락(원문 salt=2)의 이중 소진
    -- 방어를 무력화한다: 학부모:학생 = 1:n 이라, 자녀 A/B 가 같은 학부모 P
    -- 의 발급형 쿠폰을 동시에 쓰면 lock(coupon, A) 와 lock(coupon, B) 가
    -- 서로 다른 락이라 직렬화되지 않아 학부모 P 의 1인당 사용 횟수가
    -- 뚫릴 수 있었다. granted 쿠폰은 학생·학부모 양쪽을 다 잠근다 —
    -- auto 는 소유자가 없고 5-d-2)절 CHECK 가 개인별 cap 자체를 금지하므로
    -- 쌍 락이 필요 없다(전역 락만 적용, 위 salt=1과 네임스페이스 분리 유지).
    --
    -- 잠그는 순서는 역할(학생/학부모)이 아니라 프로필 id 문자열 비교로
    -- 고정한다(2026-08-12 팀 리드 실측 후 재확인 — 이 판단 유지, "member_
    -- type 이 역할별로 프로필 집합을 서로소로 나눈다"는 이전 서술은 사실이
    -- 아니라 폐기했다). 실측: profiles.member_type 은 nullable 이고 기본값이
    -- 없다(dev 에 NULL 3건 실재) — CHECK(sql/40 [1]절)는 "값이 있다면 이 셋
    -- 중 하나"만 강제할 뿐, UPDATE 로 역할이 바뀌는 것도, 애초에 NULL 인
    -- 프로필이 어느 자리든 들어가는 것도 막지 않는다. orders.student_
    -- profile_id/parent_profile_id 쪽도 FK profiles(id) 뿐 member_type 을
    -- 요구하는 제약이 없다. 즉 "학생 축·학부모 축 프로필 집합이 서로소"는
    -- 코드 관례일 뿐 DB 불변식이 아니다 — 역할 기반 고정 순서(학생 먼저)는
    -- 이 보장 없는 관례에 기대므로, 관례가 깨지는 날(예: tx1=A+B(A 학생),
    -- tx2=B+A(B 학생)) 두 트랜잭션이 반대 순서로 잠가 교착이 날 수 있다.
    -- 프로필 id 값 비교는 역할과 무관하게 항상 같은 전순서를 강제해 이
    -- 위험 자체가 없다 — 비용도 0이라 관례에 기댈 이유가 없다.
    if v_coupon.grant_type = 'granted' then
      if p_student_profile_id::text < p_parent_profile_id::text then
        perform pg_advisory_xact_lock(
          hashtextextended(v_coupon.id::text, hashtextextended(p_student_profile_id::text, 2)));
        perform pg_advisory_xact_lock(
          hashtextextended(v_coupon.id::text, hashtextextended(p_parent_profile_id::text, 2)));
      else
        perform pg_advisory_xact_lock(
          hashtextextended(v_coupon.id::text, hashtextextended(p_parent_profile_id::text, 2)));
        perform pg_advisory_xact_lock(
          hashtextextended(v_coupon.id::text, hashtextextended(p_student_profile_id::text, 2)));
      end if;
    end if;

    if not v_coupon.is_active then
      continue;
    end if;
    if v_coupon.valid_until is not null
       and v_coupon.valid_until < (v_now at time zone 'Asia/Seoul')::date then
      continue;
    end if;
    if p_subtotal < v_coupon.min_amount then
      continue;
    end if;

    -- 쌍 OR 판정 — granted 는 학생 소유·미소진 우선, 아니면 학부모
    -- 소유·미소진, 둘 다 아니면 이 쿠폰은 제외(continue). auto 는 소유
    -- 판정을 하지 않는다(v_owner := null) — 5-d-2)절 CHECK 가 auto 의
    -- 개인별 cap 을 금지해 축이 없어도 안전하다.
    if v_coupon.grant_type = 'granted' then
      if public.fn_coupon_is_granted(v_coupon.id, p_student_profile_id)
         and not public.fn_coupon_is_redeemed(v_coupon.id, p_student_profile_id, v_now) then
        v_owner := p_student_profile_id;
      elsif public.fn_coupon_is_granted(v_coupon.id, p_parent_profile_id)
            and not public.fn_coupon_is_redeemed(v_coupon.id, p_parent_profile_id, v_now) then
        v_owner := p_parent_profile_id;
      else
        continue;
      end if;
    else
      v_owner := null;
    end if;

    if public.fn_coupon_global_redeemed(v_coupon.id, v_now) then
      continue;
    end if;

    v_cand_ids       := array_append(v_cand_ids, v_coupon.id);
    v_cand_discounts := array_append(v_cand_discounts, v_coupon.discount_amount);
    v_cand_stackable := array_append(v_cand_stackable, v_coupon.stackable);
    v_cand_owners    := array_append(v_cand_owners, v_owner);
  end loop;

  -- 2) stacking 정산 — sql/55 원문과 동일.
  v_best_nonstack_idx := null;
  for v_i in 1 .. coalesce(array_length(v_cand_ids, 1), 0) loop
    if not v_cand_stackable[v_i] then
      if v_best_nonstack_idx is null
         or v_cand_discounts[v_i] > v_cand_discounts[v_best_nonstack_idx] then
        v_best_nonstack_idx := v_i;
      end if;
    end if;
  end loop;

  -- 3) 최종 적용 목록 조립 — sql/55 원문과 동일.
  for v_i in 1 .. coalesce(array_length(v_cand_ids, 1), 0) loop
    if v_cand_stackable[v_i] or v_i = v_best_nonstack_idx then
      if v_coupon_discount + v_cand_discounts[v_i] >= p_subtotal then
        continue;
      end if;
      v_applied_ids       := array_append(v_applied_ids, v_cand_ids[v_i]);
      v_applied_discounts := array_append(v_applied_discounts, v_cand_discounts[v_i]);
      -- v_cand_owners 도 같은 인덱스(v_i)로 같이 append 한다 — v_cand_ids/
      -- v_cand_discounts/v_cand_stackable/v_cand_owners 네 배열은 1)단계에서
      -- 항상 같은 반복에서 함께 append 됐으므로 이 시점에도 인덱스가
      -- 어긋나지 않는다(보고 2번 참고).
      v_applied_owners     := array_append(v_applied_owners, v_cand_owners[v_i]);
      v_coupon_discount    := v_coupon_discount + v_cand_discounts[v_i];
    end if;
  end loop;

  v_coupon_discount := least(v_coupon_discount, p_subtotal);
  v_discount_total  := (p_list_amount - p_subtotal) + v_coupon_discount;
  v_amount          := greatest(0, p_list_amount - v_discount_total);

  if v_amount <= 0 then
    raise exception 'invalid_amount' using errcode = 'WC001';
  end if;

  v_coupon_id_repr := case when array_length(v_applied_ids, 1) > 0
                       then v_applied_ids[1] else null end;

  -- 4) 주문 헤더. user_id = parent_profile_id(orders_user_id_is_parent_check),
  --    approval_status/requested_at 은 컬럼 DEFAULT('requested'/now())를 그대로
  --    받는다 — 학부모 수락 전까지는 orders_approval_before_payment_check 가
  --    이 주문을 pending 밖으로 못 나가게 막는다.
  insert into public.orders
    (id, user_id, student_profile_id, parent_profile_id, status, order_name,
     list_amount, discount_amount, amount, coupon_id, customer_email)
  values
    (p_order_id, p_parent_profile_id, p_student_profile_id, p_parent_profile_id,
     'pending', p_order_name, p_list_amount, v_discount_total, v_amount,
     v_coupon_id_repr, p_customer_email);

  -- 5) 주문 아이템 — sql/55 원문과 동일.
  insert into public.order_items (order_id, product_id, product_slug, service_key, name, list_price, price, quantity)
  select
    p_order_id,
    (i ->> 'product_id')::uuid,
    i ->> 'product_slug',
    i ->> 'service_key',
    i ->> 'name',
    coalesce((i ->> 'list_price')::integer, 0),
    coalesce((i ->> 'price')::integer, 0),
    coalesce((i ->> 'quantity')::integer, 1)
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as i;

  -- 6-a) 소진 직전 재검증 — (b) 안, DB 백스톱 두 겹 중 함수 층(2026-08-12
  --    팀 리드 최종 결정 — (a) CHECK+unique 와 함께 유지, 5-d-3절 참고).
  --    위 advisory lock 은 이 함수를 통과하는 경로만 지킨다 — insert
  --    직전에 확정된 각 쿠폰의 귀속 소유자(v_applied_owners[v_i])별로
  --    "지금 다시 봐도 미소진인지"를 fn_coupon_is_redeemed 로 재확인한다
  --    — 새 count 쿼리를 짜지 않는다. 그 함수 안의 실패 주문 제외 규칙
  --    (o.status='failed', pending 30분 시간창 초과, sql/55 2-a절)을
  --    여기서 손으로 다시 쓰면 두 판정이 갈릴 수 있다 — 그게 이 파일이
  --    애초에 고치고 있는 문제(축 드리프트)와 같은 종류다.
  --
  --    1)단계 후보 루프에서 이미 같은 판정(fn_coupon_is_granted/fn_coupon_
  --    is_redeemed)을 통과했고 그 사이 advisory lock 이 걸려 있었으므로,
  --    이 재검증은 정상 흐름에서는 항상 통과한다(도달 불가에 가깝다).
  --    여기서 걸린다면 락을 우회한 다른 경로가 이 트랜잭션과 동시에
  --    같은 (coupon, owner) 를 소진했다는 뜻이다 — 조용히 cap 을 넘기는
  --    대신 여기서 터뜨린다. owner 가 NULL(auto)인 행은 건너뛴다 — 5-d-2)절
  --    CHECK 가 auto 의 개인별 cap 자체를 금지해 셀 대상이 없다.
  for v_i in 1 .. coalesce(array_length(v_applied_ids, 1), 0) loop
    if v_applied_owners[v_i] is not null
       and public.fn_coupon_is_redeemed(v_applied_ids[v_i], v_applied_owners[v_i], v_now) then
      raise exception 'coupon_per_user_cap_exceeded'
        using errcode = 'WC031',
              detail  = format('coupon_id=%s owner_profile_id=%s — advisory lock 우회 의심(귀속 직전 재검증 실패)',
                                v_applied_ids[v_i], v_applied_owners[v_i]);
    end if;
  end loop;

  -- 6-b) 쿠폰 귀속(사용 이력). user_id 는 v_applied_owners 로 채운 "귀속된
  --    소유자" — granted 는 학생 또는 학부모(둘 다 소유한 경우 소진된
  --    쪽), auto 는 NULL(5-d)절 재정정 근거). generate_subscripts 가
  --    v_applied_ids 를 순회하는 인덱스(gs.i)를 v_applied_discounts 와
  --    v_applied_owners 양쪽에 그대로 재사용하므로 세 배열의 정합이 여기서도
  --    유지된다.
  if array_length(v_applied_ids, 1) > 0 then
    insert into public.coupon_redemptions (coupon_id, user_id, order_id, discount_amount)
    select v_applied_ids[gs.i], v_applied_owners[gs.i], p_order_id, v_applied_discounts[gs.i]
    from generate_subscripts(v_applied_ids, 1) as gs(i);
  end if;

  return query
  select p_order_id, v_amount, v_discount_total, v_coupon_discount, v_applied_ids;
end;
$$;

comment on function public.fn_redeem_coupons(text, uuid, uuid, text, text, jsonb, integer, integer, uuid[]) is
  '서버 전용(service_role). sql/68 재작성 — 학생(p_student_profile_id)/학부모(p_parent_profile_id) 쌍을 받아 orders.student_profile_id/parent_profile_id 를 채운다(둘 다 필수 WC019, 동일인 금지 WC020). orders.user_id 는 항상 parent_profile_id(결제 실행자). 쿠폰 후보 자격은 쌍 OR — granted 는 학생 소유·미소진 우선, 아니면 학부모 소유·미소진, 둘 다 아니면 제외(2026-08-12 재정정). auto 는 소유 판정을 하지 않는다(5-d-2절 CHECK 가 auto 의 개인별 cap 을 금지). coupon_redemptions.user_id 는 귀속된 소유자(v_owner) — auto 는 NULL. fn_usable_coupons/fn_coupon_by_code(5-h절)와 동일 판정 규칙(로직 복제, 드리프트 주의). 나머지 로직(stacking·0원 방지·WC001)은 sql/55 원문과 동일.';

revoke all on function public.fn_redeem_coupons(text, uuid, uuid, text, text, jsonb, integer, integer, uuid[])
  from public, anon, authenticated;
grant execute on function public.fn_redeem_coupons(text, uuid, uuid, text, text, jsonb, integer, integer, uuid[])
  to service_role;


-- ---------------------------------------------------------------------
-- 5-d-1) coupon_redemptions — user_id 의미 갱신 + FK 전환 + RLS select 축 확장.
--    5-d)절부터 coupon_redemptions.user_id 는 "결제자"도 "학생 고정"도
--    아니라 "귀속된 소유자(v_owner)" 다 — granted 는 소진된 쪽(학생 또는
--    학부모), auto 는 NULL. sql/55 는 이 컬럼에 별도 `comment on column` 을
--    남긴 적이 없어(원문은 sql/55_coupon_policy.sql:437-441 create table 안
--    인라인 SQL 주석뿐 — 이 파일 앞머리 "조사" 절 근거) 여기서 새로 단다 —
--    이미 적용된 과거 파일(sql/55)은 고치지 않는다(이 저장소의 이력 파일
--    불변 관례).
--
--    FK 전환 — sql/55 는 이 컬럼을 ON DELETE SET NULL(auth.users)로 뒀다
--    (계정 삭제 시 이력 행은 남기고 "누구였는지"만 비우는 설계, sql/55
--    1-c절). 그런데 auto 쿠폰도 이제 NULL 을 쓰므로, SET NULL 을 그대로
--    두면 "auto 라 소유자가 없음"과 "소유자가 탈퇴해 소실됨"이라는 서로
--    다른 두 뜻이 같은 NULL 로 겹쳐 구분할 수 없게 된다. RESTRICT 로 바꿔
--    NULL 의 뜻을 "소유자 없음(auto)" 하나로 고정한다 — 대신 계정 삭제는
--    이제 이 컬럼이 가리키는 행이 있으면 막힌다(탈퇴 시나리오는 이
--    작업 범위 밖 — 다음 단계에서 다룬다).
--
--    RLS — 기존 "coupon_redemptions select own"(auth.uid() = user_id) 은
--    user_id 가 항상 학생은 아니게 되는 순간(위 재정정) 결제를 실행한
--    학부모가 자기 주문에 어떤 쿠폰이 적용됐는지 못 보게 된다(orders/
--    refund_requests 와 같은 문제, sql/68 2)/4)절). orders 를 조인해 그
--    redemption 이 귀속된 주문의 학부모까지 본인 조회를 넓힌다 — 두 조건을
--    합쳐 orders 정책과 형태를 맞춘다.
-- ---------------------------------------------------------------------
alter table public.coupon_redemptions
  drop constraint if exists coupon_redemptions_user_id_fkey;
alter table public.coupon_redemptions
  add constraint coupon_redemptions_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete restrict;

comment on column public.coupon_redemptions.user_id is
  '귀속 주체 — 둘 다 소유한 경우 소진된 쪽(granted 는 학생 우선, sql/68 5-d절). auto 쿠폰은 NULL(소유 판정 없음). fn_redeem_coupons 가 이 값을 채우는 유일한 경로(서버 전용)라 위조 불가. FK 는 RESTRICT(2026-08-12) — SET NULL 이면 "auto 라 소유자 없음"과 "소유자가 탈퇴해 소실"이 같은 NULL 로 겹친다.';

drop policy if exists "coupon_redemptions select own" on public.coupon_redemptions;
create policy "coupon_redemptions select own" on public.coupon_redemptions
  for select to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.orders o
       where o.id = coupon_redemptions.order_id
         and o.parent_profile_id = auth.uid()
    )
  );

comment on policy "coupon_redemptions select own" on public.coupon_redemptions is
  '귀속된 소유자(user_id 직접 일치)와 그 주문의 학부모(orders.parent_profile_id 조인) 둘 다 조회 가능. 학부모가 결제를 실행한 자기 주문의 쿠폰 적용 내역을 봐야 하는데 user_id 는 더 이상 항상 학부모가 아니라서(sql/68 5-d절) 직접 일치만으로는 막힌다 — orders 조인으로 넓힌다(admin_select 정책은 sql/55 그대로 별도 유지, permissive 로 OR 결합).';


-- ---------------------------------------------------------------------
-- 5-d-2) coupons — auto 쿠폰에 개인별 cap(max_uses_per_user) 금지.
--    auto(grant_type<>'granted')는 5-d절 재정정으로 소유 판정 자체를 하지
--    않게 됐다 — 소유자가 없으니 "1인당 몇 회"를 셀 축도 없다. 지금 auto
--    2종(over40k-3000/over80k-5000)은 max_uses_per_user 가 NULL 이라
--    무해하지만, 어드민이 나중에 cap 을 걸면 축이 없는 상태로 조용히 틀린
--    판정(사실상 무제한)이 나간다 — 저장 단계에서 막고, 그때 grant_type 을
--    granted 로 바꾸게(=축을 정하게) 한다.
-- ---------------------------------------------------------------------
do $$
declare
  v_bad int;
begin
  select count(*) into v_bad
    from public.coupons
   where grant_type <> 'granted' and max_uses_per_user is not null;
  if v_bad > 0 then
    raise warning 'coupons 에 auto 인데 max_uses_per_user 가 설정된 행 % 개 발견 — 아래 CHECK 추가가 23514 로 실패할 것이다(sql/68, 의도된 동작). grant_type 을 granted 로 바꾸거나 max_uses_per_user 를 NULL 로 비운 뒤 재실행하라.', v_bad;
  end if;
end $$;

alter table public.coupons drop constraint if exists coupons_per_user_cap_requires_grant_check;
alter table public.coupons add constraint coupons_per_user_cap_requires_grant_check
  check (grant_type = 'granted' or max_uses_per_user is null);

comment on constraint coupons_per_user_cap_requires_grant_check on public.coupons is
  'auto(조건형) 쿠폰은 소유자가 없어 1인당 사용 횟수를 셀 축이 없다 — max_uses_per_user 는 grant_type=granted 일 때만 허용한다(sql/68 5-d-2절, fn_redeem_coupons 가 auto 를 소유 판정 없이 통과시키는 것과 대응).';


-- ---------------------------------------------------------------------
-- 5-d-3) coupon_redemptions 단일 사용 DB 백스톱 — (a)+(b) 두 겹 확정
--    (2026-08-12 팀 리드 최종 결정 — 직전 트리거 안을 철회하고 원래의
--    (a) 부분 unique+CHECK, (b) 함수 내 재검증 두 겹으로 되돌린다. 이
--    주제는 여기서 닫는다).
--
--    트리거 시도 철회 — BEFORE INSERT 트리거로 (a)/(b) 를 통합하려 했던
--    시도(coupon_redemptions_enforce_per_user_cap 함수·트리거)는 만들지
--    않는다. 혹시 이전에 적용을 시도한 적이 있을 경우를 대비해 아래에서
--    명시적으로 DROP 한다(재실행 안전 관례).
--
--    coupon_redemptions 로 INSERT 하는 현재 경로 확인: `from('coupon_
--    redemptions')` grep 전체 — src/components/admin/CouponAdmin.jsx:
--    499,630,647 세 곳은 전부 SELECT, INSERT RLS 정책도 없다(select own/
--    admin select/admin update 뿐, sql/55 1-c)/1-d)절). PostgREST/
--    authenticated 축에서는 fn_redeem_coupons 가 유일한 경로다.
--
--    두 겹 방어 — (a) CHECK+unique(DB 층, 모든 경로 포함)와 (b, 위 5-d절
--    fn_redeem_coupons 안 재검증, WC031)을 둘 다 둔다. 커버 범위가 다르다:
--      · (a) CHECK+unique   : fn_redeem_coupons 를 우회하는 모든 경로
--        (service_role 직접 INSERT, Studio SQL 등)까지 막는다 — service_
--        role 은 RLS 를 우회하므로 "INSERT RLS 정책이 없다"는 사실이
--        "미래에 service_role INSERT 경로가 생기지 않는다"를 보장하지
--        않는다.
--      · (b) 재검증(WC031)  : fn_redeem_coupons 안에서 advisory lock 이
--        뚫린 상황을 조기에 잡아, (a) 의 unique 인덱스가 결국 잡아주더라도
--        v_amount/orders/order_items 를 다 만든 뒤에야 insert 시점 23505
--        로 실패하는 불친절한 에러 대신 명확한 예외로 먼저 터뜨린다.
--    둘 중 하나만 남기지 않는다 — 목적이 다르다.
--
--    ⚠ 해제 절차(다음 사람에게) — max_uses_per_user > 1 인 발급형 쿠폰이
--    필요해지는 날, 이 CHECK(coupons_granted_cap_is_one_check) 와 아래
--    unique 인덱스(coupon_redemptions_single_use_uidx)를 **반드시 함께**
--    걷어내라. 이 CHECK 는 "지금 사실(N=1)을 고정한 것"이지 영구 정책이
--    아니다. **CHECK 만 지우면 조용히 이중 소진이 열린다** — 두 제약을
--    걷어낸 뒤에는 (b) 재검증(현재도 `fn_coupon_is_redeemed` 를 그대로
--    써서 max_uses_per_user=N 비교는 이미 지원한다)이 유일한 방어가
--    되는데, 그 재검증은 함수를 통과하는 경로만 지키므로 service_role
--    직접 INSERT 경로에 대한 대체 방어(예: 트리거)를 함께 마련하지
--    않으면 그 순간 구멍이 열린다.
-- ---------------------------------------------------------------------
drop trigger if exists coupon_redemptions_enforce_per_user_cap_trg on public.coupon_redemptions;
drop function if exists public.coupon_redemptions_enforce_per_user_cap();

do $$
declare
  v_bad int;
begin
  select count(*) into v_bad
    from public.coupons
   where grant_type = 'granted' and max_uses_per_user is distinct from 1;
  if v_bad > 0 then
    raise warning 'coupons 에 granted 인데 max_uses_per_user 가 1 이 아닌(NULL 포함) 행 % 개 발견 — 아래 CHECK 추가가 23514 로 실패할 것이다(sql/68, 의도된 동작). max_uses_per_user 를 1로 맞추거나 이 제약 도입 여부를 재검토하라.', v_bad;
  end if;
end $$;

alter table public.coupons drop constraint if exists coupons_granted_cap_is_one_check;
alter table public.coupons add constraint coupons_granted_cap_is_one_check
  check (grant_type <> 'granted' or max_uses_per_user = 1);

comment on constraint coupons_granted_cap_is_one_check on public.coupons is
  'granted(발급형) 쿠폰은 max_uses_per_user 를 정확히 1로 고정한다(2026-08-12 팀 리드 최종 확정, (a)+(b) 두 겹) — 아래 coupon_redemptions_single_use_uidx 가 (coupon_id, user_id) 쌍 unique 로 "1인당 정확히 1회"를 DB 층에서(service_role RLS 우회 경로 포함) 강제하므로, 이 값이 1이 아니면 그 unique 인덱스의 전제와 어긋난다. 영구 정책이 아니라 "지금 사실(N=1)의 고정"이다 — N>1 이 필요해지면 이 CHECK 와 그 unique 인덱스를 반드시 함께 걷어내고, 그 순간부터 사라지는 DB 층 커버리지(특히 service_role 직접 INSERT 경로)를 대체할 방어를 함께 마련하라. CHECK 만 지우면 조용히 이중 소진이 열린다(sql/68 5-d-3절 "해제 절차" 참고).';

create unique index if not exists coupon_redemptions_single_use_uidx
  on public.coupon_redemptions (coupon_id, user_id)
  where user_id is not null and voided_at is null;

comment on index public.coupon_redemptions_single_use_uidx is
  'granted 쿠폰 1인당 정확히 1회 소진을 DB 층에서(service_role RLS 우회 경로 포함) 강제하는 백스톱 — fn_redeem_coupons 안 advisory lock·5-d절 재검증(WC031)이 지키는 규칙을 모든 경로에 대해 다시 강제한다. auto(user_id NULL)는 대상이 아니다(C절 — 개인별 소진 개념 자체가 없음). voided_at 이 아닌 행만 대상 — 관리자가 명시적으로 되돌린 사용(voided_at NOT NULL)은 다시 셈에서 빠져 재적용을 막지 않는다. N>1 지원 시 coupons_granted_cap_is_one_check 와 함께 재설계할 것(sql/68 5-d-3절 "해제 절차").';


-- ---------------------------------------------------------------------
-- 5-e) fn_grant_program_access_for_order 재작성 : 부여 대상을
--    orders.student_profile_id 로 바꾼다. 시그니처는 그대로다
--    (p_order_id text, p_user_id uuid, p_paid_at timestamptz default null,
--    p_restore_revoked boolean default false) — 호출부(api/_lib/
--    programAccess.js:145-150)가 이미 orders.user_id(=parent_profile_id)를
--    p_user_id 로 넘기고 있어 그대로 호출된다(호출부 변경 불필요).
--
--    아래는 sql/64 8)절 원문에서 "부여 대상 프로필"만 바꿨다 — 나머지
--    로직(라인 순회·체이닝·suspended/revoked_not_restored 판정·WC010~012)은
--    전부 sql/64 원문 그대로다.
-- ---------------------------------------------------------------------
create or replace function public.fn_grant_program_access_for_order(
  p_order_id        text,
  p_user_id         uuid,
  p_paid_at         timestamptz default null,
  p_restore_revoked boolean     default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
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
  -- profile_id, orders_user_id_is_parent_check)를 그대로 넘긴다 — 이제
  -- parent_profile_id 와 등호로 판정한다(구조적으로 user_id 와 항상 같지만,
  -- 호출부 인자 실수를 잡는 명시적 가드로 남긴다, sql/68).
  if v_order.parent_profile_id is distinct from p_user_id then
    raise exception 'order_user_mismatch' using errcode = 'WC011';
  end if;

  -- student_profile_id 는 orders_student_profile_id_fkey 로 NOT NULL 이 보장돼
  -- 이 분기는 도달 불가에 가깝다 — sql/64 원문의 "비회원 결제" 방어를 대상만
  -- 바꿔 그대로 남긴다(방어선을 지우지 않는다).
  if v_order.student_profile_id is null then
    return jsonb_build_object(
      'ok', true, 'granted', '[]'::jsonb, 'service_keys', '[]'::jsonb,
      'skipped', jsonb_build_array(jsonb_build_object('reason', 'order_has_no_user')),
      'ledger_inserted', 0, 'synced', '[]'::jsonb);
  end if;

  -- 부여 대상(학생) 단위로 부여·회수를 직렬화한다. sql/64 원문과 같은 salt
  -- (101) — 잠금 대상만 student_profile_id 로 바뀐다(consume_performance_
  -- credit·회수 함수와 같은 축, sql/65 정정 5 참고).
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
           p.id as product_id, p.program_key, p.duration_months, p.session_quota
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

    if found then
      if v_existing.access_status = 'suspended' then
        v_skipped := v_skipped || jsonb_build_object(
          'order_item_id', v_item.order_item_id, 'product_slug', v_item.product_slug,
          'service_key', v_item.service_key, 'program_key', v_item.program_key,
          'reason', 'suspended_by_admin');
        if not (v_item.program_key = any(v_blocked)) then
          v_blocked := v_blocked || v_item.program_key;
        end if;
        continue;
      end if;

      if not p_restore_revoked
         and v_existing.payment_status in ('refunded', 'cancelled') then
        v_skipped := v_skipped || jsonb_build_object(
          'order_item_id', v_item.order_item_id, 'product_slug', v_item.product_slug,
          'service_key', v_item.service_key, 'program_key', v_item.program_key,
          'reason', 'revoked_not_restored');
        if not (v_item.program_key = any(v_blocked)) then
          v_blocked := v_blocked || v_item.program_key;
        end if;
        continue;
      end if;
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
    v_expires := public.fn_add_months_kst(v_start, v_item.duration_months);

    insert into public.program_access_grants (
      profile_id, program_key, order_id, order_item_id,
      product_id, product_slug, granted_by,
      granted_months, granted_sessions, paid_amount, starts_at, expires_at
    ) values (
      v_order.student_profile_id, v_item.program_key, p_order_id, v_item.order_item_id,
      v_item.product_id, v_item.product_slug, 'payment',
      v_item.duration_months, v_item.session_quota,
      coalesce(v_item.price, 0) * coalesce(v_item.quantity, 1),
      v_start, v_expires
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

comment on function public.fn_grant_program_access_for_order(text, uuid, timestamptz, boolean) is
  '주문 하나에 대해 이용 권한을 부여한다(M1/M6, sql/68 재작성). 부여 대상은 orders.student_profile_id(학생) — p_user_id 는 orders.parent_profile_id 와 같은지 확인하는 가드로만 쓴다(WC011). 그 외(라인별 skipped·WC010~012·체이닝)는 sql/64 원문과 동일.';

revoke all on function public.fn_grant_program_access_for_order(text, uuid, timestamptz, boolean)
  from public, anon, authenticated;
grant execute on function public.fn_grant_program_access_for_order(text, uuid, timestamptz, boolean)
  to service_role;


-- ---------------------------------------------------------------------
-- 5-f) fn_revoke_program_access_for_order 재작성 : 회수 대상도
--    orders.student_profile_id 로 바꾼다. 시그니처는 그대로다 — 호출부
--    (api/_lib/programAccess.js:228-233)가 이미 orders.user_id 를
--    p_user_id 로 넘기고 있어 그대로 호출된다.
-- ---------------------------------------------------------------------
create or replace function public.fn_revoke_program_access_for_order(
  p_order_id       text,
  p_user_id        uuid,
  p_payment_status text default 'refunded',
  p_reason         text default 'order_revoked'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
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

  -- student_profile_id 는 NOT NULL 이 보장돼 도달 불가에 가깝다 — sql/64
  -- 원문의 방어를 대상만 바꿔 그대로 남긴다(sql/68).
  if v_order.student_profile_id is null then
    return jsonb_build_object(
      'ok', true, 'revoked', '[]'::jsonb, 'recalculated', '[]'::jsonb,
      'skipped', jsonb_build_array(jsonb_build_object('reason', 'order_has_no_user')),
      'ledger_closed', 0, 'synced', '[]'::jsonb);
  end if;

  -- 5-e절과 같은 락 순서(주문 행 → advisory, 대상은 student_profile_id)라
  -- 데드락이 없다.
  perform pg_advisory_xact_lock(hashtextextended(v_order.student_profile_id::text, 101));

  v_status := case when p_payment_status in ('refunded', 'cancelled')
                   then p_payment_status else 'refunded' end;
  v_reason := coalesce(nullif(btrim(p_reason), ''), 'order_revoked');

  with closed as (
    update public.program_access_grants g
       set revoked_at    = now(),
           revoke_reason = v_reason,
           updated_at    = now()
     where g.order_id = p_order_id
       and g.revoked_at is null
    returning g.program_key
  )
  select coalesce(array_agg(distinct program_key), '{}'), count(*)
    into v_keys, v_closed
    from closed;

  if array_length(v_keys, 1) is null then
    select coalesce(array_agg(distinct g.program_key), '{}')
      into v_keys
      from public.program_access_grants g
     where g.order_id = p_order_id;
  end if;

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

comment on function public.fn_revoke_program_access_for_order(text, uuid, text, text) is
  '주문 하나에 대해 이용 권한을 회수한다(M6, sql/68 재작성). 회수 대상은 orders.student_profile_id(학생) — p_user_id 는 orders.parent_profile_id 와 같은지 확인하는 가드로만 쓴다(WC011). 이 주문의 원장 행만 닫고 DELETE 하지 않는다. 그 외 로직은 sql/64 원문과 동일. 회수 시점은 refund_requests.status=completed 를 호출부가 확인한 뒤여야 한다(사용자 확정 6번 — 이 함수 자체는 그 판정을 하지 않는다, 호출부 책임 유지).';

revoke all on function public.fn_revoke_program_access_for_order(text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.fn_revoke_program_access_for_order(text, uuid, text, text)
  to service_role;


-- ---------------------------------------------------------------------
-- 5-g) fn_is_linked_pair + coupon_grants RLS 쌍 확장.
--    coupon_grants "select own"(auth.uid() = user_id) 은 쌍이 서로의 보유
--    쿠폰을 못 본다 — 체크아웃 후보 목록이 "학생 + 학부모" 인데(5-d절)
--    조회가 막힌다.
--
--    RLS 정책 안에서 parent_child_links 를 직접 참조하지 않는다 — 그
--    테이블 RLS 가 함께 걸려 막히거나 재귀할 수 있다. SECURITY DEFINER
--    헬퍼로 우회한다.
--
--    보유 목록은 주문 스냅샷이 아니라 "현재 링크" 기준이 맞다 — 환불 권한
--    판정(3)/4)절 fn_request_refund)이 parent_child_links 를 의도적으로
--    배제한 것과는 반대 방향이다. 환불은 과거 주문 시점에 성립한 권한을
--    링크가 끊겨도 유지해야 하고, 쿠폰 지갑 열람은 "지금 쓸 수 있는 쿠폰
--    목록"이라 링크가 끊기면 더는 서로의 쿠폰을 볼 이유가 없다 — 이 차이는
--    의도된 것이다.
-- ---------------------------------------------------------------------
create or replace function public.fn_is_linked_pair(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.parent_child_links l
     where l.status = 'approved'
       and ((l.parent_id = p_a and l.student_id = p_b)
         or (l.parent_id = p_b and l.student_id = p_a))
  );
$$;

comment on function public.fn_is_linked_pair(uuid, uuid) is
  '두 프로필이 현재 approved 상태로 연결된 학부모-학생 쌍인지 판정(순서 무관). RLS 정책 안에서 parent_child_links 를 직접 참조하는 대신 이 SECURITY DEFINER 헬퍼를 거쳐 그 테이블 RLS 와의 재귀·충돌을 피한다(sql/68 5-g절).';

revoke all on function public.fn_is_linked_pair(uuid, uuid) from public;
grant execute on function public.fn_is_linked_pair(uuid, uuid) to authenticated, service_role;

drop policy if exists "coupon_grants select own" on public.coupon_grants;
create policy "coupon_grants select own" on public.coupon_grants
  for select to authenticated
  using (
    auth.uid() = user_id
    or public.fn_is_linked_pair(auth.uid(), user_id)
  );

comment on policy "coupon_grants select own" on public.coupon_grants is
  '본인 발급분과, 현재 approved 로 연결된 상대(학생↔학부모)의 발급분을 함께 볼 수 있다 — 체크아웃 후보 목록이 학생+학부모 쌍이므로(5-d절) 조회도 쌍으로 넓힌다. 현재 링크 기준(주문 스냅샷 아님) — fn_request_refund 의 과거 권한 유지 원칙과는 반대 방향이다(sql/68 5-g절). admin select 정책은 sql/55 그대로 별도 유지(permissive 로 공존).';


-- ---------------------------------------------------------------------
-- 5-h) fn_usable_coupons / fn_coupon_by_code 재작성 : 쌍 축으로.
--    두 함수가 v_user_id := auth.uid() 단일 축이었다 — 학부모가 체크아웃
--    화면을 보면 학부모 이력 기준으로 판정하는데 fn_redeem_coupons(5-d절)
--    는 쌍 OR 로 재판정한다 — 화면엔 "사용 가능"인데 결제에서 막히거나
--    그 반대가 될 수 있었다.
--
--    ⚠ signature 변경(인자 추가) + 반환 shape 변경(owner_profile_id/
--    owner_is_student 추가) — 반환 컬럼이 늘어 CREATE OR REPLACE 로
--    반환 타입을 바꿀 수 없다(cannot change return type of existing
--    function, sql/55 3)/3-b)절과 동일 사유) — DROP 후 CREATE 한다.
--    pg_get_function_identity_arguments 는 default 를 숨겨 그대로 쓰면
--    42P13 이 나므로(작업 지시 경고) 인자 목록을 직접 명시해 DROP 한다.
--
--    구: fn_usable_coupons(integer) / fn_coupon_by_code(text, integer)
--    신: fn_usable_coupons(integer, uuid) / fn_coupon_by_code(text, integer, uuid)
--        (p_subtotal[, p_student_profile_id default null])
--
--    p_student_profile_id 가 NULL 이면 auth.uid() 를 학생으로 보고
--    parent_child_links approved 에서 학부모를 도출한다(학생당 1명이라
--    결정적, sql/40 [5]절). 값이 있으면 호출자가 그 학생 본인이거나
--    그 학생의 approved 학부모인지 fn_is_linked_pair 로 검증한다(아니면
--    WC030). 학부모를 못 찾으면(=쌍이 없음) 후보를 빈 목록으로 돌린다 —
--    쌍이 없으면 결제 자체가 불가능하므로 쿠폰도 없다(작업 지시 명시,
--    비로그인/미연결 게스트는 이제 이 함수에서 항상 빈 목록을 받는다 —
--    5-d절 이전에는 auto 쿠폰만은 게스트에게도 보였던 것과 달라진 지점,
--    보고 5번 참고).
--
--    판정은 5-d)절 fn_redeem_coupons 와 동일 규칙(granted 는 쌍 OR + 학생
--    우선, auto 는 소유 판정 없음)을 쓴다 — 다만 공통 함수로 빼지 않고
--    로직을 복제했다(fn_usable_coupons/fn_coupon_by_code 두 함수끼리도
--    이미 CASE 로직을 복제하는 것이 sql/55 원문의 기존 패턴이라 그 관례를
--    따랐다, 보고 3번 명시).
-- ---------------------------------------------------------------------
drop function if exists public.fn_usable_coupons(integer);
drop function if exists public.fn_coupon_by_code(text, integer);

create or replace function public.fn_usable_coupons(
  p_subtotal            integer default 0,
  p_student_profile_id  uuid    default null
)
returns table (
  id                uuid,
  title             text,
  discount_amount   integer,
  min_amount        integer,
  valid_until       date,
  is_active         boolean,
  eligible          boolean,
  reason            text,
  owner_profile_id  uuid,
  owner_is_student  boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller  uuid := auth.uid();
  v_student uuid;
  v_parent  uuid;
  v_today   date := (now() at time zone 'Asia/Seoul')::date;
begin
  if p_student_profile_id is null then
    v_student := v_caller;
  else
    if v_caller is distinct from p_student_profile_id
       and not public.fn_is_linked_pair(v_caller, p_student_profile_id) then
      raise exception 'not_authorized_for_student' using errcode = 'WC030';
    end if;
    v_student := p_student_profile_id;
  end if;

  select l.parent_id into v_parent
    from public.parent_child_links l
   where l.student_id = v_student and l.status = 'approved'
   limit 1;

  -- 쌍이 없으면(학부모 미연결, 또는 v_student 자체가 NULL 인 비로그인) 후보
  -- 없음 — 결제 자체가 불가능하므로 쿠폰도 없다.
  if v_student is null or v_parent is null then
    return;
  end if;

  return query
  select
    c.id,
    c.title,
    c.discount_amount,
    c.min_amount,
    c.valid_until,
    c.is_active,
    (
      c.is_active
      and (c.valid_until is null or c.valid_until >= v_today)
      and coalesce(p_subtotal, 0) >= c.min_amount
      and (c.max_uses_per_user is null or v_student is not null)
      and not chk.is_sold_out
      and (c.grant_type <> 'granted' or own.owner_id is not null)
    ) as eligible,
    case
      when not c.is_active then 'inactive'
      when c.valid_until is not null and c.valid_until < v_today then 'expired'
      when coalesce(p_subtotal, 0) < c.min_amount then 'below_min_amount'
      when c.max_uses_per_user is not null and v_student is null then 'login_required'
      when c.grant_type = 'granted' and not own.is_granted_overall then 'not_granted'
      when chk.is_sold_out then 'sold_out'
      when c.grant_type = 'granted' and own.owner_id is null then 'already_used'
      else null
    end as reason,
    own.owner_id as owner_profile_id,
    (own.owner_id is not null and own.owner_id = v_student) as owner_is_student
  from public.coupons c
  -- LATERAL 로 학생·학부모 판정을 행당 한 번씩만 계산한다(sql/55 3)절과
  -- 같은 원칙 — eligible/reason/owner 세 컬럼에서 재사용).
  cross join lateral (
    select
      public.fn_coupon_is_granted(c.id, v_student) as is_granted_student,
      public.fn_coupon_is_granted(c.id, v_parent)  as is_granted_parent,
      public.fn_coupon_is_redeemed(c.id, v_student, now()) as is_redeemed_student,
      public.fn_coupon_is_redeemed(c.id, v_parent, now())  as is_redeemed_parent,
      public.fn_coupon_global_redeemed(c.id, now()) as is_sold_out
  ) as chk
  cross join lateral (
    select
      (chk.is_granted_student or chk.is_granted_parent) as is_granted_overall,
      -- 5-d절과 동일 규칙 — 학생 소유·미소진 우선, 아니면 학부모, 둘 다
      -- 아니면 NULL(granted 인데 소유자가 없거나 이미 다 소진). auto 는
      -- 항상 NULL.
      case
        when c.grant_type <> 'granted' then null
        when chk.is_granted_student and not chk.is_redeemed_student then v_student
        when chk.is_granted_parent and not chk.is_redeemed_parent then v_parent
        else null
      end as owner_id
  ) as own
  where c.is_active = true
  order by c.discount_amount desc, c.slug;
end;
$$;

comment on function public.fn_usable_coupons(integer, uuid) is
  '쿠폰 판정 정본(활성 쿠폰만, sql/68 5-h절 쌍 축 재작성). p_student_profile_id 가 NULL 이면 호출자를 학생으로 보고 approved 학부모를 도출한다 — 값이 있으면 호출자가 그 학생 본인/학부모인지 검증한다(WC030). 쌍(학생+학부모)이 없으면 빈 목록. eligible/reason 은 5-d절 fn_redeem_coupons 와 동일 규칙(granted=쌍 OR+학생 우선, auto=소유 판정 없음). owner_profile_id/owner_is_student 로 "누구 보유분"인지 알려준다(auto 는 owner_profile_id NULL). 한국어 라벨은 만들지 않는다 — 표기는 프론트 책임.';

revoke all on function public.fn_usable_coupons(integer, uuid) from public;
-- anon 도 포함 — 비회원 결제 허용(api/create-order.js) 원칙은 유지한다.
-- 다만 p_student_profile_id 없이 비로그인으로 부르면 위 쌍 가드에서 빈
-- 목록을 받는다(anon 은 auth.uid() 가 NULL 이라 애초에 쌍이 성립하지 않음).
grant execute on function public.fn_usable_coupons(integer, uuid) to anon, authenticated, service_role;

create or replace function public.fn_coupon_by_code(
  p_code                text,
  p_subtotal            integer default 0,
  p_student_profile_id  uuid    default null
)
returns table (
  id                uuid,
  title             text,
  discount_amount   integer,
  min_amount        integer,
  valid_until       date,
  is_active         boolean,
  eligible          boolean,
  reason            text,
  owner_profile_id  uuid,
  owner_is_student  boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller  uuid := auth.uid();
  v_student uuid;
  v_parent  uuid;
  v_today   date := (now() at time zone 'Asia/Seoul')::date;
  v_code    text := lower(trim(coalesce(p_code, '')));
begin
  if p_student_profile_id is null then
    v_student := v_caller;
  else
    if v_caller is distinct from p_student_profile_id
       and not public.fn_is_linked_pair(v_caller, p_student_profile_id) then
      raise exception 'not_authorized_for_student' using errcode = 'WC030';
    end if;
    v_student := p_student_profile_id;
  end if;

  if v_code = '' then
    return;
  end if;

  select l.parent_id into v_parent
    from public.parent_child_links l
   where l.student_id = v_student and l.status = 'approved'
   limit 1;

  if v_student is null or v_parent is null then
    return;
  end if;

  return query
  select
    c.id,
    c.title,
    c.discount_amount,
    c.min_amount,
    c.valid_until,
    c.is_active,
    (
      c.is_active
      and (c.valid_until is null or c.valid_until >= v_today)
      and coalesce(p_subtotal, 0) >= c.min_amount
      and (c.max_uses_per_user is null or v_student is not null)
      and not chk.is_sold_out
      and (c.grant_type <> 'granted' or own.owner_id is not null)
    ) as eligible,
    case
      when not c.is_active then 'inactive'
      when c.valid_until is not null and c.valid_until < v_today then 'expired'
      when coalesce(p_subtotal, 0) < c.min_amount then 'below_min_amount'
      when c.max_uses_per_user is not null and v_student is null then 'login_required'
      when c.grant_type = 'granted' and not own.is_granted_overall then 'not_granted'
      when chk.is_sold_out then 'sold_out'
      when c.grant_type = 'granted' and own.owner_id is null then 'already_used'
      else null
    end as reason,
    own.owner_id as owner_profile_id,
    (own.owner_id is not null and own.owner_id = v_student) as owner_is_student
  from public.coupons c
  cross join lateral (
    select
      public.fn_coupon_is_granted(c.id, v_student) as is_granted_student,
      public.fn_coupon_is_granted(c.id, v_parent)  as is_granted_parent,
      public.fn_coupon_is_redeemed(c.id, v_student, now()) as is_redeemed_student,
      public.fn_coupon_is_redeemed(c.id, v_parent, now())  as is_redeemed_parent,
      public.fn_coupon_global_redeemed(c.id, now()) as is_sold_out
  ) as chk
  cross join lateral (
    select
      (chk.is_granted_student or chk.is_granted_parent) as is_granted_overall,
      case
        when c.grant_type <> 'granted' then null
        when chk.is_granted_student and not chk.is_redeemed_student then v_student
        when chk.is_granted_parent and not chk.is_redeemed_parent then v_parent
        else null
      end as owner_id
  ) as own
  where c.code is not null
    and lower(c.code) = v_code
  limit 1;
end;
$$;

comment on function public.fn_coupon_by_code(text, integer, uuid) is
  '코드 직접 입력 조회 전용(sql/68 5-h절 쌍 축 재작성). code 를 입력으로만 받고 반환하지 않는다(sql/55 P1-1 유지). 학생/학부모 판정 축과 owner_profile_id/owner_is_student 는 fn_usable_coupons 와 동일 규칙(WC030 포함). 못 찾으면 0행.';

revoke all on function public.fn_coupon_by_code(text, integer, uuid) from public;
grant execute on function public.fn_coupon_by_code(text, integer, uuid) to anon, authenticated, service_role;


-- ---------------------------------------------------------------------
-- 5-i) fn_revalidate_order_coupons 재작성 : 행별 소유자 축으로.
--    기존은 orders.user_id(=parent_profile_id, orders_user_id_is_parent_
--    check) 하나를 읽어 3개 판정 함수에 전부 넘겼다 — coupon_redemptions
--    이력은 소진된 소유자별로 쌓이는데(5-d절) 그 소유자가 아닌 학부모
--    고정 축으로 재판정하면, 학생이 소유·소진한 쿠폰은 "학부모가
--    발급받은 적 없음(not_granted)"으로 오판정되어 정상 승인이 막힐 수
--    있다. 이 함수는 fn_respond_enrollment(5-a절)가 학부모 승인 시점에
--    직접 호출하는 게이트라 여기가 틀리면 승인이 엉뚱하게 통과/실패한다.
--
--    v_user_id 단일 축을 버리고 coupon_redemptions 행마다 cr.user_id 를
--    축으로 쓴다. cr.user_id 가 NULL(auto)이면 소유자가 없으므로
--    is_granted:=true/is_redeemed:=false 로 고정한다(5-d-2절 CHECK 가
--    auto 의 per-user cap 자체를 금지하므로 안전하다). NOT NULL(granted)
--    이면 그 소유자 축으로 그대로 판정한다. fn_coupon_global_redeemed 는
--    전역 축이라 그대로 유지한다. 기존 LATERAL 패턴(행당 판정 1회)도
--    그대로 유지한다(sql/55 원문 주석 근거 동일).
--
--    signature/반환 타입 변경 없음 — DROP 없이 CREATE OR REPLACE 로 충분.
-- ---------------------------------------------------------------------
create or replace function public.fn_revalidate_order_coupons(p_order_id text)
returns table (
  coupon_id uuid,
  ok        boolean,
  reason    text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := now();
begin
  return query
  select
    cr.coupon_id,
    (chk.is_granted and not chk.is_redeemed and not chk.is_sold_out) as ok,
    case
      when not chk.is_granted then 'not_granted'
      when chk.is_redeemed then 'already_used'
      when chk.is_sold_out then 'sold_out'
      else null
    end as reason
  from public.coupon_redemptions cr
  cross join lateral (
    select
      (cr.user_id is null or public.fn_coupon_is_granted(cr.coupon_id, cr.user_id)) as is_granted,
      (cr.user_id is not null
        and public.fn_coupon_is_redeemed(cr.coupon_id, cr.user_id, v_now, p_order_id)) as is_redeemed,
      public.fn_coupon_global_redeemed(cr.coupon_id, v_now, p_order_id) as is_sold_out
  ) as chk
  where cr.order_id = p_order_id
    and cr.voided_at is null;
end;
$$;

comment on function public.fn_revalidate_order_coupons(text) is
  'service_role 전용. 결제 승인 직전 호출 — coupon_redemptions 행마다 그 행의 귀속 소유자(cr.user_id)를 축으로 재판정한다(sql/68 5-i절 재작성, orders.user_id 단일 축 폐기). cr.user_id NULL(auto)은 소유 판정 없이 항상 발급·미소진 취급. 판정 축 3개: 발급(not_granted)/1인 사용 횟수(already_used)/전체 발행량(sold_out). 행이 없으면 이 주문에 쿠폰이 없다는 뜻(통과). ok=false 행이 있으면 승인을 진행하지 않아야 한다.';

revoke all on function public.fn_revalidate_order_coupons(text)
  from public, anon, authenticated;
grant execute on function public.fn_revalidate_order_coupons(text) to service_role;


-- ---------------------------------------------------------------------
-- 5-j) program_access_grants.first_accessed_at + fn_mark_program_entry
--    (2026-08-12 팀 리드 지시). 기간권(목표관리)은 지금 소비 흔적이 아무
--    곳에도 기록되지 않는다 — 위 5-b절 fn_request_refund 의 소비 게이트가
--    기간권 축을 판정할 자리가 없었다. 자리를 만든다.
--
--    입장 게이트(fn_program_access_state, sql/64/65)는 STABLE(읽기 전용)
--    이라 쓰기를 할 수 없다 — VOLATILE 로 바꾸지 않는다(이 파일 범위 밖
--    함수이기도 하다). 게이트는 매 진입마다 호출되는 읽기 경로라 거기에
--    쓰기를 넣으면 경합이 생긴다. 그래서 별도 VOLATILE RPC 로 분리한다.
--
--    ⚠ 배선은 이 작업 범위가 아니다 — 목표관리 앱은 goal-app-api 브랜치에
--    미머지라 이 RPC 를 부르는 호출자가 아직 없다. 1차 운영에서는
--    first_accessed_at 이 항상 NULL 로 남아 기간권이 계속 "미소비"로
--    판정된다 — 회차권(수행평가·콜멘토)만 5-b절 게이트가 실질적으로
--    작동한다. 배선은 목표관리 작업 소유(팀 리드 지시).
-- ---------------------------------------------------------------------
alter table public.program_access_grants
  add column if not exists first_accessed_at timestamptz;

comment on column public.program_access_grants.first_accessed_at is
  '이 부여로 프로그램에 최초 진입한 시각. NULL = 미진입(=미소비). fn_request_refund(5-b절) 의 소비 게이트(WC032)가 기간권 축 판정에 이 컬럼을 쓴다. fn_mark_program_entry 가 최초 1회만 채우고 이후 UPDATE 는 없다 — 이 컬럼을 쓰는 호출자(목표관리 앱)가 아직 배선되지 않아(goal-app-api 브랜치 미머지) 1차 운영에서는 항상 NULL 이다(sql/68 5-j절).';

create or replace function public.fn_mark_program_entry(p_program_key text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- 호출자(auth.uid()) 의 그 program_key 살아있는(revoked_at is null) 부여
  -- 들 중 first_accessed_at 이 아직 NULL 인 행에만 now() 를 1회 기록한다.
  -- 이미 값이 있는 행은 WHERE 조건에서 자연히 빠져 덮어쓰지 않는다(최초
  -- 진입만 기록 — 관례: "최초" 를 표현하는 컬럼은 조건부 UPDATE 로
  -- 멱등하게 만든다, sql/65 §1 원장 불변 원칙과 같은 방향).
  update public.program_access_grants g
     set first_accessed_at = now()
   where g.profile_id = auth.uid()
     and g.program_key = p_program_key
     and g.revoked_at is null
     and g.first_accessed_at is null;

  -- 부여가 없거나 이미 진입 기록이 있으면 0행 UPDATE — 예외를 던지지
  -- 않는다(팀 리드 지시). 입장 가부 판정은 fn_program_access_state 의
  -- 몫이고, 이 함수는 "이미 들어왔다면 그 사실만 기록"하는 후행 동작이다.
  return;
end;
$$;

comment on function public.fn_mark_program_entry(text) is
  '호출자(auth.uid())의 program_key 살아있는 부여 중 first_accessed_at 이 NULL 인 행에 최초 1회 now() 를 기록한다(멱등 — 재호출해도 이미 값이 있으면 아무 것도 바뀌지 않는다). 부여가 없어도 예외를 던지지 않는다(게이트가 이미 접근을 막으므로 이 함수가 재검증할 필요가 없다). 배선(목표관리 앱)은 sql/68 범위 밖이다(5-j절).';

revoke all on function public.fn_mark_program_entry(text) from public;
grant execute on function public.fn_mark_program_entry(text) to authenticated, service_role;


-- =====================================================================
-- 6) coupon_wallet_state 뷰 — 보유·사용·잔여를 한 행으로.
--    Stripe 의 credit_balance_summary 자리에 해당한다(체크아웃/마이페이지
--    표시용).
--
--    security_invoker=true 필수 — repo 기존 뷰 5개(goal_student_state 등)
--    전부 그렇다. 이게 없으면 뷰가 소유자 권한으로 돌아 RLS 를 우회한다.
--
--    remaining_count 가 NULL = 무제한 — 이 저장소 전역 관례(NULL=무기한/
--    무제한)와 일치.
--
--    auto 쿠폰은 이 뷰에 나오지 않는다(coupon_grants 에 행이 없으므로) —
--    버그가 아니라 정의다. 이 뷰는 "보유 지갑"이고 auto 는 애초에
--    보유물이 아니다(누구나 조건만 맞으면 쓴다).
--
--    used_count 는 voided_at is null 만 센다. 실패 주문 제외 로직
--    (fn_coupon_is_redeemed 가 하는 o.status='failed' / pending 30분
--    시간창 초과 제외)까지 복제하지 않는다 — 뷰는 표시용 근사치이고
--    **결제 판정의 정본은 fn_coupon_is_redeemed/fn_redeem_coupons 등
--    판정 함수다.** 이 뷰로 결제 가부를 판단하지 마라.
-- =====================================================================
create or replace view public.coupon_wallet_state
with (security_invoker = true)
as
select
  g.user_id,
  c.id            as coupon_id,
  c.slug,
  c.title,
  c.discount_amount,
  c.min_amount,
  c.valid_until,
  c.is_active,
  c.grant_type,
  c.max_uses_per_user,
  g.granted_at,
  g.granted_by,
  g.revoked_at,
  (select count(*) from public.coupon_redemptions r
    where r.coupon_id = c.id and r.user_id = g.user_id and r.voided_at is null) as used_count,
  case when c.max_uses_per_user is null then null
       else greatest(c.max_uses_per_user - (select count(*) from public.coupon_redemptions r
             where r.coupon_id = c.id and r.user_id = g.user_id and r.voided_at is null), 0)
  end as remaining_count
from public.coupon_grants g
join public.coupons c on c.id = g.coupon_id;

comment on view public.coupon_wallet_state is
  '보유 쿠폰 지갑 표시용(근사치) — 결제 판정의 정본은 판정 함수(fn_coupon_is_redeemed 등)다. coupon_grants 에 행이 없는 auto 쿠폰은 나오지 않는다(정의상 보유물이 아님). remaining_count NULL=무제한. used_count 는 voided_at is null 만 세고 실패/시간창 제외 로직은 복제하지 않는다(sql/68 6절).';

grant select on public.coupon_wallet_state to authenticated, service_role;


-- =====================================================================
-- 7) SQLSTATE 배정 (기존 WC001~WC018 은 sql/55/58/59/61/62/65/66)
-- =====================================================================
--   WC019  enrollment_pair_required        fn_redeem_coupons: 학생/학부모
--                                           프로필 id 가 하나라도 NULL.
--   WC020  enrollment_pair_same_profile    fn_redeem_coupons: 학생=학부모.
--   WC021  order_not_found                 fn_respond_enrollment: 주문 없음.
--   WC022  not_order_parent                fn_respond_enrollment: 호출자가
--                                           그 주문의 parent_profile_id 아님.
--   WC023  enrollment_not_pending          fn_respond_enrollment: 이미 응답됨.
--   WC024  coupon_revalidation_failed      fn_respond_enrollment: 승인 시
--                                           쿠폰 재검증 실패(재신청 유도).
--   WC025  reject_reason_required          fn_respond_enrollment: 반려에
--                                           사유 없음.
--   WC026  refund_request_not_found        fn_respond_refund: 신청 없음.
--   WC027  not_refund_parent               fn_respond_refund: 호출자가 그
--                                           신청의 parent_profile_id 아님.
--   WC028  refund_not_pending              fn_respond_refund: 이미 응답됨.
--   WC029  reject_reason_required          fn_respond_refund: 반려에 사유 없음.
--   WC030  not_authorized_for_student      fn_usable_coupons/fn_coupon_by_code:
--                                           호출자가 p_student_profile_id 로
--                                           지정한 학생 본인도 그 학생의
--                                           approved 학부모도 아님.
--   WC031  coupon_per_user_cap_exceeded    fn_redeem_coupons: 쿠폰 귀속
--                                           직전 재검증 실패(6-a절, (b)안)
--                                           — advisory lock 을 우회한
--                                           경로가 같은 (coupon, owner)
--                                           를 동시에 소진했다는 뜻(정상
--                                           흐름에서는 도달 불가). DB 층
--                                           (a) CHECK+unique(5-d-3절)와
--                                           함께 두 겹 백스톱.
--   WC032  order_already_consumed          fn_request_refund: 그 주문의
--                                           program_access_grants 에
--                                           회차 순소비 또는 기간권
--                                           최초 진입 흔적이 있어 환불
--                                           신청 자체를 거부(사용자
--                                           확정 — 소비했으면 환불
--                                           불가, 1차는 주문 단위 판정).
--
--   재사용(신규 아님, sql/64/65/59 원문과 같은 의미로 유지):
--     WC001 invalid_amount (fn_redeem_coupons)
--     WC005 order_not_found_or_not_owned / WC006 order_not_refundable /
--     WC007 duplicate_refund_request (fn_request_refund)
--     WC010 order_not_found / WC011 order_user_mismatch /
--     WC012 product_entitlement_spec_missing
--       (fn_grant_program_access_for_order / fn_revoke_program_access_for_order)
-- =====================================================================


-- =====================================================================
-- 확인용 (실행 후 눈으로 볼 것 — 아래는 주석, 자동 실행되지 않는다)
-- =====================================================================
--
-- V1) 컬럼·제약
-- select column_name, is_nullable from information_schema.columns
--  where table_schema='public' and table_name='orders'
--    and column_name in ('student_profile_id','parent_profile_id','approval_status');
-- select conname, pg_get_constraintdef(oid) from pg_constraint
--  where conrelid = 'public.orders'::regclass and contype in ('c','f')
--    and conname like 'orders_%pair%' or conname like 'orders_approval%' or conname like 'orders_user_id_is_parent%';
-- select conname, pg_get_constraintdef(oid) from pg_constraint
--  where conrelid = 'public.refund_requests'::regclass and contype in ('c','f');
-- select indexname, indexdef from pg_indexes
--  where tablename = 'refund_requests' and indexname = 'refund_requests_open_order_uniq';
--
-- V2) RLS
-- select policyname, cmd, qual from pg_policies
--  where schemaname='public' and tablename in ('orders','refund_requests') order by tablename, policyname;
--
-- V3) 함수 오버로드 정확히 1개씩인지(구 시그니처가 남아있지 않은지)
-- select proname, count(*) from pg_proc
--  where pronamespace = 'public'::regnamespace
--    and proname in ('fn_redeem_coupons','fn_request_refund','fn_respond_enrollment',
--                     'fn_respond_refund','fn_grant_program_access_for_order',
--                     'fn_revoke_program_access_for_order','fn_usable_coupons',
--                     'fn_coupon_by_code','fn_revalidate_order_coupons',
--                     'fn_is_linked_pair')
--  group by proname;
--
-- V4) 부분 유니크 인덱스 동작 — 학생 신청(대기) 상태에서 두 번째 신청 시도 시
--     23505, 학부모가 반려한 뒤에는 성공(재신청 허용)해야 한다.
--
-- V5) coupons 개인별 cap CHECK — auto 인 쿠폰에 max_uses_per_user 를 걸어
--     보면 23514 로 거부돼야 한다(5-d-2절).
--     update public.coupons set max_uses_per_user = 1
--      where slug = 'over40k-3000'; -- 실패해야 정상
--
-- V6) coupon_grants 쌍 확장 — 학생 A/학부모 B(approved 링크)에서 B 세션으로
--     select * from public.coupon_grants where user_id = 'A 의 uuid'; 가
--     행을 반환해야 한다(5-g절).
--
-- V7) coupon_wallet_state — auto 쿠폰(coupon_grants 에 행 없음)이 이 뷰에
--     안 나오는지, granted 쿠폰(signup-2000)은 나오는지 확인.
--     select * from public.coupon_wallet_state where user_id = '학생 uuid';
--
-- V8) 쌍 락이 실제로 이중 소진을 막는지 — 두 세션으로 재현(2026-08-12
--     팀 리드 지시). 준비: 학부모 P(uuid=:P), 자녀 A(uuid=:A)/B(uuid=:B)
--     둘 다 P 의 approved 자녀, P 가 소유·미소진인 signup-2000(uuid=:C,
--     max_uses_per_user=1). 서로 다른 주문 id 두 개('race-a'/'race-b')를
--     준비한다(orders 에 미리 존재할 필요는 없다 — fn_redeem_coupons 가
--     새로 만든다).
--
--   session 1:
--     begin;
--     select * from public.fn_redeem_coupons(
--       'race-a', :A, :P, 'a@test.com', '주문 A',
--       '[{"product_id":"<product uuid>","price":100000,"quantity":1}]'::jsonb,
--       100000, 100000, array[:C]::uuid[]
--     );
--     -- 여기서 COMMIT 하지 말고 대기 — session 2 가 advisory lock 에
--     -- 걸려 블로킹되는 것을 먼저 확인한다.
--
--   session 2 (session 1 이 아직 커밋 안 한 상태에서 바로 실행):
--     select * from public.fn_redeem_coupons(
--       'race-b', :B, :P, 'b@test.com', '주문 B',
--       '[{"product_id":"<product uuid>","price":100000,"quantity":1}]'::jsonb,
--       100000, 100000, array[:C]::uuid[]
--     );
--     -- session 1 이 (:C, :P) 쌍 락(salt=2)을 쥐고 있으므로 이 세션은
--     -- session 1 이 커밋/롤백할 때까지 블로킹돼야 한다.
--
--   session 1: commit;
--     -- session 2 가 그제서야 진행된다. session 1 이 이미 P 의 signup-2000
--     -- 을 소진했으므로, session 2 쪽 1)단계 후보 루프에서 fn_coupon_is_
--     -- redeemed(:C, :P, now()) 가 true 가 되어 그 후보가 조용히 제외된다
--     -- (예외가 아니다 — continue 경로). 즉 주문 B 는 성공하지만 쿠폰 할인
--     -- 없이 성공해야 한다(applied_coupon_ids 에 :C 가 없어야 함).
--
--   확인:
--     select coupon_id, user_id, order_id, voided_at
--       from public.coupon_redemptions where coupon_id = :C;
--     -- 정확히 1행(order_id='race-a')이어야 한다. 2행이면(둘 다 소진)
--     -- 락이 뚫린 것 — 실패.
--
-- V9) 5-d-3) DB 백스톱((a)+(b) 두 겹, 2026-08-12 팀 리드 최종 확정) —
--     아래 둘 다 23514/23505 로 거부돼야 한다.
--       update public.coupons set max_uses_per_user = 2
--        where slug = 'signup-2000'; -- 실패해야 정상(coupons_granted_cap_is_one_check)
--       insert into public.coupon_redemptions (coupon_id, user_id, order_id, discount_amount)
--         select id, '<이미 소진된 user_id>', '<존재하는 order_id>', 1000
--           from public.coupons where slug = 'signup-2000';
--     -- 두 번째는 이미 그 (coupon_id, user_id) 쌍의 살아있는(voided_at is
--     -- null) 행이 있을 때만 23505 로 실패한다(coupon_redemptions_single_
--     -- use_uidx) — fn_redeem_coupons 를 거치지 않고 service_role 로
--     -- 직접 시도해도 막혀야 한다(이게 (a) 의 핵심 — (b) 재검증은 함수
--     -- 경로에서만 발동하므로 이 직접 INSERT 시나리오는 (a) 만 잡는다).
--
-- V10) 위 V8 을 6-a)절 (b) 재검증까지 검증하려면, session 2 시작 직전에
--     별도 세션에서 `select pg_advisory_xact_lock(hashtextextended(:C::text,
--     hashtextextended(:P::text, 2)))` 를 먼저 잡아둔 채 다른 커넥션으로
--     coupon_redemptions 에 직접 (coupon_id=:C, user_id=:P) 행을 INSERT
--     (service_role 키로) 해 락을 우회한 상황을 인위로 만든 뒤 session 2
--     의 fn_redeem_coupons 호출이 WC031 로 실패하는지 확인한다 — 정상
--     운영에서는 절대 유발되면 안 되는 시나리오이므로 dev 에서만 수행하고
--     끝나면 그 인위 삽입 행을 지운다.
--
-- V11) refund_requests order_item_id + NULLS NOT DISTINCT (2026-08-12
--     팀 리드 지시) — 같은 주문(:O)에 대해 fn_request_refund 를 두 번
--     연달아 호출하면 두 번째는 WC007(duplicate_refund_request) 로 막혀야
--     한다(order_item_id 가 항상 NULL 이라 이게 바로 nulls not distinct
--     가 실제로 막아주는 그 시나리오다). 인덱스만 직접 확인하려면:
--       select order_id, order_item_id, count(*) from public.refund_requests
--        where status in ('requested','processing') and approval_status <> 'rejected'
--        group by 1, 2 having count(*) > 1;
--       -- 0행이어야 한다(인덱스가 이미 이걸 막으므로 이 쿼리 자체가
--       -- 항상 0행일 것 — 인덱스를 우회한 경로가 있었는지 감사용).
--
-- V12) 소비 시 환불 불가 게이트(WC032) — 회차권. 그 주문으로 부여된
--     program_access_grants 에 대해 회차를 1회 이상 소비(performance_
--     credit_ledger 에 delta<0 원본 행 insert, sql/65 §6 consume_
--     performance_credit 경유)한 뒤 같은 주문으로 fn_request_refund 를
--     호출 → WC032 로 거부되고 detail 에 program_key:소비회차 가 찍혀야
--     한다. 그 소비를 되돌림(reversal_of)으로 상쇄한 뒤 다시 호출하면
--     통과해야 한다(순소비 0으로 돌아옴 — 별도 분기 없이 sum(-delta) 로
--     자동 반영되는지가 이 케이스의 핵심).
--
-- V13) 소비 시 환불 불가 게이트(WC032) — 기간권. fn_mark_program_entry
--     를 그 주문의 grant profile/program_key 로 호출해 first_accessed_at
--     을 채운 뒤 fn_request_refund 호출 → WC032, detail 에 진입 시각이
--     찍혀야 한다. 재호출해도 first_accessed_at 이 바뀌지 않는지(멱등)도
--     같이 확인한다.
--
-- =====================================================================
-- 적용 이력
-- =====================================================================
-- 미적용 — 이 파일은 작성만 완료했다(2026-08-12). 적용·검증은 팀 리드가
-- 별도로 수행한다(운영 DB(ucjlcvqvinspmrasvsug)는 이 작업 범위에서 읽기조차
-- 하지 않았다).
-- =====================================================================
