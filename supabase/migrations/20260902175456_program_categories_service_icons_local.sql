-- 핵심 서비스 9종 일러스트를 그림자·PREMIUM 배지가 합성된 최종 PNG(270×356, 3:4)로 교체한다.
-- 시안 4885:18474 구조 재설계(카드 = 텍스트 묶음 + 일러스트 1장)에 맞춰 원격 storage의
-- 개별 일러스트 URL 6건과 로컬 3건을 전부 `/images/landing/services/<slug>.png`로 통일한다.
-- name 기준 갱신(신규 insert 아님). 어드민이 이후 다른 이미지를 업로드하면 그 값이 우선한다.
update public.program_categories set icon_image_url = '/images/landing/services/learning-diagnosis.png' where name = '학습진단';
update public.program_categories set icon_image_url = '/images/landing/services/goal-management.png' where name = '목표관리';
update public.program_categories set icon_image_url = '/images/landing/services/call-mentor.png' where name = '콜멘토';
update public.program_categories set icon_image_url = '/images/landing/services/performance-assessment.png' where name = '수행평가';
update public.program_categories set icon_image_url = '/images/landing/services/self-assessment.png' where name = '자기평가';
update public.program_categories set icon_image_url = '/images/landing/services/deep-inquiry.png' where name = '심화탐구';
update public.program_categories set icon_image_url = '/images/landing/services/growth.png' where name = '성장설계';
update public.program_categories set icon_image_url = '/images/landing/services/consulting-premium.png' where name = '컨설팅 프리미엄';
update public.program_categories set icon_image_url = '/images/landing/services/global-premium.png' where name = '국제·해외 프리미엄';
