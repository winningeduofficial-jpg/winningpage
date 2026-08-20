import { useEffect, useState } from "react";
import AchievementChart from "@/components/goal/dashboard/AchievementChart";
import AdviceCard from "@/components/goal/dashboard/AdviceCard";
import DashboardPageHeader from "@/components/goal/dashboard/DashboardPageHeader";
import MockExamCard from "@/components/goal/dashboard/MockExamCard";
import NaesinCard from "@/components/goal/dashboard/NaesinCard";
import RankingRail from "@/components/goal/dashboard/RankingRail";
import ScheduleRail from "@/components/goal/dashboard/ScheduleRail";
import StudyPlanRail from "@/components/goal/dashboard/StudyPlanRail";
import TargetUniversityRail from "@/components/goal/dashboard/TargetUniversityRail";
import TodayGoalCard from "@/components/goal/dashboard/TodayGoalCard";
import TomorrowPlanCard from "@/components/goal/dashboard/TomorrowPlanCard";
import GoalCard from "@/components/goal/GoalCard";
import { QUICK_ADD_HOURS } from "@/components/goal/goalFormOptions";
import { getSubjectLabel } from "@/components/goal/subjectTokens";
import { TIMER_SUBJECT_ORDER } from "@/components/goal/studyRecordOptions";
import {
  getDayIndexFromYMDServer,
  kstYMD,
  VIRTUAL_DAY_NAMES,
} from "@/lib/goal/calc/index.js";
import {
  formatScheduleDday,
  formatScheduleMeta,
} from "@/lib/goal/scheduleDday";
import {
  fetchGoalRanking,
  fetchGoalSchedules,
  fetchGoalStudent,
  fetchGoalTimer,
  fetchTodayGoalRecord,
} from "@/lib/goalApi";
import { mapTargetUniversities } from "@/lib/goal/targetUniversities";
import { formatTodayDateLabel } from "@/lib/goalPlanUtils";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// AI 조언 생성 로직은 이식 대상이 아니다(docs/figma-goal/calc-port-status.md §9.2) —
// 대신 서비스기획서 §3.16 규칙 기반 3요소를 조립한다: ① 확률 요약(웰컴 카드 body) ②
// 오늘의 조언(웰컴 카드 headline, buildTodayHeadline) ③ 내일 계획(TomorrowPlanCard,
// buildTomorrowPlan). "AI 입시 분석 조언" 뱃지 문구는 UI 명칭으로 유지하되 실제로는
// AI 생성이 아니다 — 학생명은 넣지 않는다(사이드바가 이미 표기).
//
// 컴플라이언스(고객사 확정): "반드시/100%/보장" 같은 확정 단정, "늦었다/돌이킬 수
// 없다" 같은 공포 소구, "의지가 약하다" 같은 낙인 문구를 절대 쓰지 않는다 — 아래
// 문구들은 전부 중립·격려 톤으로만 작성한다.

/** 소수 시간을 "N시간 M분"/"N시간"/"M분"으로. 0 이하는 호출부가 걸러야 한다. */
function formatHoursLabel(hours: number): string {
  const totalMinutes = Math.max(0, Math.round(hours * 60));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h <= 0) return `${m}분`;
  if (m <= 0) return `${h}시간`;
  return `${h}시간 ${m}분`;
}

/**
 * 웰컴 카드 headline — "오늘의 조언". 오늘 기록(studyHours)과 오늘 이상 목표 시간만
 * 비교하는 규칙 기반 문구다(AI 생성 아님). idealHours<=0은 스케줄 미설정(온보딩
 * 직후 등)이라 시간 언급 없이 시작을 권한다.
 */
function buildTodayHeadline(idealHours: number, studyHours: number): string {
  if (studyHours <= 0) {
    return idealHours > 0
      ? `아직 오늘의 학습 기록이 없어요. 오늘 목표는 ${formatHoursLabel(idealHours)}이에요.`
      : "아직 오늘의 학습 기록이 없어요. 오늘부터 시작해볼까요?";
  }
  const remaining = idealHours - studyHours;
  if (idealHours <= 0 || remaining <= 0) {
    return "오늘 목표를 지켰어요! 이 페이스를 이어가 봐요.";
  }
  return `오늘 목표까지 ${formatHoursLabel(remaining)} 남았어요.`;
}

