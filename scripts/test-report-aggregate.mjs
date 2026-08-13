// src/lib/goal/report/aggregate.js 회귀 테스트.
//
// 이 파일은 손으로 만든 최소 픽스처만 쓴다 — DB도 브라우저도 필요 없다(aggregate.js가
// supabase를 전혀 모르는 순수 함수 모음이기 때문). 리포트 실배선(I단계)에서 가장 위험한
// 지점 4가지를 우선 커버한다: 완성도 재정규화(과제 0건), 시간대 버킷(심야 0~6 경계),
// 달성률 분모(effectiveWindow), 코호트 백분위(표본 부족 판정).
//
// 사용법: node scripts/test-report-aggregate.mjs
// (node:test 러너 — 실패해도 프로세스가 nonzero exit code로 끝난다, package.json
//  test:calc 스크립트와 같은 러너를 재사용한다.)

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  bucketTimeSlots,
  classifyJeongsiZone,
  classifyNaesinZone,
  computeAchievementRate,
  computeAdmissionDelta,
  computeCohortPercentile,
  computeCompletionScore,
  computeConditionBreakdown,
  computeCoreItems,
  computeDistraction,
  computeEffectiveWindow,
  computeStudyHours,
  computeSubjectShare,
  deriveGradeSystem,
  diffDaysInclusive,
  lastDayOfMonthYmd,
  percentileToGrade,
  resolveMonthlyPeriod,
  resolveWeeklyPeriod,
  sumHoursByProfile,
} from "../src/lib/goal/report/aggregate.js";

// ---------------------------------------------------------------------------
// 기간 경계 — 순수 달력
// ---------------------------------------------------------------------------

test("resolveWeeklyPeriod — 임의 요일을 그 주 월요일로 정규화", () => {
  const period = resolveWeeklyPeriod("2026-08-05", "2026-08-01"); // 2026-08-05는 수요일
  assert.equal(period.start, "2026-08-03"); // 월요일
  assert.equal(period.end, "2026-08-09"); // 일요일
  assert.equal(period.periodKey, "2026-08-03");
});

test("resolveWeeklyPeriod — period 생략 시 오늘 기준 이번 주", () => {
  const period = resolveWeeklyPeriod(undefined, "2026-08-13"); // 목요일
  assert.equal(period.start, "2026-08-10");
  assert.equal(period.end, "2026-08-16");
});

test("resolveMonthlyPeriod — YYYY-MM 경계(윤년 2월 포함)", () => {
  const period = resolveMonthlyPeriod("2028-02", "2026-08-13");
  assert.equal(period.start, "2028-02-01");
  assert.equal(period.end, "2028-02-29"); // 2028은 윤년
});

test("lastDayOfMonthYmd — 평년 2월", () => {
  assert.equal(lastDayOfMonthYmd("2026-02"), "2026-02-28");
});

test("diffDaysInclusive — 양끝 포함 일수, 역순이면 0", () => {
  assert.equal(diffDaysInclusive("2026-08-03", "2026-08-09"), 7);
  assert.equal(diffDaysInclusive("2026-08-09", "2026-08-03"), 0);
});

// ---------------------------------------------------------------------------
// computeEffectiveWindow — 달성률/완성도 분모
// ---------------------------------------------------------------------------

test("computeEffectiveWindow — actual_start_date가 기간 시작보다 늦으면 그 날부터", () => {
  const window = computeEffectiveWindow({
    periodStart: "2026-08-03",
    periodEnd: "2026-08-09",
    actualStartDate: "2026-08-06",
    nowYmd: "2026-08-09",
  });
  assert.equal(window.start, "2026-08-06");
  assert.equal(window.end, "2026-08-09");
  assert.equal(window.elapsedDays, 4);
});

test("computeEffectiveWindow — 기간이 통째로 미래면 elapsedDays=0", () => {
  const window = computeEffectiveWindow({
    periodStart: "2026-09-01",
    periodEnd: "2026-09-07",
    actualStartDate: "2026-08-01",
    nowYmd: "2026-08-13",
  });
  assert.equal(window.start, null);
  assert.equal(window.elapsedDays, 0);
});

