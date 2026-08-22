-- 42P17 수정 — admin_members 읽기 정책의 무한 재귀
--
-- 증상
--   관리자 관리·권한 관리 화면 진입 시:
--     infinite recursion detected in policy for relation "admin_members"
--
-- 원인
--   20260822000003 이 권한 테이블 5개에 같은 모양의 읽기 정책을 루프로 찍었다:
--     using (exists (select 1 from public.admin_members m
--                     where m.profile_id = auth.uid() and m.status = 'active'))
--   다른 4개(admin_resources/roles/role_permissions/member_permissions)에서는
--   문제가 없다 — 정책이 걸린 테이블과 조회하는 테이블이 다르기 때문이다.
--   그런데 **admin_members 자신**에 걸리면, 정책을 평가하려고 admin_members 를
--   읽고 → 그 읽기가 다시 같은 정책을 평가하고 → 무한 재귀가 된다.
--
--   쓰기 정책(_super_all)은 fn_is_super_admin() 을 쓰는데 그건 SECURITY DEFINER
--   라 소유자(postgres) 권한으로 돌고, 소유자는 RLS 를 우회하므로 재귀하지
--   않는다. 읽기 정책만 술어를 인라인으로 적어서 이 차이가 생겼다.
--
-- 왜 로컬 검증에서 안 걸렸나
--   적용 직후 검증은 psql 의 postgres(슈퍼유저)로 돌렸고, 그 경로는 RLS 자체를
--   건너뛴다. authenticated 롤로 돌린 검증은 profiles·orders·program_access·
--   parent_child_links 만 확인했고 admin_members 를 직접 조회하지 않았다.
--   → 권한 테이블은 반드시 authenticated 롤로 "직접 select" 해봐야 한다.
--
-- 조치
--   fn_is_super_admin() 과 같은 방식의 SECURITY DEFINER 헬퍼를 하나 더 두고,
--   읽기 정책 5개를 전부 그 함수로 바꾼다. 술어의 의미는 그대로다
--   ("활성 관리자면 권한 정보를 읽을 수 있다").

-- ---------------------------------------------------------------------
-- 1) fn_is_active_admin : 활성 관리자 여부
--
--    SECURITY DEFINER 라 소유자(postgres) 권한으로 admin_members 를 읽고,
--    소유자는 RLS 를 우회한다(FORCE ROW LEVEL SECURITY 를 걸지 않았다).
--    그래서 이 함수를 정책 술어로 쓰면 재귀가 끊긴다.
-- ---------------------------------------------------------------------
create or replace function public.fn_is_active_admin(
  p_profile_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.admin_members m
     where m.profile_id = p_profile_id
       and m.status = 'active'
  );
$$;

comment on function public.fn_is_active_admin(uuid) is
  '활성 관리자 여부(20260822000006). 권한 테이블의 읽기 정책 술어 전용이다 — 인라인 EXISTS 로 쓰면 admin_members 자신의 정책에서 42P17(무한 재귀)이 난다. SECURITY DEFINER 로 소유자 권한으로 돌아 RLS 를 우회하는 것이 재귀를 끊는 지점이다(fn_is_super_admin 과 같은 구조).';

revoke all on function public.fn_is_active_admin(uuid) from public, anon;
grant execute on function public.fn_is_active_admin(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2) 읽기 정책 5개 교체
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'admin_resources', 'admin_roles', 'admin_role_permissions',
    'admin_members', 'admin_member_permissions'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format($f$
      create policy %I on public.%I as permissive for select to authenticated
      using (public.fn_is_active_admin())
    $f$, t || '_read', t);
  end loop;
end $$;

-- =====================================================================
-- 확인용 (실행 후 눈으로 볼 것 — 아래는 주석, 자동 실행되지 않는다)
-- =====================================================================
-- ⚠️ 반드시 authenticated 롤로 확인할 것. postgres 로 조회하면 RLS 를 건너뛰어
--    재귀가 재발해도 통과한 것처럼 보인다.
--
-- begin;
--   select set_config('request.jwt.claims',
--     json_build_object('sub','<어드민 profile_id>','role','authenticated')::text, true);
--   set local role authenticated;
--   select count(*) from public.admin_members;            -- 42P17 없이 나와야 한다
--   select count(*) from public.admin_member_directory;   -- 뷰(security_invoker)도 함께
--   select count(*) from public.admin_roles;
-- rollback;
-- =====================================================================
