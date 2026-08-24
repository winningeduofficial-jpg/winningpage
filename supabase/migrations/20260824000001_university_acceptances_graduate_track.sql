-- 대학원입학 프리미엄 랜딩(§5 마퀴, PremiumAcceptanceMarquee)이 쓸 신규 track='graduate'
-- 허용 + 2026년 지원자 전원합격 9행 시드. 기존 university_acceptances_track_check
-- (general/medical_special)에 graduate만 추가하고 나머지 컬럼/정책은 그대로 둔다.
ALTER TABLE public.university_acceptances
  DROP CONSTRAINT university_acceptances_track_check;

ALTER TABLE public.university_acceptances
  ADD CONSTRAINT university_acceptances_track_check
  CHECK (track = ANY (ARRAY['general'::text, 'medical_special'::text, 'graduate'::text]));

-- emblem_url은 기존 landing 마퀴(AcceptanceSection)가 쓰는 것과 동일한 대학 엠블럼 asset을
-- 재사용한다(banners/landing/acceptance/*.png). 부산대학교는 기존 데이터에 치대(pusan-dent.png)
-- 엠블럼만 존재해 법학·미술교육 두 행 모두 이 asset을 재사용한다(전용 엠블럼 없음).
INSERT INTO public.university_acceptances (name, emblem_url, subtitle, track, sort_order, is_active)
VALUES
  ('서울대학교', 'https://gjowqdiopinhixfivnkx.supabase.co/storage/v1/object/public/banners/landing/acceptance/seoul-national.png', '경제학부 석박통합', 'graduate', 10, true),
  ('고려대학교', 'https://gjowqdiopinhixfivnkx.supabase.co/storage/v1/object/public/banners/landing/acceptance/korea.png', '경제학과 석사', 'graduate', 20, true),
  ('연세대학교', 'https://gjowqdiopinhixfivnkx.supabase.co/storage/v1/object/public/banners/landing/acceptance/yonsei.png', '경제학과 석사', 'graduate', 30, true),
  ('성균관대학교', 'https://gjowqdiopinhixfivnkx.supabase.co/storage/v1/object/public/banners/landing/acceptance/sungkyunkwan.png', '경제학과 석사', 'graduate', 40, true),
  ('한양대학교', 'https://gjowqdiopinhixfivnkx.supabase.co/storage/v1/object/public/banners/landing/acceptance/hanyang.png', '경영전문대학원', 'graduate', 50, true),
  ('이화여대', 'https://gjowqdiopinhixfivnkx.supabase.co/storage/v1/object/public/banners/landing/acceptance/ewha.png', '경영전문대학원', 'graduate', 60, true),
  ('홍익대학교', 'https://gjowqdiopinhixfivnkx.supabase.co/storage/v1/object/public/banners/landing/acceptance/hongik.png', '미술교육전공 석사', 'graduate', 70, true),
  ('부산대학교', 'https://gjowqdiopinhixfivnkx.supabase.co/storage/v1/object/public/banners/landing/acceptance/pusan-dent.png', '법학 대학원', 'graduate', 80, true),
  ('부산대학교', 'https://gjowqdiopinhixfivnkx.supabase.co/storage/v1/object/public/banners/landing/acceptance/pusan-dent.png', '미술교육 대학원', 'graduate', 90, true);
