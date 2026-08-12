-- =====================================================================
-- 가격표 최종본 정합 + "AI" 문구 제거 (목표관리/콜멘토/수행평가 10종)
-- Supabase SQL Editor 에서 실행하세요. (idempotent - 여러 번 실행해도 안전)
-- =====================================================================
--
-- 배경
-- ---------------------------------------------------------------------
-- 고객사가 확정한 가격표 최종본과 dev DB 의 목표관리 4종 가격이 달랐다.
-- 사용자가 최종본 기준으로 맞추기로 확정했다(청구액이 바뀌는 변경).
-- 시안 자체에 라벨 복붙 오류(목표관리 3종이 전부 '[6개월 이용권]')가 있었으나
-- 사용자가 오류로 확정했고, 정가 계산(30,000×3=90,000 / ×6=180,000 / ×12=360,000)과
-- 고객사 요금 구조표가 이를 뒷받침해 아래 표를 정본으로 삼는다.
--
-- 동시에 사용자가 화면에 보이는 모든 "위닝 AI수행평가" 류 문구에서 "AI"를
-- 전부 뺀다고 확정했다("위닝 AI수행평가" → "위닝 수행평가").
--
-- 0) 조사 (2026-08-11 dev(gjowqdiopinhixfivnkx) 실측)
-- ---------------------------------------------------------------------
-- a) 적용 전 products 14행 — goal 4 / susi 3 / mentor 1 / suhaeng 5 / diagnose 1.
--    goal/mentor/suhaeng 가격·이름은 sql/10_pricing_orders.sql:196-218 시드값과
--    100% 동일했다(운영자가 sql/53 적용 이후 추가로 손댄 적이 없다) — 즉 아래
--    UPDATE 의 WHERE old-value 가드는 그 시드값 그대로 사용한다.
--    badge/is_recommended 는 이미 최종본과 일치했다(아래 1)절 근거) — 이 파일이
--    바꾸는 건 list_price/price/name/service_name/service_desc 뿐이다.
--
-- b) order_items 실측 2행 — product_id 가 goal-1m·mentor-1 뿐이다(susi-*·
--    diagnose-1 을 참조하는 행 0건, product_id FK 실측). 4종 삭제가
--    "과거 주문의 관계가 끊긴다"는 위험에 해당하지 않는다.
--
-- c) badge/is_recommended 재계산 — 새 가격의 할인율을 실제로 계산해 확인:
--      goal-3m  9,000/90,000  = 10% → 기존 '10% 할인' 그대로 맞다
--      goal-6m  36,000/180,000 = 20% → 기존 '20% 할인' 그대로 맞다
--      goal-12m 144,000/360,000 = 40% → 기존 '40% 할인' 그대로 맞다
--      suhaeng-6  1,500/15,000 = 10% / suhaeng-14 6,000/30,000 = 20% /
--      suhaeng-30 18,000/60,000 = 30% → 전부 기존 badge 와 일치.
--    suhaeng 5종은 dev 가격 자체가 이미 최종본과 같아 price/list_price 변경이
--    없다(이름·service_name/service_desc 의 "AI"만 뗀다).
--    추천(`is_recommended`) 대상도 최종본 그대로 goal-12m/suhaeng-30 뿐이고
--    dev 도 이미 그렇다 — 이 파일은 badge/is_recommended 를 UPDATE 하지 않는다
--    (건드릴 값이 없다. src/pages/Pricing.jsx:496·558 실측 — `is_recommended`
--    는 lg 이상 파란 '추천' 칩, `badge` 는 정가 취소선 옆 할인율 문자열로
--    각각 렌더된다. 둘 다 이미 정답이라 이 파일 범위가 아니다).
--
-- d) programs 테이블(products 와 다른 테이블, product_key='susi'/'diagnose'
--    2행)은 이미 is_active=false 로 "예정 서비스" 상태다 — 이 파일이 건드릴
--    이유가 없어 손대지 않는다(products 삭제와 무관한 별도 테이블).
--
-- e) sql/53_pricing_susi_restore.sql 처리 판단
-- ---------------------------------------------------------------------
--    sql/53 은 susi 3종을 "복구"하는 파일이고(마커 '52_pricing_susi_restore_v1'
--    로 이미 dev 에 적용 완료), 이번 삭제 결정과 정면 충돌한다. 파일 맨 위
--    경고대로 마커 문자열은 절대 고치지 않는다 — 대신 아래 판단으로 처리한다:
--
--    sql/README.md 규약상 재실행/신규 구축은 "파일명 접두어 순서대로" 실행된다.
--    이 파일(63)은 53 보다 뒤이므로, 신규 빈 DB 에 00→63 을 순서대로 전부
--    재생한다 해도 흐름은 다음과 같다:
--      10  → susi-1/2/3 시드 삽입(비활성 아님, is_active 기본값 true)
--      53  → 1-a insert 는 conflict 로 0행(10이 이미 만들었으므로) /
--             1-b 마커 UPDATE 는 신규 DB 라 마커가 없어 1회 적중(문구·순서
--             정정, is_active 유지) / susi 3행은 계속 활성 상태로 존재
--      63(이 파일) → 아래 2)절 DELETE 가 susi-1/2/3 을 무조건 지운다
--    즉 53 이 susi 를 "복구/유지"해도 63 이 항상 그 뒤에 실행되어 최종
--    상태는 재생 경로와 무관하게 "susi 없음"으로 수렴한다 — sql/53 파일
--    자체의 문장을 단 한 글자도 고치지 않아도 최종 상태 일관성이 보장된다.
--    (반대로 53 을 미리 고쳐 susi 삽입을 막으면, 53 자체의 "구 값에만 적중"
--    멱등 규약과 마커 불변 원칙을 깨야 해서 오히려 더 위험하다.)
--
--    유일한 부작용은 마커 '52_pricing_susi_restore_v1' 이 schema_migrations 에
--    "적용 완료"로 영구히 남는 것인데, 이 마커는 sql/53 자기 자신의 1-b 문장
--    재실행만 막을 뿐 다른 어떤 파일도 참조하지 않는다(grep 확인) — susi 가
--    최종적으로 삭제된 상태와 모순되지 않는 순수 이력 기록으로 남긴다.
--    결론: sql/53 은 완전히 그대로 둔다. (별도로 sql/10 의 susi 관련 INSERT
--    리터럴은 신규 빈 DB 경로가 애초에 susi 를 만들지 않도록 sql/10 자체에서
--    제거한다 — 아래 sql/10 수정 참고. 그러면 위 시나리오의 10→53→63 경로에서
--    10 이 susi 를 만들지 않고, 53 의 1-a insert 가 대신 만들었다가(신규 DB
--    한정) 63 이 지우는 흐름이 되어 결과는 동일하다.)
--
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) products : 가격·이름 정정 (목표관리 4종 / 콜멘토 / 수행평가 5종 "AI" 제거)
--    guard 는 51/53 번 규약대로 "구 값에만 적중" where 절 — 재실행 시 이미
--    새 값이면 0행(자연 멱등), 운영자가 이후 다른 값으로 고쳤다면 옛 값이
--    아니므로 이 UPDATE 가 그 편집을 덮어쓰지 않는다.
-- ---------------------------------------------------------------------

