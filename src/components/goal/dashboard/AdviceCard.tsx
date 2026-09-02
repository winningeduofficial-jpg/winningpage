import GoalCard from "@/components/goal/GoalCard";

// "오늘의 조언" 카드(530×194 = 33.125rem×12.125rem, part-07 #20 y=700) — 카드 타이틀 + 본문만
// 렌더한다. 조언 뱃지("일일 분석 조언"/"AI 입시 분석 조언")는 이 카드 소속이 아니라 페이지
// 헤더(y=100, `DashboardPageHeader`)에 있다(part-07 §126 실측 정정, 2026-08-10 — 직전 작업에서
// 이 카드 안에 뱃지를 넣었던 것은 잘못된 지시에 따른 것이었다).
//
// QA 행295·306 — 본문은 GET /api/goal/advice의 오늘 섹션(라벨 소제목 + 본문, "오늘의
// 조언"/"AI 입시조언")만 그린다. "내일 계획 제시"/"다음 계획 제시" 섹션은 TomorrowPlanCard
// 소유로 옮겨 텍스트 중복을 없앴다(팀장 후속 지시, 2026-09-02). 학과 팁(majorTips)은 이
// 카드에 그대로 둔다(다른 카드에 자리가 없어 이 카드가 소유, 판단 지점 유지).
//
// data가 null(아직 생성 전/조회 중)이면 제목만 렌더하고 본문은 비운다(no-fallback-constants
// — "준비 중" 같은 placeholder 문구를 쓰지 않는다). 스켈레톤은 선택 사항이라 만들지 않았다.
export type AdviceCardSection = { label: string; body: string };
export type AdviceCardMajorTip = { department: string; text: string };

export type AdviceCardData = {
  section: AdviceCardSection;
  majorTips: AdviceCardMajorTip[];
} | null;

type AdviceCardProps = {
  data: AdviceCardData;
};

export default function AdviceCard({ data }: AdviceCardProps) {
  return (
    <GoalCard tone="neutral" className="flex h-full flex-col gap-4 px-8 py-7">
      <h3 className="text-[1.125rem] font-bold leading-[1.4] text-ink-strong">
        오늘의 조언
      </h3>
      {data && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <p className="text-[0.8125rem] font-semibold leading-[1.4] text-ink-sub">
              {data.section.label}
            </p>
            <p className="text-[0.875rem] leading-normal text-ink">
              {data.section.body}
            </p>
          </div>
          {data.majorTips.length > 0 && (
            <div className="flex flex-col gap-3">
              {data.majorTips.map((tip) => (
                <div key={tip.department} className="flex flex-col gap-1">
                  <p className="text-[0.8125rem] font-semibold leading-[1.4] text-ink-sub">
                    [{tip.department}]
                  </p>
                  <p className="text-[0.875rem] leading-normal text-ink">
                    {tip.text}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </GoalCard>
  );
}
