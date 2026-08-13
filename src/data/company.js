// 사업자 정보 (랜딩/결제 페이지 푸터, 카드사·PG 심사 제출용)
// 값이 바뀌면 이 파일만 수정하면 모든 푸터에 반영된다.
export const COMPANY = {
  name: '주식회사 위닝에듀',
  ceo: '강원석',
  corpRegNo: '180111-0161411', // 법인등록번호
  patentNo: '10-2024-0048889', // 특허출원
  bizRegNo: '266-88-03449', // 사업자 등록번호
  mailOrderNo: '제2026-세종아름-0264호', // 통신판매업 신고번호
  address: '(본점) 세종특별자치시 마음안1로 61, 404호',
  tel: '010-3664-0081', // 대표전화
  centerTel: '051-902-0080', // 센터문의
  kakao: 'winningedu_official',
  // 카카오톡 채널 URL(pf.kakao.com/_xxxx). 위 kakao 는 채널 **아이디**일 뿐이라
  // URL 을 만들 수 없다 — 채널 키를 받아 여기에 채우면 마이페이지 우하단
  // 상담 버튼(KakaoConsultButton)이 그때부터 노출된다. 비어 있으면 숨는다.
  kakaoChannelUrl: ''
};
