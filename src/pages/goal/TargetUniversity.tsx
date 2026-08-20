import { useEffect, useState } from "react";
import GoalCard from "@/components/goal/GoalCard";
import GoalPageHeader from "@/components/goal/GoalPageHeader";
import TargetUniversityCard from "@/components/goal/study/TargetUniversityCard";
import { fetchGoalStudent } from "@/lib/goalApi";
import {
  mapTargetUniversities,
  type TargetUniversitiesInput,
} from "@/lib/goal/targetUniversities";

// 내 목표 대학(#24) — 이상/최소 목표 대학 2카드(680×348). 대시보드 우측 레일과 같은
// mapTargetUniversities()(src/lib/goal/targetUniversities.ts)로 GET /api/goal/student
// 실데이터를 매핑한다(mock 삭제 UoW로 전면 재배선, 2026-08-20 — 이전엔 옛 목업 파일의
// 고정 mockTargetUniversities를 읽기 전용으로 썼다).
//
// "목표까지 남은 격차" 카드(GapToTargetCard)는 이번 범위에서 뺀다 — 내신·모의고사·학습
// 시간 격차 계산 로직이 아직 이식되지 않았다(별도 UoW로 재도입 예정). 컴포넌트 파일
// 자체(src/components/goal/study/GapToTargetCard.tsx)는 그대로 남겨 둔다.
//
// 편집 UI 미정의: 서브카피가 "목표를 바꾸면 격차 분석과 학습 시간이 다시 계산돼요"라 편집 진입점이
// 필요해 보이지만 시안(#24)에는 편집 버튼·모달이 전혀 없다(part-08 §331 "별도 확정 필요").
// 이번 구현은 읽기 전용으로 처리한다.

type GoalStudentResult =
  | { kind: "onboarded"; student: TargetUniversitiesInput }
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

  const { upper, lower } = mapTargetUniversities(result.student);

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
      </div>
    </>
  );
}
