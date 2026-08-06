// 출처: 운영팀 위닝에듀_FAQ.docx (2026-08-06). DB category 컬럼에 이 문자열이
// 그대로 저장된다 — 변경 시 `update public.faqs set category=<new> where category=<old>`
// 를 같은 배포에 포함할 것.
//
// 저장 형식: DB category 컬럼에는 이 배열의 한글 표시값을 그대로 저장한다(슬러그 금지).
// SQL에 CHECK 제약을 걸지 않는다 — 라벨이 바뀌면 저장이 통째로 깨진다.
export const FAQ_CATEGORIES = [
  '서비스 소개',
  '회원가입 및 이용환경',
  '서비스 이용 방법',
  '개인정보 및 데이터 보안',
  '요금제 및 결제',
  '학교·기관 도입 (B2G)',
  '기타 문의',
];
