-- ---------------------------------------------------------------------
-- 멘토 계정 연결 — 지원서 승인(status='active') 시 만들어지는 멘토 계정을
-- mentor_applications.user_id 로 잇는다.
--
-- 배경
--   Figma 4285:7300 「멘토 전용 페이지」의 진입 플로우 —
--   관리자가 지원서를 승인하면 멘토에게 메일로 임시코드가 가고, 멘토는 그
--   코드로 로그인해 멘토카드를 작성한다.
--
--   profiles.member_type 의 CHECK 에는 'mentor' 가 처음부터 있었고 가입 RPC
--   (complete_signup_profile)도 그 값을 받아들이는데, **넣는 경로가 어디에도
--   없었다** — 가입 폼은 학생/학부모/만14세미만 3종뿐이고 지원서 승인은
--   mentor_applications.status 만 바꿨다. 즉 멘토 계정은 아무도 될 수 없는
--   상태였다. 그 연결을 api/admin/approve-mentor 가 만든다.
--
-- ⚠️ 계정 생성 자체는 마이그레이션이 아니라 서버 라우트가 한다 — auth.users 를
--    만들려면 service_role 이 필요하고, prod 에는 auth→profiles 트리거가 없어서
--    (supabase/README.md) profiles 행도 그 라우트가 직접 넣어야 한다.
-- ---------------------------------------------------------------------

-- 한 계정이 여러 지원서에 붙지 않게 한다. 재지원으로 행이 여러 개 생길 수는
-- 있지만 승인된 건 하나뿐이어야 한다 — 두 행이 같은 계정을 가리키면 "이 멘토의
-- 지원서"가 둘이 되어 멘토카드 초기값을 어느 쪽에서 가져올지가 갈린다.
create unique index if not exists mentor_applications_user_id_key
  on public.mentor_applications (user_id)
  where user_id is not null;

comment on column public.mentor_applications.user_id is
  '승인 시 만들어진(또는 이어붙인) 멘토 계정. api/admin/approve-mentor 가 채운다. 비어 있으면 아직 승인 전이다 — 지원 접수는 비회원으로 받으므로 api/mentor-apply 는 이 값을 채우지 않는다.';

-- 멘토 본인이 자기 지원서를 읽을 수 있어야 한다. 멘토카드 작성 화면이 이름·
-- 대학교·학과의 초기값을 지원서에서 가져오는데(Figma 4296:7876), 지금 정책이
-- is_winning_admin() 하나뿐이라 멘토는 자기 이름조차 못 읽는다.
--
-- ⚠️ 관리자 정책(ALL)은 그대로 둔다 — 두 정책은 OR 로 합쳐지므로 이걸 더해도
--    관리자 권한이 좁아지지 않는다.
drop policy if exists "mentor self read" on public.mentor_applications;
create policy "mentor self read"
  on public.mentor_applications
  for select
  using (user_id = auth.uid());


-- =====================================================================
-- 확인용 (실행 후 눈으로 볼 것 — 아래는 주석, 자동 실행되지 않는다)
-- =====================================================================
-- 1) 정책이 둘인지 (admin all + mentor self read).
-- select policyname, cmd from pg_policies where tablename = 'mentor_applications';
--
-- 2) 승인된 멘토 목록.
-- select a.name, a.email, a.status, p.member_type
--   from public.mentor_applications a
--   join public.profiles p on p.id = a.user_id
--  where a.user_id is not null;
