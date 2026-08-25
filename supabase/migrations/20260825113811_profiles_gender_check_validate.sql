-- profiles_gender_check 를 not valid 에서 완전 적용으로 올린다.
--
-- 앞 마이그레이션(20260825093735_signup_identity_fields)이 CHECK 를 not valid 로 걸어
-- 신규/갱신 행에만 적용해 두었다. dev 실측(2026-08-25) 기준 profiles.gender 는 전 행 null
-- 이라 validate 가 통과한다. 이 파일을 앞 파일과 분리한 이유는 운영에 '남'/'여' 밖의
-- 레거시 값이 남아 있을 경우 validate 만 실패하고 RPC 교체·컬럼 추가는 이미 적용된 채로
-- 남게 하기 위해서다 — 그때는 이 파일만 고치면 된다(이상 행을 null 로 정리한 뒤 재실행).
alter table public.profiles validate constraint profiles_gender_check;

comment on constraint profiles_gender_check on public.profiles is
  'gender 는 null 또는 ''남''/''여''. 20260825113811 에서 validate 완료 — 전 행에 적용된다.';
