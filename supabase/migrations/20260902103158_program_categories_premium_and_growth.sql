-- 핵심 서비스 9카드(3×3) 확장 — QA 시트 행29·60.
-- 기존 6행(학습진단~심화탐구, sort_order 1~6)은 그대로 두고 신규 3행을 sort_order 7~9로 추가한다.
-- 프리미엄 2행(대입컨설팅프로그램/국제학교학습관리)은 20260831064901 마이그레이션에서
-- link만 채운 임시 카피로 이미 존재한다 — 여기서는 그 두 행을 link 기준으로 찾아
-- 시안 카피·PREMIUM 배지·일러스트로 갱신한다(신규 insert 아님, 중복 방지).

-- 1) PREMIUM 배지 표시 컬럼
alter table public.program_categories
  add column if not exists is_premium boolean default false not null;

comment on column public.program_categories.is_premium is
  '랜딩 핵심 서비스 카드에 PREMIUM 배지를 표시할지 여부. 프리미엄 서비스(컨설팅/국제·해외 등) 카드만 true.';

-- 2) 컨설팅 프리미엄 — 기존 "대입컨설팅프로그램" 행을 link 기준으로 갱신
update public.program_categories
set name = '컨설팅 프리미엄',
    description = E'대입 컨설팅 프로그램\n특목고 입학 프로그램\n대학원 입학 프로그램',
    icon_image_url = '/images/landing/services/consulting-premium.png',
    is_premium = true,
    sort_order = 8,
    is_active = true
where link = '/page/premium/admission-consulting/a';

-- 3) 국제·해외 프리미엄 — 기존 "국제학교학습관리" 행을 link 기준으로 갱신
update public.program_categories
set name = '국제·해외 프리미엄',
    description = E'해외명문대 진학컨설팅\n국제학교 학습관리\n국제고 해외고 국내대입 컨설팅',
    icon_image_url = '/images/landing/services/global-premium.png',
    is_premium = true,
    sort_order = 9,
    is_active = true
where link = '/page/premium/global-university';

-- 4) 성장설계 — 신규 행, 이름 기준 존재 검사 후 삽입(멱등)
insert into public.program_categories
  (name, description, link, icon_image_url, sort_order, is_active, is_premium)
select
  '성장설계',
  E'학생별 맞춤 로드맵으로\n목표부터 실행까지 설계',
  '/services/growth',
  '/images/landing/services/growth.png',
  7,
  true,
  false
where not exists (
  select 1 from public.program_categories where name = '성장설계'
);