-- 위닝 목표관리 4종 — 정가/판매가 갱신 + 라벨에 "이용권" 추가.
update public.products
   set name = '[1개월 이용권] 위닝 목표관리', list_price = 30000, price = 30000
 where slug = 'goal-1m'
   and name = '[1개월] 위닝 목표관리' and list_price = 25000 and price = 25000;

update public.products
   set name = '[3개월 이용권] 위닝 목표관리', list_price = 90000, price = 81000
 where slug = 'goal-3m'
   and name = '[3개월] 위닝 목표관리' and list_price = 75000 and price = 67500;

update public.products
   set name = '[6개월 이용권] 위닝 목표관리', list_price = 180000, price = 144000
 where slug = 'goal-6m'
   and name = '[6개월] 위닝 목표관리' and list_price = 150000 and price = 120000;

update public.products
   set name = '[12개월 이용권] 위닝 목표관리', list_price = 360000, price = 216000
 where slug = 'goal-12m'
   and name = '[12개월] 위닝 목표관리' and list_price = 300000 and price = 180000;

-- 위닝 콜멘토 — 라벨에 "30분" 명시(정가/판매가는 변경 없음, 최종본과 동일).
update public.products
   set name = '[30분 이용권] 콜멘토'
 where slug = 'mentor-1'
   and name = '[이용권] 콜멘토';

