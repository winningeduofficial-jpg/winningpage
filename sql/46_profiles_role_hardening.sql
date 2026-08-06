-- =====================================================================
-- profiles.role 권한상승(privilege escalation) 취약점 긴급 패치.
-- Supabase SQL Editor에서 수동 실행 필요 (이 repo에 마이그레이션 러너
-- 없음 — 00~45번과 동일하게 SQL Editor에 파일 전체를 붙여넣고 실행한다).
-- idempotent — 여러 번 실행해도 안전 (drop policy if exists 후 재생성).
--
-- ---------------------------------------------------------------------
-- 취약점 (2026-08-06 dev DB 실측 확인)
-- ---------------------------------------------------------------------
-- 가입한 임의의 회원이 브라우저 콘솔에서 한 줄로 관리자가 될 수 있었다:
--
--   await supabase.from('profiles').update({ role: 'admin' }).eq('id', 내_id)
--
-- 원인은 00_base_schema.sql:2043-2046 의 "profiles_update_own" 정책이다:
--
--   create policy "profiles_update_own" on public."profiles" as PERMISSIVE for UPDATE to authenticated
--     using ((auth.uid() = id))
--     with check ((auth.uid() = id));
--
-- WITH CHECK 이 "이 행이 내 행인가"만 검사하고 role 컬럼 값을 고정하지
-- 않는다. 원래 의도는 "내 닉네임·연락처를 내가 고친다"였지만 role이
-- 같은 행에 있어 함께 열려버렸다.
--
-- 방어선이 실측상 전부 없었다:
--   - profiles_role_check = CHECK (role = ANY (ARRAY['user','admin'])) 는
--     'admin'을 막지 않는다 — 그 값 자체가 허용값이다.
--   - profiles 에 대한 컬럼 레벨 GRANT/REVOKE — sql/ 전체 0건.
--   - BEFORE UPDATE 가드 트리거 — 0건.
--   - is_winning_admin()(00_base_schema.sql:1330-1344)은 profiles.role을
--     그대로 신뢰하므로, role이 뚫리면 이 함수가 지키는 모든 것도 함께
--     뚫린다.
--
-- ---------------------------------------------------------------------
-- 채택한 조치 — 정책 레벨에서 role 고정
-- ---------------------------------------------------------------------
-- "profiles_update_own" 의 WITH CHECK 에 "role이 기존 값과 동일해야
-- 한다"는 조건을 추가한다. 일반 회원은 이름·연락처 등은 계속 자유롭게
-- 고칠 수 있지만, role 값을 바꾸는 UPDATE는 (기존 값과 같은 값으로
-- "바꾸는" 것이 아닌 한) 이 정책에서 거부된다.
--
-- ---------------------------------------------------------------------
-- 기각한 조치와 사유 — 컬럼 레벨 REVOKE
-- ---------------------------------------------------------------------
-- 다음 안은 검토 후 기각한다:
--
--   revoke update (role) on public.profiles from authenticated, anon;
--
-- 컬럼 레벨 GRANT/REVOKE는 RLS(정책)보다 먼저 평가되고, 어드민 계정도
-- DB 레벨에서는 그냥 authenticated 롤이다. 즉 이 REVOKE를 걸면 어드민도
-- role 컬럼을 UPDATE할 수 없게 되어 src/pages/Admin.jsx:1559 의 회원
-- 관리 섹션 권한 편집 필드
--
--   { key: 'role', label: '권한', type: 'select', options: ['user', 'admin'] },
--
-- 가 통째로 죽는다. Admin.jsx의 제네릭 저장 경로는 폼에 role 필드가
-- 있으면 다른 필드(이름 등)를 수정하는 저장 요청에도 UPDATE SET 절에
-- role을 함께 실어 보낸다 — 즉 회원 "이름"만 고치려 해도 role 키가
-- 함께 전송되는 순간 컬럼 권한이 없어 UPDATE 전체가
-- "permission denied for column role"로 실패한다.
--
-- 00_base_schema.sql:2030-2033 의 "profiles_admin_update_all"
-- (using (is_admin()) with check (is_admin()))이 별도로 존재하지만,
-- 컬럼 레벨 REVOKE는 RLS 정책 통과 여부와 무관하게 먼저 막히므로 이
-- 정책이 있어도 구제되지 않는다. 그래서 REVOKE 안은 기각하고, 아래처럼
-- "profiles_update_own" 정책 하나만 좁히는 쪽을 채택한다.
--
-- ---------------------------------------------------------------------
-- 어드민 경로 무손상 확인
-- ---------------------------------------------------------------------
-- "profiles_admin_update_all"(00_base_schema.sql:2030-2033)은 이 파일이
-- 건드리지 않는 별도의 PERMISSIVE UPDATE 정책으로 그대로 남는다:
--
--   create policy "profiles_admin_update_all" on public."profiles" as PERMISSIVE for UPDATE to authenticated
--     using (is_admin())
--     with check (is_admin());
--
-- PostgreSQL RLS에서 같은 커맨드(UPDATE)에 대한 여러 PERMISSIVE 정책은
-- OR로 결합된다 — 하나라도 USING/WITH CHECK를 통과하면 허용된다. 따라서
-- "profiles_update_own"의 WITH CHECK가 좁아져(role 고정) 일반 회원의
-- role 변경 UPDATE가 이 정책에서 거부되더라도, is_admin()이 참인
-- 어드민 계정은 "profiles_admin_update_all" 정책 단독으로 여전히
-- role을 포함한 모든 컬럼을 자유롭게 UPDATE할 수 있다(Admin.jsx의 회원
-- 등급 변경 기능은 계속 정상 동작). 이 파일은 정책 재생성 순서와
-- 무관하게 "profiles_admin_update_all"을 drop/재생성하지 않는다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 본체: profiles_update_own 재정의 — WITH CHECK에 role 고정 조건 추가
-- ---------------------------------------------------------------------
drop policy if exists "profiles_update_own" on public."profiles";
create policy "profiles_update_own" on public."profiles" as PERMISSIVE for update to authenticated
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role = (select p.role from public.profiles p where p.id = auth.uid())
  );

