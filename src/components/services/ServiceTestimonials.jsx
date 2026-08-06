// 후기 카드 — figure / blockquote / figcaption 시맨틱, 인용문 → 이름 순(기준 리듬).
//
// (a) 출처: InDepthResearch.jsx TestimonialsSection.
//     수행평가는 이름행이 위, 인용문이 아래였으나 기준 순서로 뒤집어 수렴한다.
//
// (b) 페이지별 차이 흡수:
//     - columns   : 2 | 3(기본) — 후기 개수가 페이지마다 다르다(수행평가 2장, 나머지 3장).
//     - items[].emoji : 없으면 '😉' 기본값(목표관리가 현재 하드코딩하는 값과 동일).
//     - items[].tag   : 있으면 이름 아래 줄바꿈으로 렌더한다(수행평가・목표관리 카피 보존).
//                       카피 문자열 자체는 각 페이지 데이터 그대로다.
//
// ⚠ Tailwind JIT: 열 수 매핑은 반드시 리터럴 lookup 객체로 쓴다.
// 지원 개수: 2(수행평가) / 3(기본값, 심화탐구・자기평가・목표관리). 미등록 columns 는 3열로
// 폴백한다(기본값과 동일 — className 에 'undefined' 문자열이 박히는 걸 막는다).
const TESTIMONIAL_COLS = { 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3' };

export default function ServiceTestimonials({ items, columns = 3 }) {
  return (
    <div
      className={`mt-10 grid grid-cols-1 gap-5 sm:mt-12 lg:mt-[3.75rem] ${TESTIMONIAL_COLS[columns] ?? TESTIMONIAL_COLS[3]} lg:gap-[2.875rem]`}
    >
      {items.map((item) => (
        // radius 40 → 30.6px = rounded-[2rem], padding 40 → 30.6px = p-[1.875rem],
        // 그림자 offset(0,2)/blur 4/rgba(213,213,213,0.25)는 시안 실측 그대로.
        <figure
          key={item.quote}
          className="flex h-full flex-col justify-between rounded-[2rem] bg-[#F9FAFB] p-[1.875rem] text-left shadow-[0_0.125rem_0.25rem_rgba(213,213,213,0.25)]"
        >
          <blockquote className="break-keep text-[1.0625rem] font-normal leading-[1.5] text-[#525252]">
            “{item.quote}”
          </blockquote>
          {/* 이름 색 #808080은 가독성 하한 미달 → #767676. 이모지는 #F1F1F1 원형 칩. */}
          <figcaption className="mt-[0.9375rem] flex items-center gap-3">
            <span
              aria-hidden="true"
              className="flex h-[3.25rem] w-[3.25rem] items-center justify-center rounded-full bg-[#F1F1F1] text-[1.75rem]"
            >
              {item.emoji ?? '😉'}
            </span>
            <span className="text-[0.875rem] font-medium text-[#767676]">
              {item.name}
              {item.tag ? (
                <>
                  <br />
                  {item.tag}
                </>
              ) : null}
            </span>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
