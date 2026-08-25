-- 프로필 이름·생년월일·성별 잠금 — QA 요구(2026-08-22)로 가입 시 본인인증을 거쳐
-- 확정된 이름·생년월일·성별을 이후 변경하지 못하게 한다. UI(ProfileTab.tsx)는 이미
-- 읽기 전용으로 바꿨지만 그건 DevTools로 profiles UPDATE를 직접 쏘면 뚫리는 잠금이라,
-- 실제 방어는 여기 트리거에서 한다.
--
-- old 값이 null 인 경우는 통과시킨다 — 기존 가입자 중 세 컬럼이 비어 있는 행이 있을 수
-- 있고(백필 대상), 회원가입 폼이 나중에 이 필드를 받도록 확장될 수도 있어 "최초 입력"은
-- 막지 않는다. 값이 한 번 채워진 뒤에만 잠근다.
--
-- authenticated 세션(일반 사용자 브라우저)에서만 잠근다. service_role(서버 API·
-- 마이그레이션 백필)과 public.is_admin() 통과자(어드민 화면의 수정)는 그대로 통과한다.
create or replace function public.fn_profiles_lock_identity_fields()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.role() = 'authenticated' and not public.is_admin() then
    if old.name is not null and new.name is distinct from old.name then
      raise exception using errcode = 'P0001',
        message = '이름·생년월일·성별은 변경할 수 없습니다.';
    end if;

    if old.birth_date is not null and new.birth_date is distinct from old.birth_date then
      raise exception using errcode = 'P0001',
        message = '이름·생년월일·성별은 변경할 수 없습니다.';
    end if;

    if old.gender is not null and new.gender is distinct from old.gender then
      raise exception using errcode = 'P0001',
        message = '이름·생년월일·성별은 변경할 수 없습니다.';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.fn_profiles_lock_identity_fields() is
  '20260825093331 — profiles.name/birth_date/gender 변경 잠금 트리거 함수. 가입 시
  본인인증으로 확정된 값이라 QA 요구(2026-08-22)로 이후 수정을 막는다. UI 잠금은
  DevTools로 우회 가능해 DB 레벨에서도 막는다. old 값이 null인 최초 입력(기존 가입자
  백필·향후 가입 폼 확장)은 허용한다. service_role과 public.is_admin() 통과자는 예외.';

drop trigger if exists trg_profiles_lock_identity_fields on public.profiles;

create trigger trg_profiles_lock_identity_fields
  before update on public.profiles
  for each row
  execute function public.fn_profiles_lock_identity_fields();
