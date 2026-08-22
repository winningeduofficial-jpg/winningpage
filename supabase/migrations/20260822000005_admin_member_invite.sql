-- 관리자 초대 — 활성화 RPC + 조회 편의 뷰
--
-- 초대 자체(auth 사용자 생성 + 메일 발송)는 api/admin/invite-member.ts 가 한다.
-- Supabase Auth 의 초대는 service_role 로만 호출할 수 있어 브라우저에서 못 한다.
-- 이 파일은 그 라우트가 만들 수 없는 두 가지, 즉 **초대받은 본인이 스스로
-- 활성화하는 경로**와 **직원 목록을 한 번에 읽는 뷰**를 담당한다.
--
-- 왜 auth.users 트리거를 쓰지 않는가
--   "초대 링크를 눌러 비밀번호를 설정하면 활성화"를 트리거로 잡으면 auth 스키마에
--   트리거를 하나 더 붙여야 한다. 그런데 이 저장소는 auth.users 트리거 2종을
--   **prod 에 적용하지 않는 의도적 드리프트**로 관리하고 있고(supabase/README.md),
--   그 규칙을 깨면 prod 와 dev 의 auth 동작이 또 갈린다. 대신 초대받은 사람이
--   어드민 화면에 처음 들어올 때 이 RPC 를 스스로 호출하게 한다 —
--   세션이 있다는 것 자체가 초대 링크를 통과했다는 뜻이라 안전하다.

-- ---------------------------------------------------------------------
-- 1) fn_activate_admin_member : 초대받은 본인이 자기 행만 활성화
--
--    승격이 아니다 — 이미 최고 관리자가 만들어 둔 invited 행을 active 로 바꿀
--    뿐이고, role_id 는 건드리지 않는다. 즉 이 함수로는 없던 권한이 생기지
--    않는다(권한을 정하는 건 초대한 사람이다).
-- ---------------------------------------------------------------------
create or replace function public.fn_activate_admin_member()
returns public.admin_members
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.admin_members;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  update public.admin_members
     set status       = 'active',
         activated_at = coalesce(activated_at, now()),
         updated_at   = now()
   where profile_id = auth.uid()
     and status = 'invited'
  returning * into v_row;

  -- 이미 활성이거나 정지 상태면 그대로 돌려준다(재호출이 상태를 되돌리지 않는다).
  if not found then
    select * into v_row from public.admin_members where profile_id = auth.uid();
  end if;

  return v_row;
end;
$$;

comment on function public.fn_activate_admin_member() is
  '초대받은 관리자가 첫 진입 시 자기 행을 invited → active 로 바꾼다(20260822000005). 정지(suspended)는 되살리지 않고, role_id 도 바꾸지 않는다 — 권한은 초대한 최고 관리자가 정한다.';

revoke all on function public.fn_activate_admin_member() from public, anon;
grant execute on function public.fn_activate_admin_member() to authenticated;


-- ---------------------------------------------------------------------
-- 2) admin_member_directory : 직원 목록 뷰
--
--    직원 관리 화면은 admin_members + profiles + admin_roles 를 함께 봐야 한다
--    (와이어프레임 목록: 직원명·부서·이메일·전화번호·가입일). supabase-js 로
--    조인하려면 FK 임베딩 문법에 의존해야 하는데, admin_members.profile_id 와
--    invited_by 가 둘 다 profiles 를 참조해서 임베딩이 모호해진다. 뷰로 미리
--    펴 둔다.
--
--    security_invoker = on 이 핵심이다 — 뷰를 만든 사람(postgres)이 아니라
--    조회하는 사람의 권한으로 밑단 테이블 RLS 를 평가한다. 이게 없으면 이
--    뷰가 admin_members 의 RLS 를 통째로 우회하는 구멍이 된다.
-- ---------------------------------------------------------------------
create or replace view public.admin_member_directory
with (security_invoker = on)
as
select
  m.profile_id,
  m.role_id,
  m.department,
  m.status,
  m.invited_at,
  m.activated_at,
  m.invited_by,
  r.name        as role_name,
  r.is_super    as role_is_super,
  p.name        as member_name,
  p.email       as member_email,
  p.phone       as member_phone,
  p.created_at  as joined_at
from public.admin_members m
left join public.admin_roles r on r.id = m.role_id
left join public.profiles   p on p.id = m.profile_id;

comment on view public.admin_member_directory is
  '직원 관리 화면용 평면 뷰(20260822000005). security_invoker=on — 조회자 권한으로 admin_members RLS 를 평가한다(끄면 이 뷰가 RLS 우회 경로가 된다).';

grant select on public.admin_member_directory to authenticated;