/**
 * 웰컴 카드 body — 확률 요약(§3.16 ①). 정시 컷 미확보(jungsiAvailable=false)면
 * 대시보드 레일과 같은 규약으로 "미산출"을 쓴다.
 */
function buildProbabilitySummary(
  targetUniversities: ReturnType<typeof mapTargetUniversities>,
): string {
  const { upper, lower } = targetUniversities;
  const jeongsiLabel = (block: typeof upper) =>
    block.jungsiAvailable ? `${block.jeongsiRate}%` : "미산출";
  return (
    `이상 ${upper.university} 수시 ${upper.susiRate}%·정시 ${jeongsiLabel(upper)}` +
    ` / 최소 ${lower.university} 수시 ${lower.susiRate}%·정시 ${jeongsiLabel(lower)}`
  );
}

// ---------------------------------------------------------------------------
// GET /api/goal/student → 4개 실데이터 카드(TargetUniversityRail/MockExamCard/
// NaesinCard/TodayGoalCard) prop 매핑. api/_lib/goalRepo.js buildStudentPayload()
// 반환 shape을 기준으로 한다(임무 지시 "서버 계약" 절 그대로, 코드로 재확인 완료).
//
// 확률 스케일 확인: src/lib/goal/calc/pipeline.test.js가 idealSusi===100(포화)을
// 검증하므로 probs.* 는 0~100 스케일이다 — TargetUniversityRail의 susiRate/jeongsiRate
// (GoalProgressBar max=100, `{value}%`로 직접 렌더)와 스케일이 이미 일치해 변환은
// "반올림"뿐이다(소수점 노출 방지, 표시 목적).
// ---------------------------------------------------------------------------

// api/_lib/goalRepo.js buildStudentPayload() 반환 shape 중 이 페이지가 실제로 읽는 필드만.
type GoalStudent = {
  jungsiAvailable: boolean;
  targets: {
    ideal: { university: string; department: string };
    min: { university: string; department: string };
  };
  probs: {
    idealSusi?: number | null;
    idealJungsi?: number | null;
    minSusi?: number | null;
    minJungsi?: number | null;
  };
  weeklySchedule?: Record<string, { ideal: number; min: number }>;
  scores: {
    lastMogoExam?: string | null;
    currentMogo?: number | null;
    lastNaesinExam?: string | null;
    convertedGrade?: number | null;
  };
  probabilityHistory: Array<{
    recordedAt: string;
    idealSusi?: number | null;
    idealJungsi?: number | null;
    minSusi?: number | null;
    minJungsi?: number | null;
  }>;
};

type DailyRecordResult =
  | { kind: "success"; record: { studyHours?: number } | null }
  | { kind: "no-session" | "not-allowed" | "not-active" | "error" };

type RankingResult =
  | {
      kind: "ok";
      top: Array<{ rank: number; name: string; hours: number }>;
      me: { rank: number; name: string; hours: number } | null;
    }
  | { kind: "no-session" | "not-allowed" | "error" };

type ScheduleItem = {
  id?: number | string;
  title: string;
  dueDate: string;
  memo?: string | null;
};

type GoalStudentResult =
  | { kind: "onboarded"; student: GoalStudent }
  | {
      kind:
        | "no-session"
        | "error"
        | "not-allowed"
        | "not-onboarded"
        | "awaiting-cuts";
    };

type SchedulesResult =
  | { kind: "success"; schedules: ScheduleItem[] }
  | { kind: "no-session" | "not-allowed" | "error" };

/**
 * 주어진 시각이 속한 KST 요일의 student.weeklySchedule 항목. 오늘의 목표 카드(같은
 * 날)와 내일 계획 카드(다음 날, `now`에 +1일한 Date를 넘긴다)가 공유한다.
 * 스케줄이 없으면(온보딩 직후 등) {ideal:0, min:0}.
 */
