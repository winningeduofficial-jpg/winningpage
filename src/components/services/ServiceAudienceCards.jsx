import { CARD_DESC_CLASS, CARD_TITLE_CLASS } from "./serviceTokens";

// cardSurface: 리터럴 lookup — 클래스 문자열 템플릿 조립 금지 규약(SECTION_SURFACE 와 동일).
const AUDIENCE_CARD_SURFACE = {
  muted: "bg-[#F9FAFB]",
  white: "bg-white",
};

// '이런 학생에게 추천해요' 이미지 카드 4장.
//
// (a) 출처: InDepthResearch.jsx AudienceSection 의 카드 행. 4페이지 모두 정확히 4장이라
//     lg 열 수는 4로 고정한다.
//
// (b) 페이지별 차이 흡수:
//     - imageFit : 'contain'(기본) | 'cover'.
//       일러스트 PNG 는 원본 비율이 제각각이라 잘림 없는 contain(기준),
//       학생 사진 JPG 는 cover 가 맞다. 콘텐츠 성격상 불가피한 차이라
//       유일하게 남긴 조절 prop 이다. 그 외 카드 표면・타이포는 전부 고정이다.
//     - cardSurface : 카드 배경. 기본 'muted'(bg-[#F9FAFB])는 4페이지 흰 배경 기준과
//       문자 동일. 회색 밴드 위에 얹히는 콜멘토 §4 전용으로 'white' 를 넘기면 밴드와
//       카드가 구분된다 — #F4F4F6 밴드 위 #F9FAFB 카드는 명도차가 육안 한계라 묻힌다.
//
// 이미지 영역은 고정 높이 h-[10.5rem] 하나로 통일한다 — 시안 인셋이 카드마다 6~36px 로
// 제각각인 것은 원본 일러스트 여백 차이를 눈대중으로 얹은 것이라 재현하지 않는다.
// 레터박스 여백은 카드 배경이 그대로 채운다.
export default function ServiceAudienceCards({
  items,
  imageFit = "contain",
  cardSurface = "muted",
}) {
  return (
    <div className="mt-10 grid grid-cols-1 gap-4 sm:mt-12 sm:grid-cols-2 lg:mt-[3.75rem] lg:grid-cols-4">
      {items.map((item) => (
        <article
          key={item.title}
          className={`flex flex-col overflow-hidden rounded-2xl ${AUDIENCE_CARD_SURFACE[cardSurface]} text-left transition hover:-translate-y-1 hover:shadow-[0_1rem_2rem_rgba(82,82,82,0.14)]`}
        >
          <img
            src={item.image}
            alt={item.title}
            className={`h-[10.5rem] w-full ${imageFit === "cover" ? "object-cover" : "object-contain"}`}
          />
          {/* 제목↔본문 간격 23px, 하단 패딩 39px, 상단 28px, 좌우 26px ≈ px-6. */}
          <div className="flex flex-1 flex-col gap-[1.4375rem] px-6 pb-[2.4375rem] pt-[1.75rem]">
            <p className={CARD_TITLE_CLASS}>{item.title}</p>
            <p className={CARD_DESC_CLASS}>{item.desc}</p>
          </div>
        </article>
      ))}
    </div>
  );
}
