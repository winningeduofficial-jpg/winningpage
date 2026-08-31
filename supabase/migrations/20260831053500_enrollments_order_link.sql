-- =====================================================================
-- 수강 신청 내역에 결제방식·승인번호를 붙인다 (QA 272).
--
-- 배경 — 두 원장이 갈라져 있다
--   enrollments 는 **오프라인 수강 장부**다. 코드 어디에서도 행을 만들지 않고
--   어드민 폼이 유일한 생성 경로다(dev 실측 0행). 반면 실제 결제는 orders 에
--   쌓인다(토스 승인 → api/confirm-payment). 그래서 수강 신청 내역 화면에는
--   결제방식·승인번호를 채울 값이 애초에 없었다.
--
--   같은 병을 「매출 및 결제」에서 한 번 앓았다 — 어드민이 보는 수기 장부와
--   사용자가 결제하는 테이블이 따로 놀아서, 화면이 그리려는 컬럼이 실제
--   스키마에 없어 빈 화면으로 떠 있었다(20260823000011 주석). 이번에는 장부를
--   지우는 대신 **주문을 가리키는 키 하나**를 놓아 두 원장을 잇는다.
--
-- ⚠️ order_id 는 **자동으로 채워지지 않는다.** 오프라인 접수를 어드민이 적을 때
--    해당 온라인 주문번호를 함께 넣는 운영이다. 비어 있으면 결제방식·승인번호가
--    그냥 빈 칸으로 나온다 — 오프라인 현금 수납처럼 대응 주문이 없는 건도
--    정상이므로 NOT NULL 로 묶지 않는다.
--
-- ⚠️ on delete set null 인 이유: 주문이 지워졌다고 수강 기록까지 사라지면 안 된다.
--    연결만 끊고 장부는 남긴다.
-- =====================================================================

alter table public.enrollments
  add column if not exists order_id text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'enrollments_order_id_fkey'
  ) then
    alter table public.enrollments
      add constraint enrollments_order_id_fkey
      foreign key (order_id) references public.orders (id) on delete set null;
  end if;
end $$;

comment on column public.enrollments.order_id is
  '이 오프라인 수강 건에 대응하는 온라인 주문(orders.id). 어드민이 손으로 연결한다 — 대응 주문이 없는 현금 수납 등은 NULL(20260831053500, QA 272).';

create index if not exists enrollments_order_idx
  on public.enrollments (order_id)
  where order_id is not null;


-- ---------------------------------------------------------------------
-- 목록 화면용 평면 뷰.
--
-- 어드민 제네릭 엔진은 config.table 로 읽고 쓴다. 조인 뷰는 쓰기가 안 되므로
-- 화면 쪽에서 **읽기만** 이 뷰로 돌리고(config.listTable) 등록·수정은 그대로
-- enrollments 테이블로 간다. 그래서 이 뷰는 원본 컬럼을 하나도 빠뜨리지 않고
-- 그대로 내보낸 뒤 파생 컬럼 둘만 덧붙인다 — 목록이 참조하는 키가 사라지면
-- 화면이 조용히 빈 칸으로 뜬다.
--
-- security_invoker=on — 조회자 권한으로 enrollments·orders RLS 를 평가한다
-- (끄면 이 뷰가 RLS 우회 경로가 된다. admin_member_directory 와 같은 이유).
-- ---------------------------------------------------------------------
create or replace view public.admin_enrollment_entries
with (security_invoker = on)
as
select
  e.id,
  e.profile_id,
  e.term_name,
  e.category_name,
  e.program_name,
  e.class_name,
  e.guardian_name,
  e.student_name,
  e.phone,
  e.grade,
  e.school_name,
  e.application_status,
  e.payment_status,
  e.price,
  e.discount_amount,
  e.paid_amount,
  e.memo,
  e.created_at,
  e.updated_at,
  e.order_id,
  -- 토스가 돌려준 결제수단 문자열(카드 / 가상계좌 / 계좌이체 / 휴대폰 / 간편결제).
  o.method as payment_method,
  -- 카드 승인번호. 토스 결제 객체의 card.approveNo 다. 가상계좌·계좌이체에는
  -- 승인번호 개념이 없어 NULL 이 정상이다 — payment_key(결제 토큰)로 대신
  -- 채우지 않는다. 그건 승인번호가 아니라서 대사(對査)에 쓰면 틀린다.
  o.raw -> 'card' ->> 'approveNo' as approval_no,
  o.paid_at as order_paid_at
from public.enrollments e
left join public.orders o on o.id = e.order_id;

comment on view public.admin_enrollment_entries is
  '수강 신청 내역 목록용 평면 뷰(20260831053500). enrollments 에 연결된 주문의 결제방식·카드 승인번호를 덧붙인다. 쓰기는 이 뷰가 아니라 enrollments 테이블로 간다.';

grant select on public.admin_enrollment_entries to authenticated;


-- =====================================================================
-- 확인용 (실행 후 눈으로 볼 것 — 아래는 주석, 자동 실행되지 않는다)
-- =====================================================================
-- 1) 연결된 건과 안 된 건이 함께 나오는지.
-- select student_name, order_id, payment_method, approval_no
--   from public.admin_enrollment_entries order by created_at desc limit 20;
--
-- 2) 승인번호가 실제로 실리는지(카드 결제 주문 하나로).
-- select id, method, raw -> 'card' ->> 'approveNo' from public.orders
--  where raw -> 'card' ->> 'approveNo' is not null limit 5;
