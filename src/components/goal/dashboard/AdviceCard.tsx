import GoalCard from "@/components/goal/GoalCard";

// "오늘의 조언" 카드(530×194 = 33.125rem×12.125rem, part-07 #20 y=700) — 카드 타이틀 + 본문만
// 렌더한다. 조언 뱃지("일일 분석 조언"/"AI 입시 분석 조언")는 이 카드 소속이 아니라 페이지
// 헤더(y=100, `DashboardPageHeader`)에 있다(part-07 §126 실측 정정, 2026-08-10 — 직전 작업에서
// 이 카드 안에 뱃지를 넣었던 것은 잘못된 지시에 따른 것이었다).
//
// QA 행295·306 — 본문은 이제 GET /api/goal/advice의 sections(라벨 소제목 + 본문)를 그대로
// 그린다(오늘의 조언/AI 입시조언 + 내일 계획 제시/다음 계획 제시). 학과 팁(majorTips)은 이
// 엔드포인트가 만드는 세 번째 콘텐츠 조각이라 별도 소제목으로 함께 붙인다 — 다른 카드에
// 자리가 없다(팀장 지시에 배치처가 명시되지 않아 이 카드가 소유, 판단 지점).
//
// data가 null(아직 생성 전/조회 중)이면 제목만 렌더하고 본문은 비운다(no-fallback-constants
// — "준비 중" 같은 placeholder 문구를 쓰지 않는다). 스켈레톤은 선택 사항이라 만들지 않았다.
export type AdviceCardSection = { label: string; body: string };
export type AdviceCardMajorTip = { department: string; text: string };

export type AdviceCardData = {
  sections: AdviceCardSection[];
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
          {data.sections.map((section) => (
            <div key={section.label} className="flex flex-col gap-1">
              <p className="text-[0.8125rem] font-semibold leading-[1.4] text-ink-sub">
                {section.label}
              </p>
              <p className="text-[0.875rem] leading-normal text-ink">
                {section.body}
              </p>
            </div>
          ))}
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
