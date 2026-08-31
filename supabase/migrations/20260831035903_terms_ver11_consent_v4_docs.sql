-- =====================================================================
-- 서비스 이용약관 Ver11 + 동의서 V4 묶음(2026-08-31 수령) 반영.
--
-- 원문: "★위닝에듀_약관동의서모음_20260831" 폴더 8종.
--   · ★위닝에듀_서비스이용약관_Ver11_20260831.docx
--   · ★1~★5 동의서 V4, 학생/학부모 회원가입약관 V4
--
-- 8/30 개정본(20260831014731) 대비 전수 대조 결과(로컬 스택 실측):
--   1) 서비스이용약관 Ver11 — 실질 변경은 제33조의1 ⑦ 한 문장뿐.
--      기간제 대상에 "자기평가서비스, 심화탐구서비스"가 추가됐다. 같은 문장이
--      refund_policy(발췌본)·refund_notice(결제 화면 인라인)에도 복제돼 있어
--      세 곳을 함께 갱신한다.
--   2) 학생회원가입약관 V4 — 대상 서비스 명칭 전면 교체(구 브랜드명
--      위닝AI수행멘토·위닝수시예측·위닝세특관리·위닝약점관리 폐기), 공유정보
--      문구 교체, 부칙 시행일 8/1 → 9/1. 신규 명칭 리스트의 이중 쉼표
--      ("수행평가, , 성장설계")는 수령 원문 그대로다 — 임의 정정하지 않는다
--      (사용자 확정 2026-08-31: "띄어쓰기 등 내가 판단하지 않음").
--   3) 결제서비스 이용약관 V4 — "전자지급결제대행업체" → "전자지급
--      결제대행업체"(원문 그대로, 위와 같은 확정).
--   4) ★1·★2·★3·★5 동의서와 학부모회원가입약관 V4는 기존 DB 본문과 단어
--      단위로 동일하다(차이는 docx 표의 평탄화·연속 공백·제목 줄뿐). 표를
--      "- 항목: 값" 목록으로 옮기는 기존 임포트 표기 관례(20260825000020)를
--      유지하므로 반영할 변경이 없다.
--
-- 버전 처리(선례 준수):
--   · service_fulltext: v4 비활성 → v5(Ver11) 신설 — 20260829102136 의
--     v3→v4 전환과 동일 패턴. terms_active_code_key(활성 code 유니크) 때문에
--     비활성화가 먼저다.
--   · refund_policy: v2 비활성 → v3 신설 — 같은 패턴.
--   · refund_notice: 행 유지 + content 제자리 교체 — 동의 원장
--     (user_term_agreements.term_id)이 이 행을 참조하는 선례(20260829102136).
--   · payment_terms·student_service: 문서명은 V4지만 DB 버전 축은 임포트
--     기준(v1)이라 제자리 교체 — 20260831014731 의 제자리 교체 선례.
--
-- 신설 v5/v3 content 는 기존 활성 행에서 replace() 로 파생한다 — 전문을 다시
-- 붙여넣으면 8/30 개정과의 사이에 의도치 않은 드리프트가 생길 수 있어,
-- 확인된 델타만 적용하는 쪽이 안전하다(치환 원본 문자열은 행당 정확히 1회
-- 출현함을 REST 실측으로 확인).
--
-- 재실행 시 no-op(비활성화·삽입은 not exists 가드, replace 는 원본 문자열
-- 소멸로 자연 멱등).
-- =====================================================================

-- 1) service_fulltext v4(Ver10 개정본) → v5(Ver11)
update public.terms
   set is_active = false
 where code = 'service_fulltext'
   and version = 'v4'
   and is_active
   and not exists (
     select 1 from public.terms where code = 'service_fulltext' and version = 'v5'
   );

insert into public.terms
  (code, version, audience, title, route, content, is_required, profile_column, effective_from, is_active, sort_order)
select
  code, 'v5', audience, title, route,
  replace(
    content,
    '⑦ 목표관리서비스, 수행평가서비스는 기간제 이용이 가능하며',
    '⑦ 목표관리서비스, 수행평가서비스, 자기평가서비스, 심화탐구서비스는 기간제 이용이 가능하며'
  ),
  is_required, profile_column, effective_from, true, sort_order
from public.terms
where code = 'service_fulltext'
  and version = 'v4'
  and not exists (
    select 1 from public.terms where code = 'service_fulltext' and version = 'v5'
  );

-- 2) refund_policy v2 → v3 (같은 ⑦ 문장)
update public.terms
   set is_active = false
 where code = 'refund_policy'
   and version = 'v2'
   and is_active
   and not exists (
     select 1 from public.terms where code = 'refund_policy' and version = 'v3'
   );

insert into public.terms
  (code, version, audience, title, route, content, is_required, profile_column, effective_from, is_active, sort_order)
select
  code, 'v3', audience, title, route,
  replace(
    content,
    '⑦ 목표관리서비스, 수행평가서비스는 기간제 이용이 가능하며',
    '⑦ 목표관리서비스, 수행평가서비스, 자기평가서비스, 심화탐구서비스는 기간제 이용이 가능하며'
  ),
  is_required, profile_column, effective_from, true, sort_order
from public.terms
where code = 'refund_policy'
  and version = 'v2'
  and not exists (
    select 1 from public.terms where code = 'refund_policy' and version = 'v3'
  );

-- 3) refund_notice — 행 유지, ⑦ 문장만 제자리 교체
update public.terms
   set content = replace(
     content,
     '⑦ 목표관리서비스, 수행평가서비스는 기간제 이용이 가능하며',
     '⑦ 목표관리서비스, 수행평가서비스, 자기평가서비스, 심화탐구서비스는 기간제 이용이 가능하며'
   )
 where code = 'refund_notice'
   and is_active;

-- 4) payment_terms — 결제서비스 이용약관 V4 표기(원문 그대로)
update public.terms
   set content = replace(content, '전자지급결제대행업체', '전자지급 결제대행업체')
 where code = 'payment_terms'
   and is_active;

-- 5) student_service — 학생회원가입약관 V4
--    (이중 쉼표 "수행평가, , 성장설계"는 수령 원문 그대로 — 헤더 주석 참고)
update public.terms
   set content = replace(replace(replace(replace(
     content,
     '대상 서비스 : 위닝목표관리, 위닝AI수행멘토, 위닝수시예측, 위닝세특관리, 위닝심화탐구, 위닝약점관리',
     '대상 서비스 : 위닝 학습관리, 목표관리, 수행평가, , 성장설계, 심화탐구, 자기평가, 콜멘토 서비스'),
     '대상 서비스 : 위닝목표관리서비스 (주간·월간 리포트 전달)',
     '대상 서비스 : 위닝 목표관리 서비스 (주간·월간 리포트 전달)'),
     '공유정보 : 학습 진도 및 목표관리 리포트, 학습 약점 분석 결과, AI수행평가·세특관리·심화탐구·수시예측 결과, 결제·이용내역 중 열람 필요 범위',
     '공유정보 : 학습 진단 및 목표관리 리포트, 학습 분석 결과, 수행평가, 심화탐구, 자기평가 결과, 결제·이용내역 중 열람 필요 범위'),
     '본 약관은 2026년 8월 1일부터 시행합니다',
     '본 약관은 2026년 9월 1일부터 시행합니다')
 where code = 'student_service'
   and is_active;
