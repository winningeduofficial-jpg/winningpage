import { Search } from "lucide-react";

/**
 * 게시판(회사소식·공지사항) 목록 공통 검색 입력.
 *
 * 마크업·토큰은 `src/pages/Faq.jsx:132-144`의 검색바가 정본이다.
 * 그대로 이식하고 문구/폭 판단만 아래 주석대로 조정했다.
 *
 * 제어(controlled) 컴포넌트다 — 내부 상태를 두지 않는다.
 * 소비자 계약(중요): `onChange`로 검색어가 바뀌면 부모는 **반드시 페이지를 1로 리셋**해야 한다.
 *    (`AdmissionGuidelines.jsx:1262,1270,1278,1283`처럼 필터 변경 지점마다 `setCurrentPage(1)`을
 *     수동 반복하는 구조는 한 곳만 빠져도 깨진다. 3페이지에서 검색하면 결과가 1페이지뿐인데
 *     빈 화면이 뜬다.)
 *    예) onChange={(next) => { setKeyword(next); setPage(1); }}
 *
 * @param {object}   props
 * @param {string}   props.value        현재 검색어 (필수, 제어 값)
 * @param {(next: string) => void} props.onChange  변경된 문자열을 인자로 받는다 (이벤트 객체 아님)
 * @param {string}   props.ariaLabel    스크린리더용 라벨. 예: '회사소식 검색'
 * @param {string}  [props.placeholder] 기본 '검색'
 * @param {string}  [props.className]   래퍼에 덧붙일 유틸리티 클래스
 */
export default function BoardSearchBar({
  value,
  onChange,
  ariaLabel,
  placeholder = "검색",
  className = "",
}) {
  return (
    // 폭: 시안 검색바는 505×68이지만 Faq 정본의 sm:w-[23.625rem](378px) / h-11(44px)을 따른다.
    // 505×0.766(게시판 시안 스케일 팩터) = 386.8px = 24.18rem 으로 정본과 9px 차이뿐이고,
    // 같은 시안 계열에서 근사한 값이 여러 개 나올 때 하나로 수렴시키는 것이
    // src/pages/admissionResults/SearchView.jsx 의 선례('시안 간격 3종을 재현하지 않고
    // 하나로 수렴')와 일치한다.
    // 시안에 붙어 있던 '대학' 드롭다운은 제거 확정(다른 화면 복붙 잔재) — 폭 근거도 그만큼 약하다.
    <div
      className={`relative h-11 w-full rounded-[0.625rem] border border-[#D7D7D7] bg-white sm:w-[23.625rem] sm:self-end ${className}`}
    >
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="h-full w-full bg-transparent pl-5 pr-12 text-base font-semibold text-[#525252] outline-none placeholder:text-[#D7D7D7]"
      />
      {/* 시안은 돋보기를 36×36 버튼으로 그렸지만 장식 아이콘으로 둔다.
          검색이 입력 즉시 클라이언트 필터링이라 제출 트리거가 없고, 아무 동작도 없는
          버튼은 키보드 포커스를 먹는 빈 탭 스톱이 된다(접근성 악화). Faq 정본도 동일. */}
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute right-5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#1F1F1F]"
      />
    </div>
  );
}
