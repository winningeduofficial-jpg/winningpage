import GoalCard from "../GoalCard";

// #37 내신(과목군) / #38 정시(과목) 공용 카드(660×311) — part-13 구현 노트 "카드 4개는 과목군
// 단위 반복 컴포넌트 1개로 처리". name/badge 포맷만 데이터로 갈리고(국어군 vs 국어, `2.00 등급`
// vs `3등급 (백분위 81)`) 구조는 동일.
//
// 본문 폭 603px 고정 + 카드 높이 311px 고정이면 3줄 이상일 때 넘친다(part-13 §159) — 카드 높이를
// 고정하지 않고 min-height + 콘텐츠에 따라 자라도록 구현한다(고정 h 금지).
//
// materials(추천 교재/자료)는 선택 prop이다 — 실배선(api/goal/report.js)은 콘텐츠 추천 엔진이
// 없어 이 필드를 채우지 않는다(D13, 팀장 확정 "추천 교재 블록 렌더 생략"). materials가
// 비어 있으면 그 섹션 자체를 렌더하지 않는다(빈 타이틀+빈 wrap 잔여물 방지).
type SubjectDirectionCardProps = {
  name: string;
  zoneLabel?: string;
  badge?: string;
  body?: string;
  materials?: string[];
};

export default function SubjectDirectionCard({
  name,
  zoneLabel,
  badge,
  body,
  materials,
}: SubjectDirectionCardProps) {
  return (
    <GoalCard
      tone="neutral"
      className="flex min-h-[19.4375rem] flex-col gap-4 px-[1.875rem] py-[1.875rem]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <h3 className="text-[1.125rem] font-bold leading-[1.4] text-ink-strong">
            {name}
          </h3>
          <span className="text-[0.8125rem] leading-[1.4] text-ink-sub">
            {zoneLabel}
          </span>
        </div>
        <span className="inline-flex h-8 w-fit shrink-0 items-center rounded-full bg-[#E0DDF4] px-3 text-[0.8125rem] font-bold leading-[1.4] text-[#5B4E9E]">
          {badge}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-[0.75rem] font-semibold leading-[1.4] text-ink-sub">
          공부 방향
        </p>
        <p className="max-w-[37.6875rem] text-[0.875rem] leading-[1.6] text-ink">
          {body}
        </p>
      </div>

      {materials?.length > 0 && (
        <div className="mt-auto flex flex-col gap-2.5">
          <p className="text-[0.75rem] font-semibold leading-[1.4] text-ink-sub">
            추천 교재/자료
          </p>
          <div className="flex flex-wrap gap-2">
            {materials.map((material) => (
              <span
                key={material}
                className="inline-flex h-8 w-fit items-center rounded-full bg-goal-cardTone-cream px-3 text-[0.8125rem] font-medium leading-[1.4] text-ink-strong"
              >
                {material}
              </span>
            ))}
          </div>
        </div>
      )}
    </GoalCard>
  );
}
