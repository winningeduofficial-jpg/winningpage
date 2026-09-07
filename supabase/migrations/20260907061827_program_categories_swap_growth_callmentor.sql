-- QA 시트 행289(2026-09-07): 홈 핵심 서비스 그리드에서 콜멘토(런칭 10월 이후 연기)를 하단으로,
-- 성장설계를 그 자리로 올린다. 시안 4885:18474 순서 = 학습진단·목표관리·성장설계 / 수행평가·자기평가·심화탐구 / 콜멘토·프리미엄 2종.
-- 성장설계 설명도 시안 원문으로 맞춘다(기존 행이 있어 20260902103158 마이그레이션의 insert가 건너뛰었던 값).
--
-- 제약 검증(20260821000000_baseline.sql): program_categories 는 id 에 PK, name 의
-- lower(trim(name)) 에 유니크 인덱스(program_categories_name_unique_idx)만 있고
-- sort_order 컬럼 자체에는 유니크 제약이 없다 — 값이 서로 교차해도 직접 update 로
-- 충돌 없이 처리 가능(임시값 경유 불필요). name 기준 update 라 재실행해도 동일 결과
-- (멱등).
update public.program_categories set sort_order = 3 where name = '성장설계';
update public.program_categories set sort_order = 7 where name = '콜멘토';

update public.program_categories
  set description = E'학생별 맞춤 로드맵으로\n목표부터 실행까지 설계'
  where name = '성장설계';
