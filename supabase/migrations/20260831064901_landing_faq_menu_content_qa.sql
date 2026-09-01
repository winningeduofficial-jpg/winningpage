-- =====================================================================
-- QA 시트 8/31 전수 조사의 "DB 콘텐츠" 잔여분을 데이터 마이그레이션으로 반영한다.
-- 어드민 UI 경유가 정석이나 dev 어드민 계정 부재 + CI 경로 원칙(수동 REST 수정
-- 금지)에 따라 terms 반영 선례(20260825000020 등)와 같은 방식으로 처리한다.
-- 전부 idempotent — 조건이 이미 충족돼 있으면 아무것도 바꾸지 않는다.
--
--  1) QA 행58·59 — 핵심서비스 설명 문구 교체(학습진단·수행평가). 8/17 요청 원문
--     자구 그대로, 개행 위치만 기존 2줄 관례를 따른다.
--  2) QA 행219·289 — 핵심서비스 박스에 "대입컨설팅프로그램"·"국제학교학습관리"
--     2행 추가. 링크는 행289 지정(각각 대입컨설팅 A, 해외명문대 진학컨설팅).
--     설명·일러스트는 고객 미제공이라 비워 둔다(카드에는 명칭만 — 행289 원문
--     "박스에는 랜딩 메뉴의 구성프로그램의 명칭을 넣으면 됩니다").
--  3) QA 행47·48 — FAQ "무료" 자구 2건. 요청 범위 그대로(질문 1곳, 답변 1곳)만
--     고치고 다른 "무료" 표현은 손대지 않는다.
--  4) QA 행290 — 서비스 메뉴에서 콜멘토를 맨 아래로(런칭 연기). 코드 폴백은
--     PR #203에서 이미 이동했고, 실순서 정본인 page_contents를 여기서 맞춘다.
-- =====================================================================

-- 1) 핵심서비스 설명 문구 (QA 행58·59)
update public.program_categories
set description = E'전문학습 분석을 통한\n나의 입시좌표 확인'
where name = '학습진단'
  and description is distinct from E'전문학습 분석을 통한\n나의 입시좌표 확인';

update public.program_categories
set description = E'주제 선정부터 구성,점검까지,\n수행평가 함께 완성'
where name = '수행평가'
  and description is distinct from E'주제 선정부터 구성,점검까지,\n수행평가 함께 완성';

-- 2) 핵심서비스 프리미엄 2행 (QA 행219·289) — 이름 기준 존재 검사 후 삽입
insert into public.program_categories (name, description, link, sort_order, is_active)
select '대입컨설팅프로그램', '', '/page/premium/admission-consulting/a', 8, true
where not exists (
  select 1 from public.program_categories where name = '대입컨설팅프로그램'
);

insert into public.program_categories (name, description, link, sort_order, is_active)
select '국제학교학습관리', '', '/page/premium/global-university', 9, true
where not exists (
  select 1 from public.program_categories where name = '국제학교학습관리'
);

-- 3) FAQ "무료" 자구 (QA 행47·48)
update public.faqs
set question = replace(question, '무료학생진단 서비스', '학생진단 서비스')
where question like '%무료학생진단 서비스%';

update public.faqs
set answer = replace(answer, '무료 진단서비스는', '학습진단서비스는')
where question = '리포트는 얼마나 자주 받을 수 있나요?'
  and answer like '%무료 진단서비스는%';

-- 4) 서비스 메뉴 콜멘토 맨 아래 (QA 행290)
--    현재 정본 순서: 학습진단1 목표관리2 콜멘토3 수행평가4 자기평가5 심화탐구6
--    → 콜멘토6, 수행평가3, 자기평가4, 심화탐구5. 이미 이동된 상태면 no-op.
update public.page_contents
set sort_order = case menu_label
  when '콜멘토' then 6
  when '수행평가' then 3
  when '자기평가' then 4
  when '심화탐구' then 5
end
where menu_group = '서비스'
  and menu_label in ('콜멘토', '수행평가', '자기평가', '심화탐구')
  and exists (
    select 1 from public.page_contents
    where menu_group = '서비스' and menu_label = '콜멘토' and sort_order = 3
  );
