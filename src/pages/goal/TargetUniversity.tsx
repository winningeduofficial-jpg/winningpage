import { useEffect, useState } from "react";
import GoalCard from "@/components/goal/GoalCard";
import GoalPageHeader from "@/components/goal/GoalPageHeader";
import GapToTargetCard from "@/components/goal/study/GapToTargetCard";
import TargetUniversityCard from "@/components/goal/study/TargetUniversityCard";
import { buildGapRows } from "@/lib/goal/gapToTarget";
import { mapTargetUniversities } from "@/lib/goal/targetUniversities";
import { fetchGoalStudent, type GoalStudentPayload } from "@/lib/goalApi";

// 내 목표 대학(#24) — 이상/최소 목표 대학 2카드(680×348) + "목표까지 남은 격차" 3행.
// 대시보드 우측 레일과 같은 mapTargetUniversities()(src/lib/goal/targetUniversities.ts)로
// 상단 카드를, buildGapRows()(src/lib/goal/gapToTarget.ts)로 하단 격차 카드를 만든다
// (기획서 §3.16 실산출 전환, 2026-08-20 — 이전엔 GapToTargetCard를 렌더에서 뺐다).
// 격차의 기준 대학은 항상 이상 목표다(§3.4 "학습량 산출의 상한선") — GapToTargetCard의
// meta 슬롯에 "이상 목표 기준"을 한 번만 얹어 모호성을 없앤다(행마다 반복하지 않는다).
//
// 편집 UI 미정의: 서브카피가 "목표를 바꾸면 격차 분석과 학습 시간이 다시 계산돼요"라 편집 진입점이
// 필요해 보이지만 시안(#24)에는 편집 버튼·모달이 전혀 없다(part-08 §331 "별도 확정 필요").
// 이번 구현은 읽기 전용으로 처리한다.

type GoalStudentResult =
  | { kind: "onboarded"; student: GoalStudentPayload }
  | {
      kind:
        | "no-session"
        | "error"
        | "not-allowed"
        | "not-onboarded"
        | "awaiting-cuts";
    };

export default function TargetUniversity() {
  // null = 로딩 중. RequireGoalAccess가 이미 onboarded:true만 통과시키므로 정상 경로에선
  // result.kind는 항상 'onboarded'다 — 그 외 kind는 Dashboard.jsx와 동일하게 방어적 분기다.
  const [result, setResult] = useState<GoalStudentResult | null>(null);

  useEffect(() => {
    let alive = true;
    fetchGoalStudent().then((r) => {
      if (alive) setResult(r as GoalStudentResult);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (result === null || result.kind !== "onboarded") {
    const message =
      result?.kind === "awaiting-cuts"
        ? "합격 기준 데이터를 준비 중입니다. 잠시 후 다시 확인해 주세요."
        : result === null
          ? "목표 대학 정보를 불러오는 중입니다…"
          : "목표 대학 정보를 불러오지 못했습니다. 새로고침해 주세요.";
    return (
      <>
        <GoalPageHeader
          title="내 목표 대학"
          subcopy="이상 목표와 최소 목표를 이원으로 관리합니다. 목표를 바꾸면 격차 분석과 학습 시간이 다시 계산돼요."
        />
        <div className="max-w-goal-content flex flex-col gap-5 px-12 pb-24">
          <GoalCard tone="neutral" className="px-8 py-7">
            <p className="text-[0.9375rem] leading-[1.4] text-ink-sub">
              {message}
            </p>
          </GoalCard>
        </div>
      </>
    );
  }

  const { student } = result;
  const { upper, lower } = mapTargetUniversities(student);

  // 기준 대학은 항상 이상 목표(targets.ideal) — buildGapRows 자체는 축 중립적이라
  // "어느 대학 기준인지"는 여기서 인자로 고정한다.
  const gapRows = buildGapRows({
    naesin: {
      current: student.scores.convertedGrade,
      target: student.targets.ideal.naesinCut,
    },
    mogo: {
      current: student.scores.currentMogo,
      target: student.targets.ideal.jungsiCut,
    },
    study: {
      current: student.recentAvgStudyHours,
      // weekIdeal은 주간 목표 시간(요일별 합) — 일일 목표는 7로 나눠 근사한다.
      target: student.weekIdeal > 0 ? student.weekIdeal / 7 : null,
    },
  });

  return (
    <>
      <GoalPageHeader
        title="내 목표 대학"
        subcopy="이상 목표와 최소 목표를 이원으로 관리합니다. 목표를 바꾸면 격차 분석과 학습 시간이 다시 계산돼요."
      />
      <div className="max-w-goal-content flex flex-col gap-5 px-12 pb-24">
        <div className="grid grid-cols-2 gap-5">
          <TargetUniversityCard
            label={upper.label}
            university={upper.university}
            department={upper.department}
            susiRate={upper.susiRate}
            jeongsiRate={upper.jeongsiRate}
            jungsiAvailable={upper.jungsiAvailable}
          />
          <TargetUniversityCard
            label={lower.label}
            university={lower.university}
            department={lower.department}
            susiRate={lower.susiRate}
            jeongsiRate={lower.jeongsiRate}
            jungsiAvailable={lower.jungsiAvailable}
          />
        </div>
        {/* 3행 전부 산출 불가면(온보딩 직후 등) buildGapRows가 빈 배열을 돌려주고,
            카드 자체를 숨긴다 — 빈 카드로 억지 렌더하지 않는다. */}
        {gapRows.length > 0 && (
          <GapToTargetCard rows={gapRows} meta="이상 목표 기준" />
        )}
      </div>
    </>
  );
}
