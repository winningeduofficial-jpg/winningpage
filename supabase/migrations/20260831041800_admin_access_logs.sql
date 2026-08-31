-- =====================================================================
-- 개인정보 다운로드·마스킹 해제 게이트의 로그 원장 (QA 268·270·228·223·271·269).
--
-- 요구는 여섯 행이 사실상 하나다: 개인정보가 나가는 동작(엑셀 다운로드,
-- 마스킹 해제) 앞에 **관리자 비밀번호 재확인 + 사유 필수 기재**를 세우고 그
-- 사실을 남긴다. 화면 쪽 공용 게이트가 이 표에 한 줄을 넣은 뒤에야 실제 동작이
-- 진행된다.
--
-- 설계 메모
--   - actor_email 을 따로 박는다(비정규화). profile_id 하나만 두면 그 계정이
--     지워질 때 "누가 내려받았나"가 통째로 사라진다 — 감사 기록은 대상이
--     사라져도 남아야 한다. 그래서 FK 는 on delete set null 이고 이메일 스냅샷이
--     정본 노릇을 한다.
--   - reason 은 not null + 공백만 금지. "사유 필수 기재"가 요구의 핵심이라
--     빈 문자열이 통과하면 요구가 무력화된다.
--   - update / delete 정책을 **일부러 만들지 않는다**. RLS 는 기본 거부라
--     정책이 없으면 아무도 고치거나 지울 수 없다 — 사후 조작이 불가능해야
--     로그가 증거가 된다.
-- =====================================================================

create table if not exists public.admin_access_logs (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid references public.profiles (id) on delete set null,
  actor_email  text not null,
  action       text not null,
  resource_key text not null,
  reason       text not null,
  row_count    int,
  target_id    uuid,
  created_at   timestamptz not null default now(),
  constraint admin_access_logs_action_check
    check (action in ('download', 'unmask')),
  constraint admin_access_logs_reason_not_blank
    check (btrim(reason) <> '')
);

comment on table public.admin_access_logs is
  '개인정보 반출 원장(20260831041800). 엑셀 다운로드·마스킹 해제 직전에 화면 게이트가 한 줄씩 넣는다. update/delete 정책이 없어 적재 후에는 누구도 고칠 수 없다.';
comment on column public.admin_access_logs.actor_email is
  '실행 시점의 계정 이메일 스냅샷. profile 이 지워져도 남아야 하므로 profile_id 와 별도로 박는다.';
comment on column public.admin_access_logs.resource_key is
  'ADMIN_SECTION_KEYS 와 같은 메뉴 키(members, mentorApplications, premiumConsults, revenue ...).';
comment on column public.admin_access_logs.row_count is
  '다운로드에 실제로 포함된 행 수. 마스킹 해제(unmask)에서는 null.';
comment on column public.admin_access_logs.target_id is
  '마스킹 해제 대상 회원의 profile id. 다운로드에서는 null.';

create index if not exists admin_access_logs_created_idx
  on public.admin_access_logs (created_at desc);
create index if not exists admin_access_logs_profile_idx
  on public.admin_access_logs (profile_id, created_at desc);

alter table public.admin_access_logs enable row level security;

-- 쓰기: 어드민이 **자기 이름으로만** 남길 수 있다. profile_id 를 남의 것으로
-- 적어 넣는 위장 적재를 with check 가 막는다.
drop policy if exists "admin access log self insert" on public.admin_access_logs;
create policy "admin access log self insert"
  on public.admin_access_logs for insert to authenticated
  with check (profile_id = auth.uid() and public.is_winning_admin());

-- 읽기: 최고 관리자만. 이 원장 자체가 "누가 개인정보를 봤나"라 실무 관리자에게
-- 열면 감시 대상이 감시 기록을 보는 셈이 된다.
drop policy if exists "admin access log super read" on public.admin_access_logs;
create policy "admin access log super read"
  on public.admin_access_logs for select to authenticated
  using (public.fn_is_super_admin());

grant select, insert on public.admin_access_logs to authenticated;


-- 열람 화면용 평면 뷰. 목록에 계정 이름을 같이 띄우기 위한 조인이고,
-- security_invoker=on 이라 위 select 정책(최고 관리자만)이 그대로 적용된다
-- (끄면 이 뷰가 RLS 우회 경로가 된다 — admin_member_directory 와 같은 이유).
create or replace view public.admin_access_log_entries
with (security_invoker = on)
as
select
  l.id,
  l.created_at,
  l.action,
  l.resource_key,
  l.reason,
  l.row_count,
  l.target_id,
  l.actor_email,
  coalesce(p.name, '(탈퇴 계정)') as actor_name
from public.admin_access_logs l
left join public.profiles p on p.id = l.profile_id;

comment on view public.admin_access_log_entries is
  '개인정보 접근 로그 열람 화면용 평면 뷰(20260831041800). security_invoker=on — 조회자 권한으로 admin_access_logs RLS 를 평가한다.';

grant select on public.admin_access_log_entries to authenticated;


-- 열람 메뉴를 권한 마스터에 추가한다. 직원관리 그룹이라 실무 관리자 묶음에는
-- 항목이 없고(20260823000002 3절이 이 그룹을 제외), 최고 관리자는 판정 함수가
-- 전 메뉴 edit 으로 단락시키므로 별도 시드가 필요 없다.
insert into public.admin_resources (key, group_title, label, sort_order) values
  ('adminAccessLogs', '직원관리', '개인정보 접근 로그', 830)
on conflict (key) do update
  set group_title = excluded.group_title,
      label       = excluded.label,
      sort_order  = excluded.sort_order,
      is_active   = true;


-- =====================================================================
-- 확인용 (실행 후 눈으로 볼 것 — 아래는 주석, 자동 실행되지 않는다)
-- =====================================================================
-- 1) 직원관리 3행이 됐는지.
-- select group_title, label, sort_order from public.admin_resources
--  where group_title = '직원관리' order by sort_order;
--
-- 2) 적재 확인.
-- select created_at, actor_name, action, resource_key, row_count, reason
--   from public.admin_access_log_entries order by created_at desc limit 20;
