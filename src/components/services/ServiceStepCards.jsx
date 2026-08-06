// 'N단계로 차근차근' 계열 텍스트 전용 스텝 카드.
//
// (a) 출처: InDepthResearch.jsx FiveStepsSection('다섯 단계로 차근차근')의 1행+2행 카드.
//     기준이 1행/2행 마크업을 그대로 복붙해 두 벌 갖고 있던 것을 StepCard 하나로 접었다.
//     수행평가 StageSummarySection(4장 1행), 목표관리 ManagementSection(6장 3열 2행)도
//     카드 마크업이 100% 동일해 새 컴포넌트를 만들지 않고 여기로 흡수한다.
//
// (b) 페이지별 차이 흡수:
//     - columns      : 3(기본) | 4 — lg 열 수. 5개(3+2) / 6개(3열 2행)는 3, 4개 1행은 4.
//     - splitLastRow : true 면 앞 columns 개를 1행, 나머지를 2행으로 중앙 배치한다.
//                      2행의 lg:max-w-[45.25rem] 이 '카드 2장' 기준 실측값이라
//                      columns=3 + items 5개 조합에서만 지원한다.
//
import { CARD_TITLE_CLASS, CARD_DESC_MUTED_CLASS } from './serviceTokens';

// ⚠ Tailwind JIT: columns→클래스 매핑은 반드시 아래처럼 리터럴 lookup 객체로 쓴다.
//    `lg:grid-cols-${n}` 템플릿 조립은 클래스가 생성되지 않아 조용히 깨진다.
// 지원 개수: 3(기본값, 심화탐구・자기평가・목표관리 ManagementSection) / 4(수행평가). 미등록
// columns 는 3열로 폴백한다(기본값과 동일 — className 에 'undefined' 문자열이 박히는 걸 막는다).
const STEP_COLS = { 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4' };

// 패딩은 시안 실효 pt 44 / pb 40 / px 30.5 → ×0.766 = 34 / 30 / 23.
// radius 12는 스케일 미적용(rounded-xl 유지). 설명 색 #808080 → #767676 상향(회색 하한).
const STEP_CARD_CLASS = 'rounded-xl bg-[#F5F5F7] px-6 pb-[1.875rem] pt-[2.125rem]';

function StepCard({ item }) {
  return (
    <div className={STEP_CARD_CLASS}>
      <p className={CARD_TITLE_CLASS}>{item.title}</p>
      <p className={`mt-[0.9375rem] ${CARD_DESC_MUTED_CLASS}`}>{item.desc}</p>
    </div>
  );
}

export default function ServiceStepCards({ items, columns = 3, splitLastRow = false }) {
  const firstRow = splitLastRow ? items.slice(0, columns) : items;
  const secondRow = splitLastRow ? items.slice(columns) : [];

  return (
    <>
      <div
        className={`mt-10 grid grid-cols-1 gap-5 sm:mt-12 sm:grid-cols-2 lg:mt-[3.75rem] ${STEP_COLS[columns] ?? STEP_COLS[3]} lg:gap-[1.875rem]`}
      >
        {firstRow.map((item) => (
          <StepCard key={item.title} item={item} />
        ))}
      </div>
      {secondRow.length > 0 && (
        // 2행 — 946 × 0.7644 = 723px = 45.25rem 로 1행 안에서 정중앙.
        // 폭 검산: (724 − 30) / 2 = 347px ✓ (1행 카드폭 346.7과 일치)
        <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:mx-auto lg:mt-[1.875rem] lg:max-w-[45.25rem] lg:gap-[1.875rem]">
          {secondRow.map((item) => (
            <StepCard key={item.title} item={item} />
          ))}
        </div>
      )}
    </>
  );
}