test("computeEffectiveWindow — actual_start_date 없으면 기간 시작 그대로", () => {
  const window = computeEffectiveWindow({
    periodStart: "2026-08-03",
    periodEnd: "2026-08-09",
    actualStartDate: null,
    nowYmd: "2026-08-05",
  });
  assert.equal(window.start, "2026-08-03");
  assert.equal(window.end, "2026-08-05");
  assert.equal(window.elapsedDays, 3);
});

// ---------------------------------------------------------------------------
// D1/D2 — 공부 시간 · 달성률
// ---------------------------------------------------------------------------

test("computeStudyHours — study_hours 합", () => {
  const hours = computeStudyHours([
    { study_hours: 3.5 },
    { study_hours: "2.0" },
    { study_hours: null },
  ]);
  assert.equal(hours, 5.5);
});

test("computeAchievementRate — 요일별 목표 합 대비 % (일요일 제외)", () => {
  const student = {
    study_schedule: {
      monday: { ideal: 4, min: 3 },
      tuesday: { ideal: 4, min: 3 },
      wednesday: { ideal: 4, min: 3 },
      thursday: { ideal: 4, min: 3 },
      friday: { ideal: 4, min: 3 },
      saturday: { ideal: 4, min: 3 },
      sunday: { ideal: 10, min: 10 }, // 분모에서 반드시 제외돼야 한다
    },
  };
  const effectiveWindow = {
    start: "2026-08-03",
    end: "2026-08-04",
    elapsedDays: 2,
  }; // 월·화만
  const { idealRate, minRate, idealTargetHours } = computeAchievementRate({
    totalStudyHours: 4,
    student,
    effectiveWindow,
  });
  assert.equal(idealTargetHours, 8); // 월+화 이상 목표 4+4
  assert.equal(idealRate, 50); // 4 / 8 * 100
  assert.equal(minRate, 67); // 4 / 6 * 100 = 66.67 → round0
});

test("computeAchievementRate — effectiveWindow 없으면 0%", () => {
  const result = computeAchievementRate({
    totalStudyHours: 10,
    student: { study_schedule: {} },
    effectiveWindow: { start: null, end: null, elapsedDays: 0 },
  });
  assert.deepEqual(result, {
    idealRate: 0,
    minRate: 0,
    idealTargetHours: 0,
    minTargetHours: 0,
  });
});

// ---------------------------------------------------------------------------
// D3 — 완성도(재정규화 핵심 케이스)
// ---------------------------------------------------------------------------

test("computeCompletionScore — 과제 0건이면 0.5/0.3 → 0.625/0.375 재정규화", () => {
  // achievementAxis=100, consistencyAxis=100(3/3일) → 재정규화 없으면 80점, 있으면 100점.
  const score = computeCompletionScore({
    idealRate: 100,
    recordDays: 3,
    elapsedDays: 3,
    doneTasks: 0,
    totalTasks: 0,
  });
  assert.equal(score, 100);
});

test("computeCompletionScore — 과제 있으면 0.5/0.3/0.2 3축 가중", () => {
  // achievement=50, consistency=50, plan=50 → 0.5*50+0.3*50+0.2*50 = 50
  const score = computeCompletionScore({
    idealRate: 50,
    recordDays: 1,
    elapsedDays: 2,
    doneTasks: 1,
    totalTasks: 2,
  });
  assert.equal(score, 50);
});

test("computeCompletionScore — idealRate가 100 넘어도 achievementAxis는 100으로 clamp", () => {
  const score = computeCompletionScore({
    idealRate: 150,
    recordDays: 2,
    elapsedDays: 2,
    doneTasks: 2,
    totalTasks: 2,
  });
  assert.equal(score, 100); // 0.5*100 + 0.3*100 + 0.2*100
});

// ---------------------------------------------------------------------------
// D4 — 코호트 백분위
// ---------------------------------------------------------------------------

test("computeCohortPercentile — 코호트 2명 미만이면 표본 부족", () => {
  const result = computeCohortPercentile("me", [
    { profileId: "me", hours: 10 },
  ]);
  assert.equal(result.insufficientSample, true);
  assert.equal(result.topPercent, null);
});

