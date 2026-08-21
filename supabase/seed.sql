-- =====================================================================
-- supabase/seed.sql — 로컬 Docker 스택 전용 시드 (supabase db reset 시 자동 실행)
--
-- 여기는 "구성물"만 담는다: QA 계정 3종 + 학부모-학생 연결 + 약관 동의.
-- 콘텐츠·카탈로그 데이터는 커밋하지 않고 그때그때 dev에서 추출한다:
--   node scripts/seed-from-dev.mjs   (.env.local의 dev service key 사용)
--
-- ⚠️ 비밀번호는 전부 로컬 스택 전용 값이다. 실제 dev/prod 계정 비밀번호를
--    이 파일에 절대 넣지 말 것 (git에 평문으로 남는다).
-- =====================================================================

-- ---------------------------------------------------------------------
-- auth.users 트리거 2종 — dev·로컬 전용 (⚠️ prod 적용 금지, 사용자 확정 2026-08-21)
-- prod는 profiles 자동 생성·가입 쿠폰 자동 발급이 없어야 한다.
-- 그래서 마이그레이션이 아닌 seed.sql(로컬에서만 실행)에서 만든다.
-- dev에는 이미 동일 트리거가 존재한다(의도적 드리프트).
-- ---------------------------------------------------------------------

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

drop trigger if exists on_auth_user_created_coupon_grant on auth.users;
create trigger on_auth_user_created_coupon_grant
  after insert on auth.users
  for each row execute function public.fn_grant_signup_coupons();

-- ---------------------------------------------------------------------
-- QA 계정 3종 (auth.users + auth.identities)
--   어드민:  devadmin@gmail.com      / LocalAdmin2026!   (로컬 전용 비밀번호)
--   학생:    qa-student@winning.test / WinningQA2026!
--   학부모:  qa-parent@winning.test  / WinningQA2026!
-- 고정 UUID — 테스트 코드에서 참조 가능.
-- auth.users insert 시 on_auth_user_created 트리거가 profiles를 자동 생성한다.
-- ---------------------------------------------------------------------

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated',
    'devadmin@gmail.com',
    extensions.crypt('LocalAdmin2026!', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"로컬어드민"}'::jsonb,
    now(), now(), '', '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated',
    'qa-student@winning.test',
    extensions.crypt('WinningQA2026!', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"큐에이학생"}'::jsonb,
    now(), now(), '', '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000003',
    'authenticated', 'authenticated',
    'qa-parent@winning.test',
    extensions.crypt('WinningQA2026!', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"큐에이학부모"}'::jsonb,
    now(), now(), '', '', '', '', ''
  )
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
)
values
  (
    gen_random_uuid(), '00000000-0000-4000-8000-000000000001',
    '{"sub":"00000000-0000-4000-8000-000000000001","email":"devadmin@gmail.com","email_verified":true}'::jsonb,
    'email', '00000000-0000-4000-8000-000000000001', now(), now(), now()
  ),
  (
    gen_random_uuid(), '00000000-0000-4000-8000-000000000002',
    '{"sub":"00000000-0000-4000-8000-000000000002","email":"qa-student@winning.test","email_verified":true}'::jsonb,
    'email', '00000000-0000-4000-8000-000000000002', now(), now(), now()
  ),
  (
    gen_random_uuid(), '00000000-0000-4000-8000-000000000003',
    '{"sub":"00000000-0000-4000-8000-000000000003","email":"qa-parent@winning.test","email_verified":true}'::jsonb,
    'email', '00000000-0000-4000-8000-000000000003', now(), now(), now()
  )
on conflict (provider_id, provider) do nothing;

-- ---------------------------------------------------------------------
-- profiles 보강 — 트리거가 만든 행에 역할·회원유형·동의 플래그를 채운다
-- ---------------------------------------------------------------------

update public.profiles set
  role = 'admin',
  name = '로컬어드민',
  username = 'devadmin',
  terms_service_agreed = true, privacy_required_agreed = true
where id = '00000000-0000-4000-8000-000000000001';

update public.profiles set
  member_type = 'student',
  name = '큐에이학생',
  username = 'qa-student',
  school_type = 'high', school_name = '위닝고등학교',
  terms_service_agreed = true, privacy_required_agreed = true
where id = '00000000-0000-4000-8000-000000000002';

update public.profiles set
  member_type = 'parent',
  name = '큐에이학부모',
  username = 'qa-parent',
  terms_service_agreed = true, privacy_required_agreed = true
where id = '00000000-0000-4000-8000-000000000003';

-- ---------------------------------------------------------------------
-- 학부모-학생 연결 (승인 상태)
-- ---------------------------------------------------------------------

insert into public.parent_child_links (parent_id, student_id, status, responded_at)
values (
  '00000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000002',
  'approved',
  now()
)
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 약관 동의 이력 — terms 데이터가 있을 때만 (seed-from-dev 이후 재실행 대비).
-- terms가 비어 있으면 0행 insert로 조용히 지나간다.
-- ---------------------------------------------------------------------

insert into public.user_term_agreements (user_id, term_id, agreed)
select u.id, t.id, true
from (values
  ('00000000-0000-4000-8000-000000000001'::uuid),
  ('00000000-0000-4000-8000-000000000002'::uuid),
  ('00000000-0000-4000-8000-000000000003'::uuid)
) as u(id)
cross join public.terms t
where t.is_required
on conflict do nothing;