function resolveDaySchedule(
  weeklySchedule: GoalStudent["weeklySchedule"],
  now = new Date(),
) {
  const dayIndex = getDayIndexFromYMDServer(kstYMD(now), now);
  // getDayIndexFromYMDServer는 항상 0~6을 반환하고 VIRTUAL_DAY_NAMES는 7개 고정이다.
  const dayName = VIRTUAL_DAY_NAMES[dayIndex]!;
  return weeklySchedule?.[dayName] || { ideal: 0, min: 0 };
}

/**
 * "오늘의 목표" 카드 데이터. GET /api/goal/daily-record 결과(dailyRecordResult)와
 * daySchedule(오늘 요일의 목표 시간, resolveDaySchedule 결과)을 합쳐 만든다.
 *
 * dailyRecordResult가 아직 없거나(로딩 중) 방어적 분기(kind !== 'success')면 studyHours=0
 * 인 빈 상태로 그린다 — TodayGoalCard의 hasRecord 파생(studyHours>0)과 자연히 맞는다.
 */
function mapTodayGoal(
  daySchedule: { ideal: number; min: number },
  dailyRecordResult: DailyRecordResult | null,
) {
  const record =
    dailyRecordResult?.kind === "success" ? dailyRecordResult.record : null;
  const studyHours = record?.studyHours || 0;

  const rateOf = (targetHours: number) =>
    targetHours > 0
      ? Math.min(100, Math.round((studyHours / targetHours) * 100))
      : 0;

  return {
    studyHours,
    // 퀵칩 증분 목록 자체는 실데이터가 아니라 UI 상수다 — goalFormOptions.ts의
    // QUICK_ADD_HOURS를 그대로 재사용한다(사본을 새로 만들지 않는다).
    quickAddOptions: QUICK_ADD_HOURS,
    upperGoalRate: rateOf(daySchedule.ideal),
    lowerGoalRate: rateOf(daySchedule.min),
  };
}

/**
 * 과목별 배분 비율(합=1). fetchGoalTimer().summary.targets(goal_subject_targets, 학생이
 * 타이머 페이지에서 설정한 과목별 목표 시간)가 있으면 그 비율로, 하나도 없으면
 * TIMER_SUBJECT_ORDER 4과목 균등 배분한다(Timer 페이지 기존 파생 규칙과 동일 폴백).
 */
function buildSubjectRatios(
  timerTargets: { subject: string; targetHours: number }[] | null,
): Record<string, number> {
  const relevant = (timerTargets || []).filter(
    (t) => TIMER_SUBJECT_ORDER.includes(t.subject) && t.targetHours > 0,
  );
  const total = relevant.reduce((sum, t) => sum + t.targetHours, 0);

  if (total <= 0) {
    const equalShare = 1 / TIMER_SUBJECT_ORDER.length;
    return Object.fromEntries(
      TIMER_SUBJECT_ORDER.map((subject) => [subject, equalShare]),
    );
  }

  return Object.fromEntries(
    TIMER_SUBJECT_ORDER.map((subject) => {
      const match = relevant.find((t) => t.subject === subject);
      return [subject, match ? match.targetHours / total : 0];
    }),
  );
}

/**
 * "내일 계획 제시" 카드(§3.16 ③) — 내일(KST) 이상 목표 시간을 과목별로 배분한다.
 * unit(단원)은 산출 근거가 없어 만들지 않는다(TomorrowPlanCard가 unit 없이도 자연스럽게
 * 그리도록 조정했다). 배분 결과가 0시간인 과목은 행 자체를 뺀다(억지 산출 금지).
 */
function buildTomorrowPlan(
  tomorrowIdealHours: number,
  timerTargets: { subject: string; targetHours: number }[] | null,
): { subject: string; duration: string }[] {
  if (tomorrowIdealHours <= 0) return [];

  const ratios = buildSubjectRatios(timerTargets);
  return TIMER_SUBJECT_ORDER.map((subjectId) => ({
    subject: getSubjectLabel(subjectId),
    hours: tomorrowIdealHours * (ratios[subjectId] ?? 0),
  }))
    .filter((item) => item.hours > 0)
    .map((item) => ({
      subject: item.subject,
      duration: formatHoursLabel(item.hours),
    }));
}