test("computeCohortPercentile — 5명 중 1등이면 상위 20%", () => {
  const cohort = [
    { profileId: "me", hours: 20 },
    { profileId: "a", hours: 15 },
    { profileId: "b", hours: 10 },
    { profileId: "c", hours: 5 },
    { profileId: "d", hours: 1 },
  ];
  const result = computeCohortPercentile("me", cohort);
  assert.equal(result.rank, 1);
  assert.equal(result.topPercent, 20);
});

test("computeCohortPercentile — 동점이면 더 나은 학생 수 기준으로 순위(공동 1위 둘 다 rank=1)", () => {
  const cohort = [
    { profileId: "me", hours: 10 },
    { profileId: "a", hours: 10 },
    { profileId: "b", hours: 3 },
  ];
  const result = computeCohortPercentile("me", cohort);
  assert.equal(result.rank, 1); // 나보다 큰 값이 없다(동점 a는 "더 크다"가 아니다)
});

test("sumHoursByProfile — profile_id별 합산", () => {
  const rows = [
    { profile_id: "a", study_hours: 1 },
    { profile_id: "a", study_hours: 2 },
    { profile_id: "b", study_hours: 3 },
  ];
  const result = sumHoursByProfile(rows);
  assert.deepEqual(
    result.sort((x, y) => x.profileId.localeCompare(y.profileId)),
    [
      { profileId: "a", hours: 3 },
      { profileId: "b", hours: 3 },
    ],
  );
});

// ---------------------------------------------------------------------------
// D6 — 컨디션 4종 항상 노출
// ---------------------------------------------------------------------------

test("computeConditionBreakdown — 기록이 없는 컨디션도 0일로 노출", () => {
  const { listRows, tiles } = computeConditionBreakdown([
    { body_condition: "great", study_hours: 5 },
  ]);
  assert.equal(listRows.length, 4);
  assert.equal(listRows.find((r) => r.label === "아주 좋음").value, "1일");
  assert.equal(listRows.find((r) => r.label === "보통").value, "0일");
  assert.equal(tiles.find((t) => t.label === "아주 좋음").avg, "평균 5h");
  assert.equal(tiles.find((t) => t.label === "보통").avg, "평균 0h");
});

// ---------------------------------------------------------------------------
// D7 — 과목별 학습 비중
// ---------------------------------------------------------------------------

test("computeSubjectShare — 세션 없으면 empty", () => {
  assert.deepEqual(computeSubjectShare([]), { empty: true, rows: [] });
});

test("computeSubjectShare — 과목별 비중 %(합 100 근처)", () => {
  const result = computeSubjectShare([
    { subject: "math", duration_seconds: 3600 },
    { subject: "korean", duration_seconds: 3600 },
    { subject: "weird-code", duration_seconds: 1800 }, // 미지 코드는 '기타'
  ]);
  assert.equal(result.empty, false);
  const total = result.rows.reduce((s, r) => s + r.value, 0);
  assert.ok(total >= 99 && total <= 101);
  assert.ok(result.rows.some((r) => r.label === "기타"));
});

// ---------------------------------------------------------------------------
// D8 — 시간대별 학습 효율(심야 0~6 경계)
// ---------------------------------------------------------------------------

test("bucketTimeSlots — 자정 직후(KST 01시) 세션은 심야 0~6 버킷", () => {
  const buckets = bucketTimeSlots([
    { started_at: "2026-08-03T16:30:00.000Z", duration_seconds: 3600 },
  ]); // UTC 16:30 = KST 01:30
  const midnight = buckets.find((b) => b.label === "심야 0~6");
  assert.equal(midnight.value, 1);
});

test("bucketTimeSlots — KST 21시는 오후 9~12 버킷, 경계(24시)는 넘치지 않는다", () => {
  const buckets = bucketTimeSlots([
    { started_at: "2026-08-03T12:00:00.000Z", duration_seconds: 1800 },
  ]); // UTC 12:00 = KST 21:00
  const late = buckets.find((b) => b.label === "오후 9~12");
  assert.equal(late.value, 0.5);
  assert.equal(
    buckets.reduce((s, b) => s + b.value, 0),
    0.5,
  );
});

// ---------------------------------------------------------------------------
// 방해요인/완료항목 카운트
// ---------------------------------------------------------------------------

