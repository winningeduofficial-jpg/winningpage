// 추천 지원 서비스 카드 2장 — 490x201, border #d1e8ff, 순위 타이틀 + 본문 + 칩 4개.
// 칩은 StatusBadge(blue)와 동일 시각(bg #E9F4FF / text #496C99, 시안 팔레트)이나 폰트 크기만
// 달라 로컬 span 으로 구현(props 계약: RecommendServices 내부 전용, StatusBadge 미의존).
// props: { cards } = [{ rank, name, desc, chips: string[4] }] x0~2 — data.recommendations.
// R3(2026-08-11) — 2열 고정 카드(490×201)는 모바일 1열 스택으로, 높이·본문 폭 고정도 제거해
// 실제 텍스트 줄 수만큼 카드가 늘어나게 한다(칩 줄바꿈으로 인한 세로 잘림 방지).
// leadNote(F-05 · F-06) — '왜 카드가 적은지'를 설명하는 조건부 안내(중3 / 고3 6월 이후).
// prop 이름을 serviceLimit 이 아니라 일반명 leadNote 로 둔 이유: 학년별 제한 안내가 두 자리로
// 갈라지지 않게 같은 슬롯을 계속 재사용하기 위해서다. 조건 판정은 엔진이 소유한다(buildNotices).
//
// 빈 보더 박스(2026-08-21 사용자 확정) — 레이아웃 그리드는 항상 2칸이다. 엔진(추천 개수
// 게이트·SVC_NONE 폴백)은 건드리지 않는다 — 데이터가 1장·0장(SVC_NONE 안내 카드 1장)만
// 내려도, 이 컴포넌트가 남는 칸을 내용 없는 빈 보더 박스로 채워 그리드 2칸을 고정한다.
// 빈 박스는 형제 카드와 같은 fd-recommend-card 클래스(같은 보더·크기)를 그대로 쓰되 내용이
// 없어 장식 요소다 — aria-hidden.
import { withDedupedKeys } from "@/lib/reactKeys";
import ReportSection from "./ReportSection";

type RecommendCard = {
  rank?: string;
  name?: string;
  desc?: string;
  chips: string[];
};

type RecommendServicesProps = {
  cards: RecommendCard[];
  leadNote?: string | null;
};

const RecommendServices = ({
  cards,
  leadNote = null,
}: RecommendServicesProps) => {
  return (
    // fd-recommend-grid — 인쇄 훅(BLOCK 수정). report-print.css 가 기존 lg: 리터럴과 동일한
    // 값으로 강제한다. mt-12(2026-08-21) — 섹션 상단 마진 통일(완료 보고 표 근거)로 종전
    // mt-12 lg:mt-21.25 대신 lg: 분기 없는 값 하나 — fd-recommend-section 훅(구 margin-top
    // 강제)은 더 이상 필요 없어 클래스째 걷어냈다.
    <ReportSection title="추천 지원 서비스" className="mt-12">
      {/* 카드 **앞**이어야 기능한다 — 뒤에 있으면 '서비스가 부실하다'고 판단한 뒤에 읽힌다.
          인쇄 제외는 2페이지 flow 여유(52.6px) 보호 때문이며, PDF 에서도 카드 자체는 그대로다. */}
      {/* G-3(NIT 3) — 인쇄에서 display:none 인 화면 전용 문단이라 모바일 14px 를 유지할 이유가
          없다. 모바일 text-base(16px), 데스크톱만 기존 text-sm(14px) 유지. */}
      {leadNote && (
        <p className="fd-screen-only mt-4 w-full break-keep text-base leading-[1.45] text-ink-sub lg:w-250 lg:text-sm">
          {leadNote}
        </p>
      )}

      <div className="fd-recommend-grid mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
        {cards.map((card, index) => (
          <div
            key={card.rank || `card-${index}`}
            className="fd-recommend-card w-full rounded-xl border border-[#d1e8ff] px-3.25 py-4 lg:h-50.25 lg:w-122.5 lg:pl-3.25 lg:pr-0 lg:pt-4 lg:pb-0"
          >
            {/* 적합도 50 미만이라 추천 서비스가 하나도 없을 때(SVC_NONE 안내 카드)는 rank·name 이 비어
                제목 줄이 공백 한 칸만 렌더된다 — 빈 줄을 그리지 않고 안내 본문만 남긴다. */}
            {(card.rank || card.name) && (
              <h3 className="text-[1.1875rem] font-medium text-ink">
                {[card.rank, card.name].filter(Boolean).join(" ")}
              </h3>
            )}
            <p className="fd-recommend-desc mt-2 w-full text-base font-normal leading-[1.3] text-[#808080] lg:w-115.25">
              {card.desc}
            </p>
            <div className="mt-2.75 flex flex-wrap gap-x-5.5 gap-y-2">
              {withDedupedKeys(card.chips).map(({ item: chip, key }) => (
                <span
                  key={key}
                  className="inline-flex h-7 items-center justify-center rounded-xl bg-[#e9f4ff] px-2 py-1 text-[0.875rem] font-normal text-[#496c99]"
                >
                  {chip}
                </span>
              ))}
            </div>
          </div>
        ))}
        {/* 빈 보더 박스 — 그리드는 항상 2칸. 엔진이 낸 카드가 2장 미만이면 형제 카드와
            같은 fd-recommend-card(보더·크기)로 남는 칸을 채운다. 내용이 없는 장식 요소다. */}
        {Array.from({ length: Math.max(0, 2 - cards.length) }).map(
          (_, index) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: 내용 없는 장식용 빈 칸이라 인덱스 외 식별자가 없다 — 개수도 렌더마다 고정이다.
              key={`empty-${index}`}
              aria-hidden="true"
              className="fd-recommend-card w-full rounded-xl border border-[#d1e8ff] px-3.25 py-4 lg:h-50.25 lg:w-122.5 lg:pl-3.25 lg:pr-0 lg:pt-4 lg:pb-0"
            />
          ),
        )}
      </div>
    </ReportSection>
  );
};

export default RecommendServices;
