-- =====================================================================
-- 환불 처리 사실을 원장에 남긴다 — 처리일자 · 처리자 · 환불방법 (QA 273·275).
--
-- 배경
--   파일18 「위닝에듀 정산관리」의 **환불 처리 대장**은 처리일 · 수강자명 ·
--   프로그램 · 소속코드 · 납부금액 · 환불금액 · 환불방법 · 처리자 · 사유 · 상태를
--   요구한다. 그런데 refund_requests 는 **신청 시점만** 기록하고 있었다 —
--   created_at(신청일시)은 있는데 **완료 시각도, 누가 처리했는지도, 어떤 방법으로
--   돌려줬는지도 없다.** QA 273 이 콕 집어 요구한 「환불처리일자」가 이것이다.
--
--   status='completed' 로 바뀐 사실만 있고 그게 **언제** 바뀌었는지가 없으니,
--   일자별 환불 집계도 정산 대사도 할 수 없었다. 지금까지는 orders.status 나
--   토스 응답을 뒤져야 알 수 있었는데 그건 원장이 아니라 흔적이다.
--
-- 무엇을 기록하나
--   completed_at   환불이 실제로 완결된 시각. fn_complete_refund 가 찍는다.
--   processed_by   그 RPC 를 부른 어드민. auth.uid() 를 그대로 남긴다.
--   refund_method  '계좌이체' | '카드취소'. 파일18 의 어휘를 그대로 쓴다.
--
-- ⚠️ refund_method 를 완료 시점에 **확정해서 박는** 이유
--    나중에 화면에서 유추할 수도 있다(환불계좌가 있으면 계좌이체겠지). 하지만
--    그건 추정이지 사실이 아니다. 계좌 정보는 나중에 지워질 수도 바뀔 수도 있고,
--    그러면 과거 대장의 환불방법이 조용히 달라진다. 감사 기록은 그 순간의 사실을
--    박아 둬야 한다.
--
--    판정 근거는 api/complete-refund.ts 의 실제 동작이다 — 가상계좌 결제는
--    환불 계좌(refund_bank/account/holder)로 송금하고, 카드·간편결제·계좌이체는
--    토스 결제취소로 원결제수단을 되돌린다.
--
-- ⚠️ 기존 완료 건은 completed_at 이 NULL 로 남는다. 소급해서 채우지 않는다 —
--    실제 완료 시각을 알 수 없는데 updated_at 이나 created_at 으로 메우면
--    "그럴듯한 거짓 날짜"가 대장에 박힌다. 화면은 빈 칸으로 두고, 그게 곧
--    "이 컬럼이 생기기 전에 처리된 건"이라는 뜻이 된다.
-- =====================================================================

alter table public.refund_requests
  add column if not exists completed_at  timestamptz,
  add column if not exists processed_by  uuid,
  add column if not exists refund_method text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'refund_requests_processed_by_fkey'
       and conrelid = 'public.refund_requests'::regclass
  ) then
    alter table public.refund_requests
      add constraint refund_requests_processed_by_fkey
      foreign key (processed_by) references public.profiles (id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'refund_requests_refund_method_check'
       and conrelid = 'public.refund_requests'::regclass
  ) then
    alter table public.refund_requests
      add constraint refund_requests_refund_method_check
      check (refund_method is null or refund_method in ('계좌이체', '카드취소'));
  end if;
end $$;

comment on column public.refund_requests.completed_at is
  '환불이 실제로 완결된 시각. fn_complete_refund 가 찍는다. 이 컬럼이 생기기 전(20260831081100)에 처리된 건은 NULL 이다 — 실제 시각을 알 수 없어 소급하지 않았다.';
comment on column public.refund_requests.processed_by is
  '환불 완료를 실행한 어드민(profiles.id). 계정이 지워져도 대장은 남아야 하므로 on delete set null.';
comment on column public.refund_requests.refund_method is
  '계좌이체 | 카드취소. 완료 시점에 확정해서 박는다 — 환불계좌 유무로 나중에 유추하면 계좌 정보가 바뀔 때 과거 대장이 조용히 달라진다.';

create index if not exists refund_requests_completed_idx
  on public.refund_requests (completed_at desc)
  where completed_at is not null;


