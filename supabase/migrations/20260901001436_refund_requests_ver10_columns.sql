-- =====================================================================
-- 환불 Ver10 1/3 — refund_requests 컬럼 확장 + 기존 행 v9 표기
-- (docs/refund-quote-ver10-design.md §3-2·§3-3 1번. 함수 변경 없음 — 이
--  파일만 적용돼도 기존 동작은 그대로다.)
--
-- 무엇이 늘어나나
--   order_item_ids       부분해지 대상 구성서비스(order_items.id 배열).
--                        NULL = 주문 전체(§2-10 권장 (b) — 신청 1건 = 집합).
--                        기존 order_item_id 단일 컬럼은 쓰지 않는다(항상 NULL).
--   company_fault        회사 귀책 여부(제33조의1 ⑪ 예외 1호). 어드민만
--                        세팅한다(fn_admin_requote_refund, §2-9) — 사용자
--                        화면에는 노출하지 않는다.
--   within_withdrawal    신청 시점 산정에서 모든 대상 라인이 청약철회기간
--                        (제32조 ①, 7일) 안이었는지 스냅샷.
--   bundle_return_amount 제33조의2 ⑦ 동시결제 조건부 할인 반환금 합.
--                        현 데이터 모델에는 조건부 할인 컬럼이 없어 항상
--                        0이다(§2-5 확정) — 컬럼을 미리 두는 이유는 산정
--                        결과의 3단계(안분 → 정책 → 공제)를 행에 남기기 위함.
--   terms_version        이 신청의 산정 약관 버전. 기존 행은 'v9' 로 backfill
--                        — Ver9 로 확정·동의된 금액은 재산정하지 않는다(§3-4).
--                        fn_complete_refund 는 v9 행에서 WC039 재견적 비교를
--                        건너뛴다(WC037 누적 상한은 유지).
--   coupon_restored_at   전부 청약철회로 쿠폰을 복원(제33조의3 ⑤)한 시각.
-- =====================================================================

alter table public.refund_requests
  add column if not exists order_item_ids       bigint[],
  add column if not exists company_fault        boolean not null default false,
  add column if not exists within_withdrawal    boolean,
  add column if not exists bundle_return_amount integer,
  add column if not exists terms_version        text,
  add column if not exists coupon_restored_at   timestamptz;

-- 기존 행은 전부 Ver9 산정이다. default 를 먼저 걸면 기존 행이 'v10' 으로
-- 채워지므로, backfill 후에 default·not null 을 세운다.
update public.refund_requests set terms_version = 'v9' where terms_version is null;

alter table public.refund_requests
  alter column terms_version set default 'v10',
  alter column terms_version set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'refund_requests_terms_version_check'
       and conrelid = 'public.refund_requests'::regclass
  ) then
    alter table public.refund_requests
      add constraint refund_requests_terms_version_check
      check (terms_version in ('v9', 'v10'));
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'refund_requests_bundle_return_amount_check'
       and conrelid = 'public.refund_requests'::regclass
  ) then
    alter table public.refund_requests
      add constraint refund_requests_bundle_return_amount_check
      check (bundle_return_amount is null or bundle_return_amount >= 0);
  end if;

  -- 배열은 비어 있으면 안 된다 — "아무 항목도 아님"은 신청이 아니다.
  -- 부분해지 의도는 원소가 1개 이상인 배열, 주문 전체는 NULL 로만 표현한다.
  if not exists (
    select 1 from pg_constraint
     where conname = 'refund_requests_order_item_ids_nonempty_check'
       and conrelid = 'public.refund_requests'::regclass
  ) then
    alter table public.refund_requests
      add constraint refund_requests_order_item_ids_nonempty_check
      check (order_item_ids is null or cardinality(order_item_ids) > 0);
  end if;
end $$;

comment on column public.refund_requests.order_item_ids is
  '부분해지 대상 구성서비스(order_items.id 배열, §2-10 권장 (b)). NULL = 주문 전체. 열린 신청 간 항목 겹침은 fn_request_refund 가 주문 advisory lock 아래에서 배열 겹침 검사로 막는다(WC061) — 유니크 인덱스는 전체 환불 축(NULL)만 지킨다.';
comment on column public.refund_requests.company_fault is
  '회사 귀책 여부(제33조의1 ⑪ 예외 1호 — 정가 재산정 면제). 어드민 전용 fn_admin_requote_refund 만 true 로 바꾼다. 신청자가 고른 사유(reason)는 주장일 뿐 판정이 아니다(§2-9).';
comment on column public.refund_requests.within_withdrawal is
  '신청 시점 산정에서 모든 대상 라인이 청약철회기간(제32조 ①, 이용 가능일부터 7일) 안이었는지. fn_refund_quote v10 출력의 스냅샷.';
comment on column public.refund_requests.bundle_return_amount is
  '제33조의2 ⑦ 동시결제 조건부 할인 반환금 합. 현 데이터 모델에는 조건부 할인을 표현하는 컬럼이 없어 항상 0(§2-5 — 8/30 재정의 ⑦-1로 장기할인·쿠폰은 명시 제외).';
comment on column public.refund_requests.terms_version is
  '이 신청이 어느 약관 버전 산식으로 산정됐는가. v9 = 20260901 이전(100원 내림·주문 전체만), v10 = 제33조의1~3 Ver10. v9 행은 재산정하지 않으며(§3-4) fn_complete_refund 의 WC039 재견적 비교를 건너뛴다.';
comment on column public.refund_requests.coupon_restored_at is
  '전부 청약철회(제33조의3 ⑤)로 이 주문의 쿠폰 사용을 복원(coupon_redemptions.voided_at 기록)한 시각. fn_complete_refund 가 찍는다.';

-- ---------------------------------------------------------------------
-- 열린 신청 유니크 인덱스를 "주문 전체 신청 축 전용"으로 좁힌다.
--
-- 기존 인덱스는 (order_id, order_item_id) NULLS NOT DISTINCT 인데
-- order_item_id 가 항상 NULL 이라 사실상 "주문당 열린 신청 1건"이었다.
-- 부분해지(order_item_ids 배열)가 생기면 서로 겹치지 않는 항목 신청이
-- 동시에 열려 있을 수 있어야 하므로, 이 인덱스는 주문 전체 신청
-- (order_item_ids IS NULL)끼리의 중복만 막는다. 부분 신청 간·부분↔전체 간
-- 겹침은 fn_request_refund 의 advisory lock + 배열 겹침 검사가 막는다
-- (배열 겹침은 btree 유니크로 표현할 수 없다).
-- ---------------------------------------------------------------------
drop index if exists public.refund_requests_open_order_uniq;

create unique index refund_requests_open_order_uniq
  on public.refund_requests (order_id, order_item_id) nulls not distinct
  where status in ('requested', 'processing')
    and approval_status <> 'rejected'
    and order_item_ids is null;

comment on index public.refund_requests_open_order_uniq is
  '주문 전체(order_item_ids IS NULL) 열린 신청은 주문당 1건. 부분해지 신청 간 항목 겹침은 fn_request_refund(WC061)가 advisory lock 아래에서 검사한다 — 배열 겹침은 btree 유니크로 표현할 수 없어 인덱스 축과 함수 축을 나눴다(20260901 Ver10, §2-10).';