-- =====================================================================
-- 검증 블록 (실행 가능 — 주석 아님). 임시 회원 행을 만들어 권한상승을
-- 시도한 뒤, 블록 끝의 `raise exception`이 트랜잭션 전체를 중단시켜
-- 임시 행(auth.users, profiles)을 자동 롤백한다. 위 본체 정책 적용에는
-- 영향을 주지 않는다(본체 뒤에 배치, 별도 do 블록).
--
-- *** 이 블록은 "에러로 끝나는 것이 정상"이다 ***
-- 실행 후 Supabase SQL Editor에 `P0001: SELFTEST ...` 형태의 에러
-- 메시지가 뜨면 성공이다. 그 메시지에 담긴 각 값을 아래 기대값 표와
-- 대조해서 검증한다 (아무 메시지 없이 조용히 끝나거나 다른 SQLSTATE의
-- 에러가 뜨면 실패로 간주하고 정책을 재확인할 것).
--
-- 기대값 표:
--   esc_sqlstate    | 42501        | 권한상승이 RLS WITH CHECK로 차단됨
--   esc_rows        | -99          | 에러로 중단돼 row_count에 도달 못함(정상)
--   role_after      | user         | role이 admin으로 바뀌지 않음
--   own_rows        | 1            | 일반 컬럼 수정은 계속 동작
--   username_after  | selftest-ok  | 위와 동일
--
-- profiles NOT NULL 컬럼 근거: 00_base_schema.sql:779-808 의
-- `create table if not exists public."profiles"` 정의를 직접 확인한
-- 결과, `id uuid NOT NULL`(기본값 없음) 단 하나만 NOT NULL이고 나머지
-- 전 컬럼(role 포함)은 DEFAULT가 있거나 nullable이다. 다만 profiles.id는
-- auth.users(id)를 참조하는 FK("profiles_id_fkey")가 걸려 있어, auth
-- 쪽 선행 insert 없이 곧바로 profiles에 임시 행을 넣으면 다음 에러로
-- 죽는다(2026-08-06 dev DB 실측):
--   ERROR: 23503: insert or update on table "profiles" violates foreign
--   key constraint "profiles_id_fkey"
--   DETAIL: Key (id)=(...) is not present in table "users".
-- 따라서 아래 블록은 auth.users에 임시 행을 먼저 insert한 뒤
-- public.profiles에 upsert한다.
--
-- set local role 사용 시 슈퍼유저/오너 권한이 필요할 수 있다. 만약
-- "permission denied to set role" 등으로 이 블록 자체가 실패하면 아래
-- 수동 검증 절차로 대체한다:
--   1) 일반 회원 계정으로 로그인한 브라우저 콘솔에서
--      await supabase.from('profiles').update({ role: 'admin' }).eq('id', 내_id)
--      를 실행한다.
--   2) 응답이 RLS 위반 에러(42501, 하드 에러로 요청 자체가 실패)이거나
--      0행(빈 배열)이어야 정상이다. role이 실제로 'admin'으로 바뀌면
--      이 마이그레이션이 적용되지 않았거나 실패한 것이다.
-- =====================================================================
do $$
declare
  v uuid := gen_random_uuid();
  esc_state text := 'NO-ERROR';
  esc_rows int := -99;
  own_rows int := -99;
  r_after text; u_after text;
begin
  -- profiles.id는 auth.users(id)를 FK 참조하므로 auth 쪽 임시 행이 선행되어야 한다.
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values (v, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'selftest-' || v::text || '@example.invalid', now(), now());

  insert into public.profiles (id, role) values (v, 'user')
  on conflict (id) do update set role = 'user';

  -- 이 임시 유저를 가장한다 (auth.uid()가 v를 반환하도록)
  perform set_config('request.jwt.claims',
    json_build_object('sub', v::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- 공격 재현: 셀프 관리자 승격. 기대 = 42501로 차단(0행이 아니라 에러다)
  begin
    update public.profiles set role = 'admin' where id = v;
    get diagnostics esc_rows = row_count;
  exception when others then
    esc_state := SQLSTATE;
  end;

  -- 일반 컬럼 수정은 계속 동작해야 한다. 기대 = 1행
  begin
    update public.profiles set username = 'selftest-ok' where id = v;
    get diagnostics own_rows = row_count;
  exception when others then
    own_rows := -1;
  end;

  reset role;
  select role, username into r_after, u_after from public.profiles where id = v;

  -- raise exception이 트랜잭션을 중단시켜 임시 행 2개(auth.users, profiles)를 전부 롤백한다.
  -- 즉 이 블록은 성공해도 "에러"로 끝나는 것이 정상이며, 메시지 본문이 검증 결과다.
  raise exception 'SELFTEST esc_sqlstate=% esc_rows=% role_after=% own_rows=% username_after=%',
    esc_state, esc_rows, r_after, own_rows, u_after;
end $$;

-- =====================================================================
-- 적용 이력
-- =====================================================================
-- dev(gjowqdiopinhixfivnkx) 적용·검증 완료: 2026-08-06. 운영 반영은 별도
-- 절차(dev sql 정본 재생성 → 운영 diff → 마이그레이션).