-- 위닝 수행평가(구 "위닝 AI수행평가") 5종 — 이름·서비스명·서비스설명에서
-- "AI" 제거. 정가/판매가는 이미 최종본과 동일해 변경하지 않는다(위 0-a 근거).
update public.products
   set name = '[1회 이용권] 위닝 수행평가',
       service_name = '위닝 수행평가',
       service_desc = '수행평가 서비스는 과목, 단원, 진로, 학생의 기존 활동을 바탕으로 수행평가 주제를 추천하고 탐구 구조를 잡아주는 서비스입니다. 단순한 답안 작성이 아니라 주제 선정, 자료 방향, 탐구 질문, 발표 구조까지 관리할 수 있습니다.'
 where slug = 'suhaeng-1'
   and name = '[1회 이용권] 위닝 AI수행평가'
   and service_name = '위닝 AI수행평가';

update public.products
   set name = '[1개월 2회 이용권] 위닝 수행평가',
       service_name = '위닝 수행평가',
       service_desc = '수행평가 서비스는 과목, 단원, 진로, 학생의 기존 활동을 바탕으로 수행평가 주제를 추천하고 탐구 구조를 잡아주는 서비스입니다. 단순한 답안 작성이 아니라 주제 선정, 자료 방향, 탐구 질문, 발표 구조까지 관리할 수 있습니다.'
 where slug = 'suhaeng-2'
   and name = '[1개월 2회] 위닝 AI수행평가'
   and service_name = '위닝 AI수행평가';

update public.products
   set name = '[3개월 6회 이용권] 위닝 수행평가',
       service_name = '위닝 수행평가',
       service_desc = '수행평가 서비스는 과목, 단원, 진로, 학생의 기존 활동을 바탕으로 수행평가 주제를 추천하고 탐구 구조를 잡아주는 서비스입니다. 단순한 답안 작성이 아니라 주제 선정, 자료 방향, 탐구 질문, 발표 구조까지 관리할 수 있습니다.'
 where slug = 'suhaeng-6'
   and name = '[3개월 6회 이용권] 위닝 AI수행평가'
   and service_name = '위닝 AI수행평가';

update public.products
   set name = '[6개월 14회 이용권] 위닝 수행평가',
       service_name = '위닝 수행평가',
       service_desc = '수행평가 서비스는 과목, 단원, 진로, 학생의 기존 활동을 바탕으로 수행평가 주제를 추천하고 탐구 구조를 잡아주는 서비스입니다. 단순한 답안 작성이 아니라 주제 선정, 자료 방향, 탐구 질문, 발표 구조까지 관리할 수 있습니다.'
 where slug = 'suhaeng-14'
   and name = '[6개월 14회 이용권] 위닝 AI수행평가'
   and service_name = '위닝 AI수행평가';

update public.products
   set name = '[12개월 30회 이용권] 위닝 수행평가',
       service_name = '위닝 수행평가',
       service_desc = '수행평가 서비스는 과목, 단원, 진로, 학생의 기존 활동을 바탕으로 수행평가 주제를 추천하고 탐구 구조를 잡아주는 서비스입니다. 단순한 답안 작성이 아니라 주제 선정, 자료 방향, 탐구 질문, 발표 구조까지 관리할 수 있습니다.'
 where slug = 'suhaeng-30'
   and name = '[12개월 30회 이용권] 위닝 AI수행평가'
   and service_name = '위닝 AI수행평가';