-- ---------------------------------------------------------------------
-- fn_complete_refund 가 위 셋을 기록하도록 고친다.
--
-- baseline:1136 원문에서 **UPDATE 한 문장만** 바뀐다. 판정·가드(42501 · WC026 ·
-- WC035 · WC036 · WC037 · WC039)와 권한 회수 · 주문 종결은 손대지 않는다 —
-- 환불 정합성의 핵심이라 이번 요구(기록 추가)와 무관하게 그대로 둬야 한다.
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

  -- 재견적 가드(WC039) — 신청 이후 추가 이용이 생겨 산정액이 줄었으면 거부한다.
  -- 금액이 바뀌면 신청자에게 다시 동의를 받아야 하므로 조용히 깎지 않는다.
  select * into v_quote from public.fn_refund_quote(v_row.order_id);
  if v_quote.refund_amount < v_row.amount then
    raise exception 'refund_quote_changed'
      using errcode = 'WC039',
            detail  = format('refund_request_id=%s requested_amount=%s current_quote=%s — 신청 이후 추가 이용이 발생했다. 반려 후 재신청을 받을 것.',
                             p_refund_request_id, v_row.amount, v_quote.refund_amount);
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

  -- 환불방법 확정(QA 273·275). 환불 계좌가 채워져 있으면 그 계좌로 송금한
  -- 것이고(가상계좌 결제 건), 아니면 토스 결제취소로 원결제수단을 되돌린 것이다
  -- — api/complete-refund.ts 의 실제 분기와 같은 기준이다.
  v_method := case
    when coalesce(btrim(v_row.refund_bank), '') <> '' then '계좌이체'
    else '카드취소'
  end;

  perform set_config('winning.refund_completing', p_refund_request_id::text, true);

  update public.refund_requests
     set status        = 'completed',
         admin_memo    = coalesce(p_admin_memo, admin_memo),
         -- 이미 값이 있으면 덮지 않는다. 이 RPC 는 status 가 requested/processing
         -- 일 때만 여기까지 오므로 재실행이 정상 경로는 아니지만, 기록은 최초
         -- 완료 시점이 정본이다.
         completed_at  = coalesce(completed_at, now()),
         processed_by  = coalesce(processed_by, auth.uid()),
         refund_method = coalesce(refund_method, v_method)
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
  '환불 완료 단일 정본 RPC. 20260831081100 에서 completed_at · processed_by · refund_method 기록을 더했다(QA 273·275) — 판정·가드(42501/WC026/WC035/WC036/WC037/WC039)와 권한 회수·주문 종결은 baseline 원문 그대로다.';


-- ---------------------------------------------------------------------
-- 환불 처리 대장 뷰 (파일18 「환불 처리 대장」).
--
-- 처리일 · 수강자명 · 프로그램 · 소속코드 · 납부금액 · 환불금액 · 환불방법 ·
-- 처리자 · 사유 · 상태. 완료된 건만 싣는다 — 대장은 "처리한 결과"의 기록이고,
-- 아직 처리 중인 건은 「환불 신청 내역」 화면이 본다.
--
-- security_invoker=on — 조회자 권한으로 refund_requests RLS 를 평가한다
-- (끄면 이 뷰가 RLS 우회 경로가 된다).
-- ---------------------------------------------------------------------
create or replace view public.admin_refund_ledger
with (security_invoker = on)
as
select
  r.id,
  r.completed_at,
  r.order_id,
  coalesce(student.name, payer.name)          as student_name,
  -- 소속코드는 학생 기준이다(단체 할인·정산 귀속이 학생을 따른다).
  coalesce(student.org_code, payer.org_code)  as org_code,
  r.order_name                                as program_name,
  o.amount                                    as paid_amount,
  r.amount                                    as refund_amount,
  r.refund_method,
  handler.name                                as processed_by_name,
  r.reason,
  r.admin_memo,
  r.status
from public.refund_requests r
left join public.orders   o       on o.id = r.order_id
left join public.profiles student on student.id = r.student_profile_id
left join public.profiles payer   on payer.id   = r.user_id
left join public.profiles handler on handler.id = r.processed_by
where r.status = 'completed';

comment on view public.admin_refund_ledger is
  '「환불 처리 대장」 화면의 원천(20260831081100, 파일18 기준). 완료된 환불만 싣는다 — 처리 중인 건은 환불 신청 내역 화면이 본다. security_invoker=on 이라 refund_requests 의 RLS 가 그대로 적용된다.';

grant select on public.admin_refund_ledger to authenticated;


-- ---------------------------------------------------------------------
-- 새 메뉴를 권한 마스터에 등록한다. 매출·결제관리 그룹이라 실무 관리자 묶음에는
-- 항목이 없고(20260823000002 3절이 이 그룹을 제외), 최고 관리자는 판정 함수가
-- 전 메뉴 edit 으로 단락시키므로 별도 시드가 필요 없다.
-- ---------------------------------------------------------------------
insert into public.admin_resources (key, group_title, label, sort_order) values
  ('refundLedger', '매출·결제관리', '환불 처리 대장', 765)
on conflict (key) do update
  set group_title = excluded.group_title,
      label       = excluded.label,
      sort_order  = excluded.sort_order,
      is_active   = true;


-- =====================================================================
-- 확인용 (실행 후 눈으로 볼 것 — 아래는 주석, 자동 실행되지 않는다)
-- =====================================================================
-- 1) 대장이 그려지는지. completed_at 이 빈 행은 이 컬럼 도입 전 처리분이다.
-- select completed_at, student_name, org_code, refund_amount, refund_method,
--        processed_by_name
--   from public.admin_refund_ledger order by completed_at desc nulls last limit 20;
--
-- 2) 이 마이그레이션 이후 완료된 건은 셋이 모두 채워져야 한다.
-- select id, completed_at, processed_by, refund_method
--   from public.refund_requests
--  where status = 'completed' and completed_at is not null;
