// 사업자 정보 (랜딩/결제 페이지 푸터, 카드사·PG 심사 제출용)
// 값이 바뀌면 이 파일만 수정하면 모든 푸터에 반영된다.
export const COMPANY = {
  name: "주식회사 위닝에듀",
  ceo: "강원석",
  corpRegNo: "180111-0161411", // 법인등록번호
  patentNo: "10-2024-0048889", // 특허출원
  bizRegNo: "266-88-03449", // 사업자 등록번호
  mailOrderNo: "제2026-세종아름-0264호", // 통신판매업 신고번호
  address: "(본점) 세종특별자치시 마음안1로 61, 404호",
  tel: "010-3664-0081", // 대표전화
  centerTel: "051-902-0080", // 센터문의
  kakao: "winningedu_official",
  // 카카오톡 채널 URL. 위 kakao 는 **검색용 아이디**일 뿐 URL 이 아니다 —
  // 링크에 쓰는 값은 채널 키가 들어간 이 주소다(2026-08-13 수령).
  // 원본은 http 로 받았지만 https 로 적는다 — 사이트가 https 라 http 링크는
  // 브라우저가 혼합 콘텐츠로 경고하거나 승격시킨다. pf.kakao.com 은 https 를 지원한다.
  // 채팅창을 바로 열려면 뒤에 `/chat` 을 붙이면 된다(지금은 채널 홈으로 보낸다).
  kakaoChannelUrl: "https://pf.kakao.com/_EfjwX",
};
