-- =====================================================================
-- profiles.role 권한상승(privilege escalation) 취약점 긴급 패치 — INSERT 경로.
-- Supabase SQL Editor에서 수동 실행 필요 (이 repo에 마이그레이션 러너
-- 없음 — 00~56번과 동일하게 SQL Editor에 파일 전체를 붙여넣고 실행한다).
-- idempotent — 여러 번 실행해도 안전.
--
-- ---------------------------------------------------------------------
-- 취약점 (2026-08-11 dev DB 실측 확인)
-- ---------------------------------------------------------------------
-- 46_profiles_role_hardening.sql이 "profiles_update_own"의 WITH CHECK에
-- role 고정 조건을 추가해 UPDATE 경로의 셀프 승격은 막았다. 그런데 같은
-- 방어가 INSERT 경로에는 없었다 — 그리고 그 경로가 실제로 열려 있었다.
--
--   1) auth.users에 비내부(non-internal) 트리거가 0개였다 — 신규 가입자에게
--      profiles 행이 자동으로 생기지 않는다(00_base_schema.sql:1555-1556이
--      on_auth_user_created 트리거를 정의하지만, dev pg_trigger 실측상
--      auth.users에 붙어 있지 않았다. 아래 3)절 참고).
--   2) 그 결과 profiles 행이 아예 없는 로그인 계정이 실재했다(dev 2건,
--      아래 4)절 백필 대상).
--   3) authenticated 롤에 profiles.role INSERT 권한이 있다(Supabase가
--      public 스키마 테이블에 기본 부여).
--   4) "profiles_insert_own" 정책(00_base_schema.sql):
--        with check ((auth.uid() = id) OR is_admin())
--      role 컬럼을 전혀 제약하지 않는다.
--   5) "profiles_role_check" = CHECK (role = ANY(ARRAY['user','admin']))는
--      'admin'을 막지 않는다 — 그 값 자체가 허용값이다.
--   6) is_admin()은 profiles.role을 그대로 신뢰한다(00_base_schema.sql).
--
-- 즉 profiles 행이 없는 로그인 사용자가
--   insert into profiles (id, role) values (auth.uid(), 'admin')
-- 를 직접 실행하면 그 자리에서 관리자가 됐다. 이후 "profiles_admin_*"
-- 정책 3종(select/update/delete all)이 전부 열려 전 회원 정보 조회·수정·
-- 삭제가 가능해진다.
--
-- anon도 role 컬럼 INSERT 권한은 있으나 RLS가 auth.uid() = id를 요구하므로
-- 비로그인은 차단된다(46번 전제와 동일).
--
-- ---------------------------------------------------------------------
-- 조치 개요 — 4가지
-- ---------------------------------------------------------------------
--   1) profiles.role을 NOT NULL DEFAULT 'user'로.
--   2) "profiles_insert_own" WITH CHECK에 role 고정 조건 추가(46번과 동일한
--      패턴 — 본인 행 경로만 좁히고, 어드민 경로("OR is_admin()")는 그대로
--      둔다. "profiles_admin_insert_all"(with check is_admin())도 무변경).
--   3) on_auth_user_created 트리거 복원 — 조사 결과는 아래 3)절 헤더에
--      전부 남긴다.
--   4) 누락된 profiles 행을 handle_new_user()와 같은 방식으로 백필.
--
-- 범위에서 제외: member_type 관련 UPDATE 경로 하드닝은 별도 작업(가입 시
-- 학생/학부모 선택 정상 흐름을 막을 수 있어 이 파일에서 다루지 않는다).
-- =====================================================================


-- =====================================================================
-- 1) profiles.role : NOT NULL DEFAULT 'user'
--
-- 지금은 role이 nullable이라(00_base_schema.sql:791) INSERT 경로 하드닝
-- (2절)에서 "role = 'user'"만 검사하면 role을 생략한 정상 가입까지 막힌다
-- (NULL = 'user'는 NULL이라 WITH CHECK가 거부한다). NOT NULL DEFAULT를
-- 걸어 생략 시 항상 'user'가 채워지게 하면 2절의 조건을 "role = 'user'"
-- 하나로 단순하게 쓸 수 있다.
--
-- 백필은 방어적으로만 둔다 — 적용 전 dev 실측상 NULL 행 0건
-- (select count(*) from public.profiles where role is null).
-- =====================================================================

update public.profiles
set role = 'user'
where role is null;

alter table public.profiles alter column role set default 'user';
alter table public.profiles alter column role set not null;


