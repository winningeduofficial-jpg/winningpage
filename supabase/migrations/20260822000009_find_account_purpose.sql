-- 아이디·비밀번호 찾기용 휴대폰 인증 목적 추가
--
-- phone_verifications.purpose 는 CHECK 로 목적을 열거한다. 아이디/비밀번호 찾기는
-- 기존 어느 목적에도 해당하지 않는다:
--   signup / parent_signup  가입 — "이미 가입된 번호"를 거부한다(정반대 조건이다)
--   phone_change            마이페이지 번호 변경 — 로그인 상태를 전제한다
--   mentor_apply            멘토 지원서
--
-- 목적을 나누는 이유는 재사용을 막기 위해서다. 가입용으로 받은 인증을 그대로
-- 아이디 찾기에 쓸 수 있으면, 인증 한 번으로 남의 계정을 조회하는 경로가 생긴다
-- (남의 번호로 가입을 시도하다 받은 코드를 쓰는 식). 찾기 경로는 자기 목적의
-- 인증만 받아들인다 — api/find-account.ts 가 purpose='find_account' 로 좁혀 조회한다.

alter table public.phone_verifications
  drop constraint if exists phone_verifications_purpose_check;

alter table public.phone_verifications
  add constraint phone_verifications_purpose_check
  check (
    purpose = any (
      array['signup', 'parent_signup', 'phone_change', 'mentor_apply', 'find_account']
    )
  );

comment on constraint phone_verifications_purpose_check on public.phone_verifications is
  '인증 목적 열거(20260822000009 에서 find_account 추가). 목적을 나누는 것이 곧 재사용 방지다 — 가입용 인증으로 아이디 찾기를 통과할 수 있으면 남의 번호로 코드를 받아 그 계정을 조회할 수 있다.';
