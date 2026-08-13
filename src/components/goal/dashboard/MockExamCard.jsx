import { useEffect, useState } from "react";
import { addGoalGrade, fetchGoalGrades } from "../../../lib/goalApi";
import { recentHistory } from "../../../lib/goalGrades";
import DeltaBadge from "../DeltaBadge";
import GoalCard from "../GoalCard";
import GoalCardHeader from "../GoalCardHeader";
import GoalDdayBadge from "../GoalDdayBadge";
import GoalStatChip from "../GoalStatChip";
import AddMockExamGradeModal from "../modals/AddMockExamGradeModal";

// "모의고사" 카드(530×364 = 33.125rem×22.75rem, part-07 #20 정본 기준). 저장 후에는
// 4022:5403 변형으로 전환된다 — 하단이 "학습 조언"에서 "기록한 성적"(최근 3건, 회차/백분위/
// 전회 대비 증감) 표로 바뀐다. 두 상태가 공존하지 않는다는 시안 특이사항(4022-5403 문서
// #2 "기록 있으면 이력, 없으면 조언 분기 필요")을 그대로 분기 조건으로 채택했다.
//
// records는 이 위젯이 스스로 불러온다(모달 오픈 상태와 같은 이유 — 부모 Dashboard로
// 끌어올리지 않는다). Dashboard.jsx가 이미 fetchGoalStudent()를 한 번 부르지만 그 응답에는
// 회차별 기록이 없다(goal_students 원본 컬럼이 아니라 grades.js가 파생한 값이라서) — 별도
// 조회가 불가피하다.
export default function MockExamCard({ data }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [records, setRecords] = useState(null); // null = 로딩 중

  useEffect(() => {
    let alive = true;
    fetchGoalGrades().then((result) => {
      if (!alive) return;
      setRecords(result.kind === "ok" ? result.mockRecords : []);
    });
    return () => {
      alive = false;
    };
  }, []);

  async function handleSubmit(entry) {
    const result = await addGoalGrade("mock", entry);
    if (result.kind !== "success") {
      const detail =
        result.kind === "validation-error"
          ? result.detail
          : result.kind === "not-allowed"
            ? "이용권이 필요합니다."
            : "저장에 실패했습니다. 다시 시도해 주세요.";
      return { ok: false, detail };
    }
    setRecords(result.records);
    return { ok: true };
  }

  const history = recentHistory(records, 3);

  return (
    <GoalCard
      tone="neutral"
      className="flex h-full flex-col gap-5 px-[2rem] py-[1.75rem]"
    >
      <GoalCardHeader
        title="모의고사"
        action={
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="text-[0.8125rem] font-medium leading-[1.4] text-primary"
          >
            + 성적 추가
          </button>
        }
      />
      <div className="flex items-center gap-3">
        <span className="text-[1rem] font-semibold leading-[1.4] text-ink-strong">
          {data.round}
        </span>
        <GoalDdayBadge dday={data.dday} />
      </div>
      <GoalStatChip
        label={data.metricLabel}
        value={data.metricValue}
        tone="blue"
      />

      {history.length > 0 ? (
        <div className="mt-auto flex flex-col gap-2">
          <p className="text-[0.9375rem] font-bold leading-[1.4] text-ink-strong">
            기록한 성적
          </p>
          <div className="flex flex-col gap-2">
            {history.map((record) => (
              <div
                key={record.term}
                className="flex items-center justify-between text-[0.875rem] text-ink"
              >
                <span className="text-ink-strong">{record.term}</span>
                <div className="flex items-center gap-2">
                  <span>{record.value}</span>
                  {record.delta != null ? (
                    <DeltaBadge
                      value={`${record.delta > 0 ? "+" : ""}${record.delta}`}
                      direction={record.delta >= 0 ? "up" : "down"}
                      tone={record.delta >= 0 ? "positive" : "negative"}
                    />
                  ) : (
                    <span className="text-ink-sub">-</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-auto flex flex-col gap-2">
          <p className="text-[0.9375rem] font-bold leading-[1.4] text-ink-strong">
            학습 조언
          </p>
          <p className="text-[0.875rem] leading-[1.5] text-ink">
            {data.advice}
          </p>
        </div>
      )}

      <AddMockExamGradeModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={handleSubmit}
      />
    </GoalCard>
  );
}