-- =====================================================================
-- 2) profiles_insert_own 재정의 — WITH CHECK에 role 고정 조건 추가
--
-- 46_profiles_role_hardening.sql이 profiles_update_own에 쓴 것과 같은
-- 원칙이다: "내 행인가"만이 아니라 "role이 고정값인가"까지 검사한다.
-- UPDATE 쪽은 "기존 값과 동일해야 한다"였지만, INSERT는 애초에 기존 값이
-- 없으므로 고정값은 리터럴 'user' 하나뿐이다 — 자기 자신을 admin으로
-- 만드는 첫 행을 절대 만들 수 없다.
--
-- 어드민이 임의 role로 행을 만드는 경로는 건드리지 않는다:
--   · 이 정책의 "OR is_admin()" 분기는 그대로 둔다(제거하지 않는다).
--   · "profiles_admin_insert_all"(with check is_admin())도 이 파일이
--     drop/재생성하지 않는다.
-- =====================================================================

drop policy if exists "profiles_insert_own" on public."profiles";
create policy "profiles_insert_own" on public."profiles" as PERMISSIVE for insert to authenticated
  with check (
    (auth.uid() = id and role = 'user')
    or is_admin()
  );


-- =====================================================================
-- 3) on_auth_user_created 트리거 복원
--
-- 조사 결과 (팀리드 지시 a~e, 2026-08-11 dev 실측)
-- ---------------------------------------------------------------------
-- a) handle_new_user()의 dev 실제 본문을 pg_proc.prosrc(pg_get_functiondef)
--    로 직접 읽었다 — 00_base_schema.sql:1243-1270에 박제된 정의와
--    글자 하나까지 동일했다(재확인 필요 없이 파일 정의를 신뢰해도 된다는
--    뜻). 본문:
--      insert into public.profiles (id, email, role, updated_at)
--      values (new.id, coalesce(new.email, ''), 'user', now())
--      on conflict (id) do update
--      set email = coalesce(nullif(excluded.email, ''), public.profiles.email),
--          role  = coalesce(public.profiles.role, 'user'),
--          updated_at = now();
--
-- b) 참조 컬럼(id/email/role/updated_at) 전부 현재 profiles 스키마에
--    실재한다(information_schema.columns 실측). 스키마 드리프트 없음 —
--    안전하게 붙일 수 있다.
--
-- c) SECURITY DEFINER, SET search_path TO 'public' 고정. Supabase 공식
--    가이드가 제시하는 정석 패턴과 동일하다. search_path 미고정으로 인한
--    함수 하이재킹 위험 없음.
--
-- d) 왜 없었는가 — 의도적 제거의 흔적을 못 찾았다.
--    · git 히스토리 전체에서 "on_auth_user_created" 문자열이 추가/삭제된
--      커밋은 최초 도입 커밋(d5e1104, 운영 스키마 스냅샷 이관) 단 하나뿐
--      이다. 이후 어떤 커밋도 이 트리거를 별도로 drop하지 않았다.
--    · sql/ 전체에서 이 이름이 등장하는 곳은 00_base_schema.sql의
--      "drop trigger if exists ... ; create trigger ..." 표준 멱등
--      쌍(재실행 가드이지 제거가 아니다) 하나뿐이다.
--    · 오히려 반대 방향 증거만 나온다 — 40_auth_signup.sql이 이 트리거의
--      "존재"를 전제로 설계된 주석을 여러 곳에 남겼다:
--        - "가입 완료 판정은 member_type이 채워졌는지로 한다. profiles
--          행 자체는 handle_new_user 트리거가 auth.signUp 시점에 미리
--          만들어버리므로 행의 존재만으로는 완료 여부를 알 수 없다"([9]).
--        - profiles_phone_unique_idx의 "member_type is not null" 조건
--          근거로 같은 전제를 재인용([16]).
--        - 검증 섹션에 "handle_new_user 트리거가 dev에 실제로 붙어 있는지
--          확인해둘 것. 없으면 ... Header/MyPage의 프로필 조회가 빈
--          값으로 돈다"는 확인 쿼리까지 미리 심어뒀다 — "제거했다"가
--          아니라 "언젠가 빠질 수 있으니 확인하라"는 경고문이다.
--      55_coupon_policy.sql도 가입 축하 쿠폰 자동 발급 설계(0-e절, 1-j절
--      예정)를 이 트리거의 AFTER INSERT가 "사용자당 정확히 한 번" 실행
--      된다는 전제 위에 세워뒀다.
--    · check_email_signup_state([9])는 "행의 존재"가 아니라
--      "member_type is not null"로 완료를 판정하도록 이미 설계돼 있어,
--      트리거가 붙어 profiles 행이 가입 직후(이메일 인증 전)부터 존재해도
--      이어가기 판정 로직이 깨지지 않는다(오히려 원 설계가 상정한 상태로
--      되돌아간다).
--    · README.md "Confirm signup 템플릿에 ConfirmationURL을 남기면 안
--      되는 이유" 절이 별도로 설명하는 "auth.users엔 있고 profiles엔
--      없는 계정"은 이 트리거 유무와 무관한 별개 경로(매직링크 클릭 시
--      가입 폼으로 안 돌아오는 경우)다 — 트리거를 복원해도 그 경로 자체는
--      막히지 않지만, 그 경우에도 트리거가 미리 만든 행이 남아 있으므로
--      Header/MyPage 빈 값 문제는 해소된다.
--    결론: 위험 신호(스키마 불일치, 의도적 drop, search_path 미고정,
--    role 오염) 중 어느 것도 발견되지 않았다. dev에서 트리거가 없던 것은
--    저장소 SQL이 아닌 외부 요인(Supabase 대시보드 수동 조작 또는 플랫폼
--    쪽 auth 스키마 마이그레이션 중 유실 — 커뮤니티에 보고된 사례가 있는
--    유형)으로 보이며, 저장소의 설계 의도와 어긋난 결손이다. 복원한다.
--
-- e) handle_new_user()가 삽입하는 role은 리터럴 'user'다(위 a절 본문).
--    2절에서 하드닝한 profiles_insert_own의 role='user' 조건과 값이
--    같다 — 트리거가 만드는 행은 그 정책이 있었어도 통과했을 값이다.
--    다만 이 함수는 SECURITY DEFINER라 실행 시점에 RLS를 우회한다
--    (complete_signup_profile 등 이 저장소의 다른 SECURITY DEFINER RPC와
--    동일한 패턴) — 그래서 정책과 "무관하게" 안전하지만, 값 자체도
--    일치해 이중으로 문제가 없다.
-- =====================================================================