function mapMockExam(student: GoalStudent) {
  const { lastMogoExam, currentMogo } = student.scores;
  return {
    // lastMogoExam 라벨은 api/goal/intake.js MOCK_ROUNDS와 동일('3모'/'6모'/'9모'/'10모').
    round: lastMogoExam ? `${lastMogoExam} 모의고사` : "모의고사 기록 없음",
    // 모의고사 카드는 D-day 소스가 없다(회차 일정 테이블 자체가 미생성 — 중요일정과 달리
    // 실데이터 전환 대상이 아니다) — dday 키를 생략하면 GoalDdayBadge가 빈 뱃지를 렌더한다
    // (React는 undefined 자식을 그리지 않는다). 가짜 날짜를 지어내지 않기 위한 선택.
    // exactOptionalPropertyTypes: optional 필드는 명시적 undefined 값을 받지 않으므로
    // 키 자체를 생략한다(동작은 이전과 동일).
    metricLabel: "현재 종합 백분위",
    metricValue: currentMogo != null ? currentMogo : "기록 없음",
    // AI 조언 생성 로직은 이식 대상이 아니다(docs/figma-goal/calc-port-status.md §9.2,
    // AdviceCard와 동일 사유) — 실데이터인 척 숫자를 만들어 넣지 않고 준비 중 문구로 둔다.
    advice: "학습 조언은 준비 중입니다.",
  };
}

// GET /api/goal/ranking 결과(kind:'ok') → RankingRail이 그리는 행 배열.
//
// "상위 5명 + 내 순위"를 두 블록 그대로 이어붙인다 — top(서버가 이미 "홍O동"으로
// 마스킹) 뒤에 me(본인 실명)를 별도 행으로 추가한다. 내 등수가 이미 top 안에
// 있어도(예: 내가 5등) 병합하지 않는다 — 동률일 때 top의 어느 행이 "나"인지
// 클라이언트가 rank/hours만 보고 추측해 그 자리를 내 실명으로 바꿔치기하면,
// 실제로는 다른 학생인 동률 상대의 마스킹 이름이 내 실명으로 뒤바뀌는 사고가
// 난다(마스킹은 서버 전용 — api/goal/ranking.js 파일 헤더 참고). 그 대가로 내가
// 상위 5명 안에 들면 같은 사람이 두 행(마스킹+실명)으로 중복 표시될 수 있다 —
// 이 페이지가 소유한 판단.
function mapRankingRows(rankingResult: RankingResult | null) {
  if (rankingResult?.kind !== "ok") return [];
  const rows = rankingResult.top.map((row) => ({ ...row, isSelf: false }));
  if (rankingResult.me) {
    rows.push({ ...rankingResult.me, isSelf: true });
  }
  return rows;
}

/**
 * 우측 레일 "중요일정 체크하기" 카드용 — 오늘(KST) 이후(오늘 포함) 마감일 중 가장 가까운
 * 3건. 지난 일정은 이 위젯(체크리스트 목적)에서 제외한다 — 전체 이력은
 * Schedules.jsx(/app/goal/schedules)가 담당한다(이번 UoW 판단 지점).
 */
function mapNearestSchedules(
  schedules?: ScheduleItem[] | null,
  now = new Date(),
) {
  const today = kstYMD(now);
  return [...(schedules || [])]
    .filter((schedule) => schedule.dueDate >= today)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 3)
    .map((schedule) => ({
      ...schedule,
      dday: formatScheduleDday(schedule.dueDate, now),
      meta: formatScheduleMeta(schedule.dueDate, schedule.memo),
    }));
}

function mapNaesin(student: GoalStudent) {
  const { lastNaesinExam, convertedGrade } = student.scores;
  return {
    // NAESIN_ROUNDS 라벨 그대로('1학기 중간'/'1학기 기말'/'2학기 중간'/'2학기 기말').
    round: lastNaesinExam || "내신 기록 없음",
    metricLabel: "현재 내신 평균",
    metricValue:
      convertedGrade != null
        ? `${convertedGrade.toFixed(2)} 등급 (9등급 환산)`
        : "기록 없음",
    advice: "학습 조언은 준비 중입니다.",
  };
}

