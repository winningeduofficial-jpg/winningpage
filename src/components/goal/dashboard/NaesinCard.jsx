import { useState } from "react";
import GoalCard from "../GoalCard";
import GoalCardHeader from "../GoalCardHeader";
import GoalStatChip from "../GoalStatChip";
import AddNaesinGradeModal from "../modals/AddNaesinGradeModal";
import { addGoalGrade } from "../../../lib/goalApi";

// "내신" 카드(530×364, part-07 #20 정본 기준) — 모의고사 카드와 짝을 이루는 2열 레이아웃.
// mockAdvice.naesin에는 dday 필드가 남아 있으나(mockExam과 동일 스키마를 재사용한 흔적) #20
// 카피 전문에는 내신 카드에 D-day가 없다 — 여기서는 의도적으로 렌더하지 않는다.
//
// 저장 후에도 "학습 조언" 블록을 유지한다(모의고사 카드와 달리 "기록한 성적" 이력으로
// 전환하지 않는다) — 4022:5403 시안이 모의고사 카드만 변형하고 내신 카드는 그대로 두는
// 비대칭 그대로다(작업 지시 "내신 카드는 조언 유지"). 따라서 이 카드는 회차 기록을 따로
// 조회하지 않는다 — 저장 결과를 반영할 화면 요소가 없다(모달만 닫힌다).
export default function NaesinCard({ data }) {
  const [modalOpen, setModalOpen] = useState(false);

  async function handleSubmit(entry) {
    const result = await addGoalGrade("naesin", entry);
    if (result.kind !== "success") {
      const detail =
        result.kind === "validation-error"
          ? result.detail
          : result.kind === "not-allowed"
            ? "이용권이 필요합니다."
            : "저장에 실패했습니다. 다시 시도해 주세요.";
      return { ok: false, detail };
    }
    return { ok: true };
  }

  return (
    <GoalCard
      tone="neutral"
      className="flex h-full flex-col gap-5 px-[2rem] py-[1.75rem]"
    >
      <GoalCardHeader
        title="내신"
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
      <span className="text-[1rem] font-semibold leading-[1.4] text-ink-strong">
        {data.round}
      </span>
      <GoalStatChip
        label={data.metricLabel}
        value={data.metricValue}
        tone="purple"
      />
      <div className="mt-auto flex flex-col gap-2">
        <p className="text-[0.9375rem] font-bold leading-[1.4] text-ink-strong">
          학습 조언
        </p>
        <p className="text-[0.875rem] leading-[1.5] text-ink">{data.advice}</p>
      </div>

      <AddNaesinGradeModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={handleSubmit}
      />
    </GoalCard>
  );
}
