import { useEffect, useRef } from "react";

// ---------------------------------------------------------------------------
// 어드민 상세·편집 화면에서 브라우저 뒤로가기가 목록으로 돌아오게 한다 (QA 317).
//
// 무엇이 문제였나
//   어드민의 상세·편집 화면은 **라우트가 아니다.** 목록과 같은 URL(/admin/<메뉴>)
//   위에서 컴포넌트 state 로만 전체 화면을 갈아끼운다(MembersAdmin 의 selected,
//   CouponAdmin 의 view, 제네릭 엔진의 mode 등). 그래서 상세를 보다가 브라우저
//   뒤로가기를 누르면 히스토리상 "직전 항목"은 목록이 아니라 **그 전에 들렀던
//   다른 메뉴**다 — 멘토 신청 내역 상세에서 뒤로 가면 멘토신청 문구로 튀는 게
//   그 증상이다(2026-08-31 사용자 실측: 회원 목록·쿠폰 관리·관리자 관리도 동일).
//
//   증상이 메뉴마다 다르게 보이는 이유도 여기 있다. 직전에 들른 메뉴가 마침
//   같은 화면이었으면 뒤로가기가 "제대로 동작한 것처럼" 보인다. 그래서 어떤
//   화면은 되고 어떤 화면은 안 되는 것처럼 읽힌다.
//
// 어떻게 고치나
//   상세를 열 때 **같은 URL 로 히스토리 항목을 하나 쌓는다.** 뒤로가기는 그
//   항목을 소비하며 popstate 를 던지고, 우리는 거기서 상세를 닫는다. URL 이
//   바뀌지 않으므로 React Router 는 재조정할 것이 없다(같은 pathname).
//
//   상세를 라우트로 승격하는 것이 정공법이지만, 그러려면 아홉 개 화면의 상태
//   모델과 라우트 정의를 한꺼번에 바꿔야 한다. 이 훅은 사용자가 겪는 증상만
//   먼저 없앤다 — 라우트 승격이 필요해지면(딥링크·새로고침 유지) 그때 이 훅을
//   걷어내면 된다.
//
// ⚠️ 정리(cleanup)에서 되감을 때 pathname 을 확인하는 이유
//   상세를 연 채 사이드바로 다른 메뉴를 누르면 이 컴포넌트도 언마운트된다.
//   그때 무조건 history.back() 을 부르면 **사용자가 방금 한 이동을 취소해**
//   원래 화면으로 끌려온다. 그래서 "내가 쌓은 항목이 아직 맨 위인가"를
//   pathname 으로 확인하고, 바뀌었으면 손대지 않는다(남은 항목은 목록과 같은
//   URL 이라 뒤로가기 한 번이 목록으로 갈 뿐 엉뚱한 곳으로 가지 않는다).
// ---------------------------------------------------------------------------

/** 이 항목이 우리가 쌓은 것인지 구분하는 표식. 남의 pushState 를 삼키지 않는다. */
const MARKER = "adminDetail";

export function useAdminDetailBack(isOpen: boolean, close: () => void): void {
  // close 가 렌더마다 새로 만들어져도 effect 를 다시 돌리지 않는다 — 다시 돌면
  // 히스토리 항목이 상세 한 번에 여러 개 쌓여 뒤로가기를 여러 번 눌러야 한다.
  const closeRef = useRef(close);
  closeRef.current = close;

  const pushedRef = useRef(false);
  const pathRef = useRef("");

  useEffect(() => {
    if (!isOpen) return;
    if (typeof window === "undefined") return;

    pathRef.current = window.location.pathname;
    window.history.pushState({ [MARKER]: true }, "");
    pushedRef.current = true;

    const onPopState = () => {
      // 뒤로가기가 우리 항목을 소비했다 — 되감을 것이 남지 않았다.
      pushedRef.current = false;
      closeRef.current();
    };

    window.addEventListener("popstate", onPopState);

    return () => {
      window.removeEventListener("popstate", onPopState);

      // 화면 안에서 닫힌 경우(「목록으로」 버튼 등) 쌓아둔 항목을 되돌린다.
      // 안 그러면 목록에서 뒤로가기를 두 번 눌러야 이전 메뉴로 나간다.
      if (!pushedRef.current) return;
      pushedRef.current = false;

      // 라우트가 이미 바뀌었으면(사이드바 이동) 건드리지 않는다 — 되감으면
      // 사용자의 이동을 취소하게 된다.
      if (window.location.pathname !== pathRef.current) return;

      window.history.back();
    };
  }, [isOpen]);
}