drop trigger if exists on_auth_user_created on auth."users";
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();


-- =====================================================================
-- 4) 누락 profiles 백필 — handle_new_user()와 같은 방식
--
-- 대상: auth.users에는 있고 profiles에는 없는 모든 행(적용 전 dev 실측
-- 2건 — 아래 5)절 검증 쿼리로 확인). handle_new_user()가 매 가입마다
-- 하는 것과 동일하게 id/email/role='user'/updated_at을 채운다. 추가로
-- raw_user_meta_data에 이름이 있으면(가입 폼이 auth.signUp 시점에
-- options.data로 실어보낸 값) name도 함께 채운다 — handle_new_user()는
-- name을 다루지 않지만, 이미 가진 데이터를 조용히 버릴 이유가 없다.
--
-- member_type은 채우지 않는다 — 이 백필은 "가입을 완료시키는" 것이
-- 아니라 "트리거가 원래 만들었어야 할 빈 행을 뒤늦게 만드는" 것이다.
-- 완료 판정([9] check_email_signup_state)은 member_type로 하므로, 이
-- 두 계정은 백필 후에도 여전히 이어서 가입해야 하는 상태로 남는다(정상).
--
-- on conflict (id) do nothing이라 재실행해도, 그리고 트리거가 나중에
-- 같은 계정에 다시 INSERT를 쏘려 해도(트리거 자체도 on conflict do
-- update라 안전) 안전하다.
-- =====================================================================

insert into public.profiles (id, email, role, name, updated_at)
select
  u.id,
  coalesce(u.email, ''),
  'user',
  nullif(trim(coalesce(u.raw_user_meta_data->>'name', '')), ''),
  now()
from auth.users u
where not exists (
  select 1 from public.profiles p where p.id = u.id
)
on conflict (id) do nothing;


