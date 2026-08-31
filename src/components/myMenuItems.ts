// 모바일 드로어가 쓰는 마이페이지 메뉴(헤더 데스크톱 버튼은 QA 행253·254로 단독
// /mypage 버튼이 돼 더는 이 목록을 쓰지 않는다 — 아이콘 필드도 그때 함께 걷어냈다).
//
// 회원유형으로 목적지가 갈린다 — 학부모는 서비스를 **이용하는 사람이 아니라
// 결제하는 사람**이다.
//   · 학생  '수강신청·결제' → /pricing (StudentEnrollmentRequest, 결제 요청을 만든다)
//   · 학부모 '수강신청·결제' → /mypage?tab=payments (자녀가 올린 요청을 결제한다)
//
// 학부모가 /pricing 으로 가면 ParentPricingBlockedModal 이 뜬다(Pricing.jsx:49) —
// 막히는 화면으로 보내는 대신 실제로 할 일이 있는 곳으로 보낸다.
export function buildMyMenu(isParent = false) {
  return [
    // 학생에겐 '자녀'가 없다 — 자녀 등록·수정 탭 자체가 학부모 전용이다
    // (MyPage.jsx PARENT_TABS). 라벨에 남겨두면 없는 기능을 광고하는 셈이다.
    { label: isParent ? "내정보·자녀수정" : "내정보", to: "/mypage" },
    {
      label: "수강신청·결제",
      to: isParent ? "/mypage?tab=payments" : "/pricing",
    },
    { label: "환불신청", to: "/mypage#refund" },
  ];
}
