import { useQuery } from "@tanstack/react-query";
import GoalCard from "@/components/goal/GoalCard";
import GoalPageHeader from "@/components/goal/GoalPageHeader";
import GapToTargetCard from "@/components/goal/study/GapToTargetCard";
import TargetUniversityCard from "@/components/goal/study/TargetUniversityCard";
import { useAuth } from "@/context/AuthProvider";
import { buildGapRows, buildZoneGapRows } from "@/lib/goal/gapToTarget";
import { mapTargetUniversities } from "@/lib/goal/targetUniversities";
import type { GoalStudentPayload } from "@/lib/goalApi";
import { goalStudentQueryOptions } from "@/lib/queryClient";

// 내 목표 대학(#24) — 이상/최소 목표 대학 2카드(680×348) + "목표까지 남은 격차" 행들.
// 대시보드 우측 레일과 같은 mapTargetUniversities()(src/lib/goal/targetUniversities.ts)로
// 상단 카드를 만든다(기획서 §3.16 실산출 전환, 2026-08-20 — 이전엔 GapToTargetCard를
// 렌더에서 뺐다).
//
// QA 행295(3구간 확장) 이후: 내신·모의고사는 buildZoneGapRows()로 최소/이상 두 컷을
// 함께 보여준다 — 더 이상 "이상 목표 한 기준"이 아니라서 기존 meta="이상 목표 기준"
// 문구는 뗀다(축마다 자기 컷을 행 설명에 직접 담는다). 학습 시간은 대학 컷이 아니라
// 학생 자신의 주간 목표 시간이라 min/ideal 이원 구조가 없다(gapToTarget.ts 주석 참고)
// — 기존 buildGapRows()를 그대로 재사용해 학습 시간 행만 뽑고 zone 행 뒤에 잇는다
// (2구간 studyGap 로직을 3구간용으로 다시 만들지 않는다).
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
  // ['goal','student', userId] 쿼리 캐시(src/lib/queryClient.ts)를 그대로 구독한다 —
  // goal 진입 시 미들웨어·Dashboard.tsx가 이미 채워둔 응답을 재사용해 이 페이지
  // 전용 재요청을 없앤다(명세 B-3 §5). 캐시 키의 userId는 리뷰 C1. RequireGoalAccess가
  // 이미 onboarded:true만 통과시키므로 정상 경로에선 kind는 항상 'onboarded'다 —
  // 그 외 kind는 Dashboard.jsx와 동일하게 방어적 분기다. isPending 동안은 로딩 중과
  // 동일하게 result === null로 취급한다.
  const { userId } = useAuth();
  const goalStudentQuery = useQuery(goalStudentQueryOptions(userId));
  const result = goalStudentQuery.isPending
    ? null
    : ((goalStudentQuery.data as GoalStudentResult | undefined) ?? null);

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

  // 내신·모의고사 — 최소/이상 목표 대학의 컷을 함께 넘겨 3구간으로 가른다.
  const zoneGapRows = buildZoneGapRows({
    naesin: {
      current: student.scores.convertedGrade,
      min: student.targets.min.naesinCut,
      ideal: student.targets.ideal.naesinCut,
    },
    mogo: {
      current: student.scores.currentMogo,
      min: student.targets.min.jungsiCut,
      ideal: student.targets.ideal.jungsiCut,
    },
  });
  // 학습 시간 — 대학 컷이 없는 축이라 기존 2구간 buildGapRows에서 그 행만 뽑는다
  // (naesin/mogo는 null을 넘겨 행을 만들지 않는다).
  const studyGapRows = buildGapRows({
    naesin: { current: null, target: null },
    mogo: { current: null, target: null },
    study: {
      current: student.recentAvgStudyHours,
      // weekIdeal은 주간 목표 시간(요일별 합) — 일일 목표는 7로 나눠 근사한다.
      target: student.weekIdeal > 0 ? student.weekIdeal / 7 : null,
    },
  });
  const gapRows = [...zoneGapRows, ...studyGapRows];

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
        {/* 전 축이 산출 불가면(온보딩 직후 등) 두 빌더가 모두 빈 배열을 돌려주고,
            카드 자체를 숨긴다 — 빈 카드로 억지 렌더하지 않는다. */}
        {gapRows.length > 0 && <GapToTargetCard rows={gapRows} />}
      </div>
    </>
  );
}