-- =====================================================================
-- 5) 검증 (실행 가능 — 주석 아님). 트리거 동작 + INSERT 권한상승 차단을
-- 한 트랜잭션 안에서 실제로 확인한 뒤, 끝의 raise exception이 트랜잭션을
-- 되돌려 임시 행(auth.users, profiles)을 자동 정리한다.
--
-- *** 이 블록은 "에러로 끝나는 것이 정상"이다 ***
-- `P0001: SELFTEST ...` 에러 메시지를 기대값과 대조한다:
--
--   trigger_created_profile | true    | on_auth_user_created가 동작해
--                                       auth.users insert만으로 profiles
--                                       행이 자동 생성됨
--   esc_sqlstate            | 42501   | role='admin' 자가 INSERT가 RLS
--                                       WITH CHECK로 차단됨
--   esc_rows                | -99     | 에러로 중단돼 row_count 도달 못함
--   own_insert_rows         | 1       | role 생략 INSERT(정상 가입 경로
--                                       시뮬레이션)는 계속 동작
--   role_after               | user   | 최종 상태가 admin으로 오염되지 않음
-- =====================================================================
do $$
declare
  v uuid := gen_random_uuid();
  v_trigger_created boolean;
  esc_state text := 'NO-ERROR';
  esc_rows  int := -99;
  own_rows  int := -99;
  v_role_after text;
begin
  -- 실제 가입을 흉내낸다: auth.users에 insert하면 트리거가 자동으로
  -- profiles 행을 만들어야 한다(복원 확인).
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values (v, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'selftest57-' || v::text || '@example.invalid', now(), now());

  select exists(select 1 from public.profiles where id = v) into v_trigger_created;

  if not v_trigger_created then
    raise exception 'SELFTEST trigger_created_profile=false esc_sqlstate=SKIPPED esc_rows=-99 own_insert_rows=-99 role_after=NONE';
  end if;

  -- 승격 시도를 재현하려면 이 사용자가 "행이 아직 없는 상태에서 직접
  -- INSERT하는" 경로를 타야 한다. 트리거가 이미 만든 행을 지우고
  -- (owner 권한 — RLS 무관) authenticated로 가장해 재시도한다.
  delete from public.profiles where id = v;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- 공격 재현: role='admin'으로 자기 행을 직접 생성. 기대 = 42501로 차단.
  begin
    insert into public.profiles (id, role) values (v, 'admin');
    get diagnostics esc_rows = row_count;
  exception when others then
    esc_state := sqlstate;
  end;

  reset role;

  -- 정상 가입 경로 시뮬레이션: role을 생략한 INSERT(NOT NULL DEFAULT가
  -- 'user'를 채운다)는 계속 동작해야 한다.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  begin
    insert into public.profiles (id) values (v)
    on conflict (id) do nothing;
    get diagnostics own_rows = row_count;
  exception when others then
    own_rows := -1;
  end;

  reset role;

  select role into v_role_after from public.profiles where id = v;

  -- raise exception이 트랜잭션을 중단시켜 임시 행(auth.users, profiles)을
  -- 전부 롤백한다.
  raise exception 'SELFTEST trigger_created_profile=% esc_sqlstate=% esc_rows=% own_insert_rows=% role_after=%',
    v_trigger_created, esc_state, esc_rows, own_rows, v_role_after;
end $$;

-- =====================================================================
-- 6) 확인용 조회 (읽기 전용 — 실행 후 눈으로 볼 것)
-- =====================================================================
-- role 제약·기본값 최종 형태.
-- select column_name, is_nullable, column_default
-- from information_schema.columns
-- where table_schema='public' and table_name='profiles' and column_name='role';
--
-- profiles_insert_own / profiles_admin_insert_all 새 WITH CHECK 본문.
-- select policyname, cmd, roles, qual, with_check
-- from pg_policies
-- where schemaname='public' and tablename='profiles' and cmd='INSERT'
-- order by policyname;
--
-- 트리거가 실제로 auth.users에 붙어 있는지.
-- select t.tgname, c.relname as on_table, p.proname as calls, t.tgenabled
-- from pg_trigger t
-- join pg_class c on c.oid = t.tgrelid
-- join pg_proc  p on p.oid = t.tgfoid
-- where not t.tgisinternal and c.relname = 'users';
--
-- auth.users 대비 profiles 누락 0건 확인(백필 결과).
-- select count(*) as still_missing
-- from auth.users u
-- where not exists (select 1 from public.profiles p where p.id = u.id);
--
-- NULL role 잔존 0건 확인.
-- select count(*) as null_role_count from public.profiles where role is null;
--
-- =====================================================================
-- 적용 이력
-- =====================================================================
-- dev(gjowqdiopinhixfivnkx) 적용·검증 완료: 2026-08-11. 운영 반영은 별도
-- 절차(dev sql 정본 재생성 → 운영 diff → 마이그레이션). 운영 DB는 이
-- 작업 범위에서 접근하지 않았다(사용자 지시).
