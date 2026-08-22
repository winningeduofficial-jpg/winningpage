-- admin_members ↔ profiles.role 동기화
--
-- 왜 필요한가 — 판정 축이 둘로 갈려 있다
--   새 권한 체계(20260822000003)는 admin_members 를 본다. 그런데 이 저장소의
--   RLS 정책 대부분은 여전히 is_admin()(= profiles.role = 'admin')을 술어로 쓴다
--   (baseline 에서 profiles_admin_select_all / orders select own 등 수백 곳).
--   두 축이 어긋나면 이런 일이 생긴다:
--
--     · 초대받아 활성화된 관리자   → admin_members 는 active 인데 role 은 'user'
--                                    라서 profiles·orders 를 하나도 못 읽는다.
--                                    화면은 열리는데 표가 전부 비어 보인다.
--     · 정지(suspended)시킨 관리자 → 메뉴는 사라지지만(최종 권한 0행) role 이
--                                    'admin' 인 채라 REST 로는 계속 읽힌다.
--                                    "정지시켰는데 데이터는 그대로 보이는" 구멍.
--
--   그래서 admin_members 를 정본으로 두고 profiles.role 을 그 그림자로 만든다.
--   활성이면 'admin', 아니면 'user'. 두 축을 하나로 묶는 가장 작은 조치다.
--
--   ⚠️ 이건 임시 다리다. 최종 형태는 RLS 술어를 fn_admin_can 으로 옮기는
--   것이고(그래야 메뉴별 차등이 데이터 층까지 간다), 그건 어드민 쓰기 경로를
--   api/ 라우트로 옮기는 작업과 함께 해야 한다. 그때까지 두 축이 어긋나지
--   않게 붙들어 두는 역할이다.
--
-- 왜 트리거인가
--   화면·라우트에서 profiles.role 을 같이 갱신하게 하면 갱신 지점이 늘어날수록
--   빠뜨리는 곳이 생긴다(초대 라우트·직원 상세 저장·권한 화면·SQL 수기 조작).
--   테이블 하나에 트리거를 걸면 어느 경로로 바뀌든 항상 따라온다.
--
--   sql/46 이 profiles.role 자가 상승을 RLS 로 막아뒀는데, 이 함수는
--   SECURITY DEFINER 라 소유자 권한으로 돌아 그 정책에 걸리지 않는다.
--   일반 사용자가 이 경로로 스스로 admin 이 될 수는 없다 — admin_members 에
--   행을 넣는 것 자체가 최고 관리자 전용(admin_members_super_all)이기 때문이다.

create or replace function public.fn_sync_admin_member_role()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile_id uuid;
  v_active     boolean;
begin
  v_profile_id := coalesce(new.profile_id, old.profile_id);

  select exists (
    select 1 from public.admin_members m
     where m.profile_id = v_profile_id
       and m.status = 'active'
  ) into v_active;

  update public.profiles
     set role = case when v_active then 'admin' else 'user' end
   where id = v_profile_id
     and role is distinct from (case when v_active then 'admin' else 'user' end);

  return coalesce(new, old);
end;
$$;

comment on function public.fn_sync_admin_member_role() is
  'admin_members.status → profiles.role 동기화(20260822000007). 활성이면 admin, 아니면 user. 판정 축이 admin_members(신규)와 is_admin()(기존 RLS 수백 곳)으로 갈려 있어 어긋나면 "화면은 열리는데 표가 비거나" "정지시켰는데 REST 로는 읽히는" 상태가 된다. RLS 술어를 fn_admin_can 으로 옮기기 전까지의 다리다.';

drop trigger if exists admin_members_sync_role on public.admin_members;
create trigger admin_members_sync_role
  after insert or update or delete on public.admin_members
  for each row execute function public.fn_sync_admin_member_role();

-- 기존 행 정합 — 20260822000003 9-c)절이 만든 행들과 seed.sql 이 만든 행은
-- 트리거가 생기기 전에 들어왔다. 한 번 맞춰준다.
update public.profiles p
   set role = 'admin'
  from public.admin_members m
 where m.profile_id = p.id
   and m.status = 'active'
   and p.role is distinct from 'admin';

-- =====================================================================
-- 확인용 (실행 후 눈으로 볼 것 — 아래는 주석, 자동 실행되지 않는다)
-- =====================================================================
-- begin;
--   -- 정지시키면 role 이 user 로 내려가야 한다.
--   update public.admin_members set status='suspended' where profile_id='<어드민 id>';
--   select role from public.profiles where id='<어드민 id>';   -- user 기대
--   -- 되살리면 admin 으로 올라와야 한다.
--   update public.admin_members set status='active' where profile_id='<어드민 id>';
--   select role from public.profiles where id='<어드민 id>';   -- admin 기대
-- rollback;
-- =====================================================================