test('computeDistraction — "없었음"은 차트에서 제외', () => {
  const rows = computeDistraction([
    { reasons: ["스마트폰", "없었음"] },
    { reasons: ["스마트폰"] },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].label, "스마트폰");
  assert.equal(rows[0].value, 2);
});

test("computeCoreItems — 내림차순 정렬", () => {
  const rows = computeCoreItems([
    { tasks: ["오답 정리"] },
    { tasks: ["오답 정리", "개념 학습"] },
  ]);
  assert.equal(rows[0].label, "오답 정리");
  assert.equal(rows[0].value, 2);
});

// ---------------------------------------------------------------------------
// D12 — 등급제 표기(2028 학년도 경계)
// ---------------------------------------------------------------------------

test("deriveGradeSystem — 고3(2026-08-13 기준)은 2027년 3월 입학 → 9등급제(경계값 직전)", () => {
  // 2026-08-13 기준 고3 → 2026학년도 고3 → 2026학년도 11월 수능 → 2027년 3월 입학(2027학년도
  // 대입, 2028 미만이라 9등급제).
  assert.equal(deriveGradeSystem("고3", "2026-08-13"), "9등급제");
});

test("deriveGradeSystem — 고3(2027-08-13 기준)은 2028년 3월 입학 → 5등급제(경계값)", () => {
  assert.equal(deriveGradeSystem("고3", "2027-08-13"), "5등급제");
});

test("deriveGradeSystem — 고1(2026-08-13 기준)은 2029학년도 고3 → 2029년 입학 → 5등급제", () => {
  // 고1 → 2년 뒤 2028학년도에 고3 → 2028년 11월 수능 → 2029년 3월 입학(2029학년도 대입,
  // ≥2028이므로 5등급제).
  assert.equal(deriveGradeSystem("고1", "2026-08-13"), "5등급제");
});

test("deriveGradeSystem — grade가 고1~3 패턴이 아니면(중학생 등) 9등급제 기본값", () => {
  assert.equal(deriveGradeSystem("중3", "2030-01-01"), "9등급제");
});

// ---------------------------------------------------------------------------
// 학습방향 리포트 — 구간 분류 · 백분위 환산
// ---------------------------------------------------------------------------

test("classifyNaesinZone — 등급은 낮을수록 우세, 컷 이내면 강점 유지", () => {
  assert.equal(classifyNaesinZone(1.5, 2.0, 3.0), "strong");
  assert.equal(classifyNaesinZone(2.5, 2.0, 3.0), "improve");
  assert.equal(classifyNaesinZone(3.5, 2.0, 3.0), "focus");
});

test("classifyJeongsiZone — 백분위는 높을수록 우세, 부등호 방향이 내신과 반대", () => {
  assert.equal(classifyJeongsiZone(95, 90, 70), "strong");
  assert.equal(classifyJeongsiZone(80, 90, 70), "improve");
  assert.equal(classifyJeongsiZone(50, 90, 70), "focus");
});

test("percentileToGrade — GRADE_PERCENTILE 역조회", () => {
  assert.equal(percentileToGrade(98), 1);
  assert.equal(percentileToGrade(50), 5);
});

// ---------------------------------------------------------------------------
// 합격 가능성 델타
// ---------------------------------------------------------------------------

test("computeAdmissionDelta — 상승/하락 방향과 절대값", () => {
  const targets = {
    ideal: { university: "서울대학교", department: "경영학과" },
    min: { university: "건국대학교", department: "경영학과" },
  };
  const result = computeAdmissionDelta({
    targets,
    startLog: {
      ideal_susi: 20,
      ideal_jungsi: 15,
      min_susi: 30,
      min_jungsi: 25,
    },
    endLog: {
      ideal_susi: 22.5,
      ideal_jungsi: 14,
      min_susi: 30,
      min_jungsi: 25,
    },
  });
  assert.equal(result.upper.university, "서울대학교 경영학과");
  assert.equal(result.upper.susi.delta.direction, "up");
  assert.equal(result.upper.susi.delta.value, "2.50%");
  assert.equal(result.upper.jeongsi.delta.direction, "down");
  assert.equal(result.upper.jeongsi.rate, 14);
});

console.log(
  "report-aggregate 테스트 정의 완료 — node:test 러너가 위 test() 블록을 실행합니다.",
);