-- ---------------------------------------------------------------------
-- 2) products : 판매 대상 아닌 4종 삭제 (susi-1/susi-2/susi-3/diagnose-1)
--    - susi 3종 : 고객사 요금표·최종본 둘 다에 없다.
--    - diagnose-1 : 학습진단은 무료 서비스인데 10,000원 상품으로 올라가
--      있었다(무료인 것에 돈을 받는 상태였다).
--    order_items.product_id 가 이 4종을 참조하는 행이 0건임을 위 0-b)절에서
--    확인했다 — on delete set null 이라 어차피 안전하지만, 참조가 있었다면
--    삭제하지 않고 보고했을 사안이다.
--    programs 테이블의 susi/diagnose 행(is_active=false, "예정 서비스")은
--    별도 테이블이라 이 DELETE 와 무관하며 그대로 둔다.
--    plain delete ... where slug in (...) 는 자연 멱등(이미 없으면 0행).
-- ---------------------------------------------------------------------
delete from public.products
 where slug in ('susi-1', 'susi-2', 'susi-3', 'diagnose-1');

-- ---------------------------------------------------------------------
-- 3) page_contents : 수행평가 서비스 상세 페이지(/page/services-ai-performance)
--    타이틀·본문의 "AI" 제거. slug 자체(services-ai-performance)는 라우트
--    식별자로 src/App.jsx·src/hooks/useNavGroups.js·src/lib/paidServiceAccess.js
--    3곳에서 코드로 참조되는 값이라 여기서 바꾸지 않는다(사용자에게 보이는
--    문자열이 아니다 — 이 파일 보고서에 별도 기록).
--    guard 는 51번 규약대로 구 값에만 적중.
-- ---------------------------------------------------------------------
update public.page_contents
   set title = '위닝 수행평가 서비스',
       body = '수행평가 서비스는 과목, 단원, 진로, 학생의 기존 활동을 바탕으로 수행평가 주제를 추천하고 탐구 구조를 잡아주는 서비스입니다.

단순한 답안 작성이 아니라 주제 선정, 자료 방향, 탐구 질문, 발표 구조까지 관리할 수 있습니다.'
 where slug = 'services-ai-performance'
   and title = '위닝AI 수행평가 서비스';

-- =====================================================================
-- 확인용 (실행 후 눈으로 볼 것 — 아래는 주석, 자동 실행되지 않는다)
-- =====================================================================
-- 최종본 10행과 1:1 대조.
-- select slug, name, list_price, price, badge, is_recommended, is_active, service_key
--   from public.products
--  order by service_sort_order, sort_order;
--
-- 삭제 4종이 사라졌는지 + order_items 2행이 온전한지.
-- select slug from public.products where slug in ('susi-1','susi-2','susi-3','diagnose-1');
-- select id, product_id, product_slug, name, list_price, price from public.order_items order by id;
--
-- 과거 주문 금액이 그대로인지(78,000 / 할인 2,000).
-- select id, list_amount, discount_amount, amount from public.orders order by created_at;
--
-- DB 안에 사용자에게 보이는 "AI" 가 남아있는지(제품·서비스 텍스트 컬럼만).
-- select slug, name, service_name, service_desc from public.products
--  where name ~ '(^|[^A-Za-z])AI([^A-Za-z]|$)'
--     or service_name ~ '(^|[^A-Za-z])AI([^A-Za-z]|$)'
--     or coalesce(service_desc,'') ~ '(^|[^A-Za-z])AI([^A-Za-z]|$)';
-- select slug, title, body from public.page_contents
--  where title ~ '(^|[^A-Za-z])AI([^A-Za-z]|$)' or coalesce(body,'') ~ '(^|[^A-Za-z])AI([^A-Za-z]|$)';
-- =====================================================================
