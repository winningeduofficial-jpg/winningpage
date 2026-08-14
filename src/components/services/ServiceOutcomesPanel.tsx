// '달라지는 것들' — 그리드 자신이 카드(보더+배경+패딩)이고 자식은 divide-x 로 나뉜 셀인
// 단일 패널.
//
// (a) 출처: InDepthResearch.jsx OutcomesSection('심화탐구로 달라지는 것들').
//     헤더가 카드보다 149.5px 왼쪽에 매달린 시안 결함을 기준이 이미 정규화해
//     헤더 = 카드 = max-w-content 좌단 일치 + 패널 full-width 로 구현돼 있다.
//     자기평가의 lg:max-w-[54.6875rem] 패널 폭 제한도 같은 이유로 폐기된다.
//
// (b) 페이지별 차이 흡수:
//     - items.length 만으로 sm 이상 열 수가 결정된다(4장: 심화탐구・자기평가・수행평가,
//       5장: 목표관리). 별도 prop 이 없다.
//
// 페이지마다 있던 md 고정 높이(md:h-[10.75rem] / md:h-[10.625rem] + 셀 md:h-[8.75rem])는
// divide 선 길이를 높이로 제어하던 편법이자 한 요소 안 배율 혼용(3원칙 2번 위반)이라
// 전부 제거하고 자연 높이로 둔다.
//
// ⚠ Tailwind JIT: 열 수 매핑은 반드시 리터럴 lookup 객체로 쓴다.
// 지원 개수: 4(심화탐구・자기평가・수행평가) / 5(목표관리). 미등록 개수는 4열로 폴백한다
// (4페이지 중 3페이지가 4장 — 배열이 늘거나 줄어도 className 에 'undefined' 문자열이
// 박히는 조용한 회귀를 막는다).
const OUTCOME_COLS = { 4: "sm:grid-cols-4", 5: "sm:grid-cols-5" };

export default function ServiceOutcomesPanel({ items }) {
  return (
    // 보더/구분선은 #D9D9D9 / #D7D7D7 두 색을 dev 보더 토큰 #D7D7D7 하나로 통일했다.
    <div
      className={`mt-8 grid grid-cols-2 gap-6 rounded-xl border border-[#D7D7D7] bg-[#F9FAFB] px-6 py-[1.375rem] sm:mt-10 ${OUTCOME_COLS[items.length] ?? OUTCOME_COLS[4]} sm:gap-0 sm:divide-x sm:divide-[#D7D7D7] sm:px-4 lg:mt-[3.75rem]`}
    >
      {items.map((item) => (
        // 아이콘 100 × 0.7618 = 76.2px = 4.75rem, 아이콘↔라벨 18 → 13.75px = 0.875rem.
        // 라벨은 weight 600 / #525252 단일값 — 페이지별 md 반응형 오버라이드는 폐기.
        <div
          key={item.label}
          className="flex flex-col items-center gap-[0.875rem] px-4 py-2 text-center"
        >
          <img
            src={item.icon}
            alt=""
            aria-hidden="true"
            className="h-12 w-12 sm:h-[4.75rem] sm:w-[4.75rem]"
          />
          <p className="text-[1.125rem] font-semibold leading-[1.4] tracking-[-0.02em] text-[#525252]">
            {item.label}
          </p>
        </div>
      ))}
    </div>
  );
}
