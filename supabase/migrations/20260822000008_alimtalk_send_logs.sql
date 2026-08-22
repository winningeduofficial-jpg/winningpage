-- 알림톡·문자 발송 로그
--
-- 왜 필요한가
--   지금까지 발송 이력이 어디에도 남지 않았다 — api/_lib/aligo.ts 는 인증번호를
--   보내고 결과를 함수 반환값으로만 돌려준다. 그래서
--     · "이 회원에게 리포트가 실제로 갔는가"를 확인할 방법이 없고
--     · 회원 상세의 「알림톡·문자」 탭(참조 HTML 의 msg 패널)을 그릴 수 없으며
--     · 크론이 매일 도는데 실패가 조용히 묻힌다.
--   템플릿 4종 + 스케줄러가 붙으면 이게 곧바로 문제가 되므로 함께 만든다.
--
-- 무엇을 남기는가 — 본문까지 남긴다
--   "언제 무엇을 보냈는가"를 재구성하려면 완성 본문이 필요하다. 템플릿과 변수만
--   남기면 템플릿을 나중에 고쳤을 때 과거 발송을 복원할 수 없다(주문의
--   product_slug 스냅샷과 같은 원칙).
--
-- ⚠️ 인증번호는 여기 남기지 않는다
--   본문에 인증번호가 그대로 들어가므로 로그가 곧 인증 우회 수단이 된다.
--   sendVerificationCode 경로는 지금처럼 로그를 남기지 않는다(api/_lib/aligo.ts).

create table if not exists public.alimtalk_send_logs (
  id             bigint generated always as identity primary key,
  -- alimtalkTemplates.ts 의 키(signupCoupon / dailyReport / weeklyReport / monthlyReport).
  -- FK 로 묶을 대상 테이블이 없다 — 템플릿 정본은 코드이고 알리고 승인 문안이다.
  template_key   text not null,
  -- alimtalk | sms | dry-run. 알림톡이 failover 로 SMS 가 되면 알리고 응답으로는
  -- 구분되지 않아 요청 채널을 그대로 적는다.
  channel        text not null,
  profile_id     uuid references public.profiles (id) on delete set null,
  -- 수신번호는 원문으로 남긴다 — 재발송·대사에 필요하다. 화면에서는 마스킹한다.
  phone          text not null,
  subject        text,
  message        text not null,
  status         text not null,
  provider_code    text,
  provider_message text,
  provider_msg_id  text,
  -- 발송 근거(어느 기간 리포트인지 등). 실패 재현에 필요하다.
  meta           jsonb not null default '{}'::jsonb,
  sent_at        timestamptz not null default now(),
  constraint alimtalk_send_logs_status_check check (status in ('sent', 'failed'))
);

create index if not exists alimtalk_send_logs_profile_idx
  on public.alimtalk_send_logs (profile_id, sent_at desc);
create index if not exists alimtalk_send_logs_template_idx
  on public.alimtalk_send_logs (template_key, sent_at desc);

-- 같은 사람에게 같은 템플릿을 같은 근거로 두 번 보내지 않기 위한 열쇠.
-- 크론이 재시도되거나 두 번 뜨는 상황에서 중복 발송을 막는다 — 발송 코드가
-- 이 키로 먼저 조회한다(dedupe_key 가 null 이면 중복 검사를 하지 않는다).
alter table public.alimtalk_send_logs
  add column if not exists dedupe_key text;
create unique index if not exists alimtalk_send_logs_dedupe_idx
  on public.alimtalk_send_logs (dedupe_key) where dedupe_key is not null;

comment on table public.alimtalk_send_logs is
  '알림톡·문자 발송 이력(20260822000008). 회원 상세 「알림톡·문자」 탭과 크론 실패 추적의 근거다. 인증번호 발송은 본문에 코드가 그대로 들어가 로그가 인증 우회 수단이 되므로 여기 남기지 않는다.';
comment on column public.alimtalk_send_logs.dedupe_key is
  '중복 발송 방지 키(예: dailyReport:<profile_id>:2026-08-22). 부분 유니크 인덱스가 걸려 있어 두 번째 insert 가 23505 로 튕긴다 — 크론 재시도·중복 기동에서 같은 알림이 두 번 나가지 않게 한다.';

-- ---------------------------------------------------------------------
-- RLS — 어드민 조회만. 쓰기는 service_role(api/) 전용이라 정책을 두지 않는다.
--
-- 본인 조회를 열지 않는 이유: 이 표는 "우리가 보낸 것"의 운영 기록이고,
-- 사용자에게 보여줄 화면이 없다. 필요해지면 그때 본인 조회 정책을 더한다.
-- ---------------------------------------------------------------------
alter table public.alimtalk_send_logs enable row level security;

drop policy if exists "alimtalk_send_logs admin select" on public.alimtalk_send_logs;
create policy "alimtalk_send_logs admin select" on public.alimtalk_send_logs
  as permissive for select to authenticated
  using (public.fn_admin_can('members', 'view'));