// 목표관리 대시보드(#20 정본) 본문 — docs/figma-goal/00-INDEX.md §3 G2 / §5-4 / §6-3.
//
// 3존 레이아웃: 사이드바(GoalAppLayout 담당) │ 메인 1076px(67.25rem) │ 우측 레일 372px(23.25rem).
// 페이지 헤더(뱃지+날짜 기준+헤딩, `DashboardPageHeader`)는 메인+레일 2열 그리드의 1행에
// 메인 컬럼(col 1)만 차지하도록 배치한다(part-07 #20 세로 흐름표 — 뱃지/헤딩은 x=372~1065,
// 레일까지 가로지르지 않음). 메인 콘텐츠와 레일은 2행에 나란히 배치돼 같은 행 시작선을 공유하므로
// 우측 레일 첫 카드(y=272)가 메인 컬럼 첫 카드(오늘의 목표, y=271)와 자연스럽게 같은 높이에서
// 시작한다 — 헤더 높이만큼의 하드코딩 오프셋(구 pt-[10.6875rem]) 없이 grid row-gap만으로 해결.
// 1행→2행 간격(4.875rem = 78px)은 헤더 하단(y193)~메인 첫 카드(y271) 실측 간격 그대로다.
// 메인 세로 스택: 헤더 → 오늘의 목표 → 오늘의 조언/내일 계획 제시(2열) → 모의고사/내신(2열) →
// 학업 성취도 변화 추이. 우측 레일: 이상/최소 목표대학 → 학습 계획 → 중요일정 → 학습 순위, 전부
// flex column + gap(카드 세로 간격 20px = 1.25rem)으로 쌓아 가변 높이 카드를 절대 좌표 없이
// 수용한다(학습 계획 194↔342, 중요일정 194↔278).
//
// 조언 유형("일일 분석 조언" ↔ "AI 입시 분석 조언") 상태 축은 `DashboardPageHeader`의
// `adviceType` prop으로 옮겼다(part-06 #17/#18 뱃지 변형). 기본 렌더는 "오늘 기록 있음"(#20) ·
// adviceType="ai" 상태다. 미기록 축(studyHours=0, tomorrowPlan=[])은 실데이터가 그 값을
// 낼 때 위젯이 스스로 분기한다(TodayGoalCard의 hasRecord 파생, TomorrowPlanCard의 빈 배열
// 분기) — 컴포넌트 코드를 다시 건드릴 필요가 없다. AchievementChart는 실데이터
// (student.probabilityHistory) 기준이라 빈 상태는 이력 0~1건일 때 컴포넌트가 자체 분기한다.
export default function Dashboard() {
  // fetchGoalStudent() 결과를 discriminated union 그대로 보관한다(재가공하지 않는다 —
  // goalApi.js의 kind 계약을 이 컴포넌트가 다시 해석하는 지점을 하나로 좁혀 둔다).
  // null = 아직 응답 도착 전(로딩 중). RequireGoalAccess가 이미 onboarded:true만
  // 통과시키므로 정상 경로에선 result.kind는 항상 'onboarded'다 — 그 외 kind는
  // 전부 직접 URL 진입·세션 경쟁 상태 같은 방어적 분기다.
  const [result, setResult] = useState<GoalStudentResult | null>(null);
  // null = 로딩 중. kind가 'ok'가 아닌 나머지(no-session/not-allowed/error)는
  // mapRankingRows가 빈 배열로 접어 RankingRail의 빈 상태 문구로 흡수한다 —
  // 이 카드 하나 때문에 대시보드 전체를 에러 화면으로 떨어뜨리지 않는다.
  const [rankingResult, setRankingResult] = useState<RankingResult | null>(
    null,
  );

  // ScheduleRail(우측 레일 "중요일정 체크하기") 전용 — student 판정과 무관하게 독립 조회한다.
  // null = 로딩 중. 실패 시 빈 배열로 접는다 — 이 카드는 student처럼 페이지 전체를 막는
  // 필수 데이터가 아니라 조회 실패를 mock으로 되돌리지 않고 그냥 빈 상태로 보여준다.
  const [schedules, setSchedules] = useState<ScheduleItem[] | null>(null);

  // GET /api/goal/daily-record — "오늘의 목표" 카드 전용(studyHours). null = 로딩 중.
  // fetchGoalStudent()와 별도 상태로 둔다 — 하나가 실패해도 다른 하나는 정상 렌더돼야
  // 한다(예: daily-record 네트워크 오류가 나도 목표대학·모의고사 카드는 그대로 보여야 함).
  const [dailyRecordResult, setDailyRecordResult] =
    useState<DailyRecordResult | null>(null);

  // 내일 계획 제시(TomorrowPlanCard) 과목 배분 비율 전용 — GET /api/goal/timer의
  // targets(goal_subject_targets). null = 로딩 중/미설정 둘 다(buildSubjectRatios가
  // 빈 배열과 null을 동일하게 균등 배분 폴백으로 처리해 구분할 필요가 없다).
  const [timerTargets, setTimerTargets] = useState<
    { subject: string; targetHours: number }[] | null
  >(null);

  const reloadDailyRecord = () => {
    fetchTodayGoalRecord().then((r) =>
      setDailyRecordResult(r as DailyRecordResult),
    );
  };
  useEffect(() => {
    let alive = true;
    fetchGoalStudent().then((r) => {
      if (alive) setResult(r as GoalStudentResult);
    });
    fetchTodayGoalRecord().then((r) => {
      if (alive) setDailyRecordResult(r as DailyRecordResult);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    fetchGoalSchedules().then((r) => {
      if (!alive) return;
      const typed = r as SchedulesResult;
      setSchedules(typed.kind === "success" ? typed.schedules : []);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    fetchGoalRanking().then((r) => {
      if (alive) setRankingResult(r as RankingResult);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    fetchGoalTimer().then((r) => {
      if (alive && r.kind === "success") setTimerTargets(r.summary.targets);
    });
    return () => {
      alive = false;
    };
  }, []);

  // 좌우 패딩(px-[3rem], 양쪽 합 6rem)을 바깥 래퍼로 옮긴다 — 기존엔 패딩이 max-w-goal-dashboard와
  // 같은 요소에 있어 그리드가 쓸 수 있는 가용 폭이 93rem - 6rem = 87rem으로 줄었는데, 자식 그리드는
  // `grid-cols-[67.25rem_23.25rem] gap-x-10` = 93rem 고정이라 6rem이 컨테이너를 넘쳤다
  // (결함2). 이제 max-w-goal-dashboard는 패딩의 영향을 받지 않는 안쪽 컨테이너에 붙어 93rem을
  // 온전히 쓴다. `max-w-goal-dashboard` 토큰 값(93rem) 자체는 그대로 둔다.
  const outerClassName = "px-12 pb-24 pt-25";

  if (result === null) {
    return (
      <div className={outerClassName}>
        <div className="max-w-goal-dashboard">
          <GoalCard tone="neutral" className="px-8 py-7">
            <p className="text-[0.9375rem] leading-[1.4] text-ink-sub">
              대시보드를 불러오는 중입니다…
            </p>
          </GoalCard>
        </div>
      </div>
    );
  }

  // 방어적 분기 — 정상 경로에선 RequireGoalAccess가 이미 걸러 여기 도달하지 않는다
  // (no-session/not-allowed/not-onboarded/awaiting-cuts는 3단계 게이트 대상,
  // error는 hasEntitlement 계열과 동일하게 "판정 불가"다). 크래시 대신 안내만 하고
  // 게이트가 다음 진입 때 다시 판정하도록 둔다 — 여기서 직접 리다이렉트하지 않는다.
  if (result.kind !== "onboarded") {
    const message =
      result.kind === "awaiting-cuts"
        ? "합격 기준 데이터를 준비 중입니다. 잠시 후 다시 확인해 주세요."
        : "대시보드 데이터를 불러오지 못했습니다. 새로고침해 주세요.";
    return (
      <div className={outerClassName}>
        <div className="max-w-goal-dashboard">
          <GoalCard tone="neutral" className="px-8 py-7">
            <p className="text-[0.9375rem] leading-[1.4] text-ink-sub">
              {message}
            </p>
          </GoalCard>
        </div>
      </div>
    );
  }

  const { student } = result;
  const targetUniversities = mapTargetUniversities(student);
  const todayDaySchedule = resolveDaySchedule(student.weeklySchedule);
  const todayGoalData = mapTodayGoal(todayDaySchedule, dailyRecordResult);
  const mockExamData = mapMockExam(student);
  const naesinData = mapNaesin(student);

  const tomorrowDaySchedule = resolveDaySchedule(
    student.weeklySchedule,
    new Date(Date.now() + ONE_DAY_MS),
  );
  const tomorrowPlan = buildTomorrowPlan(
    tomorrowDaySchedule.ideal,
    timerTargets,
  );

  // 웰컴 카드(§3.16) — headline은 오늘의 조언(②), body는 확률 요약(①). badge는
  // DashboardPageHeader가 adviceType prop으로 자체 렌더하므로 여기서는 만들지 않는다.
  const advice = {
    headline: buildTodayHeadline(todayDaySchedule.ideal, todayGoalData.studyHours),
    body: buildProbabilitySummary(targetUniversities),
  };

  return (
    <div className={outerClassName}>
      <div className="max-w-goal-dashboard">
        <div className="grid grid-cols-[67.25rem_23.25rem] gap-x-10 gap-y-19.5">
          <DashboardPageHeader
            adviceType="ai"
            dateLabel={formatTodayDateLabel()}
            headline={advice.headline}
            className="col-start-1 row-start-1"
          />

          <div className="col-start-1 row-start-2 flex min-w-0 flex-col gap-5">
            {/* 오늘의 목표: GET /api/goal/daily-record(studyHours) + student.weeklySchedule(오늘
                목표 시간)을 합쳐 mapTodayGoal()이 만든 실데이터. 저장 성공 시
                reloadDailyRecord로 이 카드와 게이지를 함께 최신화한다. */}
            <TodayGoalCard data={todayGoalData} onSaved={reloadDailyRecord} />

            <div className="flex gap-4">
              <div className="w-132.5">
                {/* AdviceCard: buildProbabilitySummary()의 확률 요약(§3.16 ①) — AI 생성이
                    아니라 규칙 기반 조립이다. */}
                <AdviceCard data={advice} />
              </div>
              <div className="w-132.5">
                {/* TomorrowPlanCard: buildTomorrowPlan()의 과목별 시간 배분(§3.16 ③). 내일
                    목표 시간이 0/미설정이면 빈 배열이라 위젯이 스스로 "준비 중" 빈 상태를
                    그린다. */}
                <TomorrowPlanCard plan={tomorrowPlan} />
              </div>
            </div>

            <div className="flex gap-4">
              <div className="w-132.5">
                <MockExamCard data={mockExamData} />
              </div>
              <div className="w-132.5">
                <NaesinCard data={naesinData} />
              </div>
            </div>

            {/* AchievementChart: goal_probability_logs 실이력(probabilityHistory, §goalRepo.js
                buildStudentPayload) — 4계열(이상/최소 × 수시/정시) 라인 차트. */}
            <AchievementChart data={student.probabilityHistory} />
          </div>

          <div className="col-start-2 row-start-2 flex min-w-0 flex-col gap-5">
            <TargetUniversityRail data={targetUniversities} />
            {/* StudyPlanRail: 오늘 과제 조회(GET /api/goal/plan-tasks)를 위젯이 직접 한다
                (StudyPlanRail.jsx 참고). Dashboard는 tasks를 내려주지 않는다. */}
            <StudyPlanRail />
            {/* ScheduleRail: GET /api/goal/schedules 실데이터, 가까운 순 3건(mapNearestSchedules). */}
            <ScheduleRail schedules={mapNearestSchedules(schedules)} />
            <RankingRail ranking={mapRankingRows(rankingResult)} />
          </div>
        </div>
      </div>
    </div>
  );
}
