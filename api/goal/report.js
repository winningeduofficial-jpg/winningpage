// GET /api/goal/report?type=weekly|monthly|direction&period=...&track=naesin|jeongsi
// Authorization: Bearer <access_token>
//
// 성장 리포트(#33 주간 / #34 월간) + 학습방향 리포트(#37 내신 / #38 정시) 단일 조회
// 엔드포인트. 하우스 스타일은 api/goal/student.js·daily-record.js 그대로 따른다 —
// GET-only(조회형), 405 → 401(openGoalSession) → 미결제 200 {allowed:false} →
// 온보딩 게이트 409 → 400(쿼리 검증) → 500.
//
// 집계 산술은 전부 src/lib/goal/report/aggregate.js(순수 함수, supabase 미의존)에
// 있다 — 이 파일은 DB 조회(api/_lib/goalRepo.js) → aggregate.js 입력 조립 →
// insights.js 자연어 슬롯 → UI가 기대하는 report 응답 모양(GrowthReportBody.jsx /
// DirectionReportBody.jsx가 지금까지 goalReportMock.js에서 그대로 읽던 그 모양)으로
// 되돌리는 배선만 한다.
//
// 기간 경계는 순수 달력이다(팀장 확정) — 주간 period='그 주 월요일 YMD',
// 월간 period='YYYY-MM'. 생략하면 오늘(KST) 기준 이번 주/이번 달로 기본값 처리한다.

import { kstYMD } from '../../src/lib/goal/calc/virtualDate.js';
import { GRADE_PERCENTILE } from '../../src/lib/goal/calc/jeongsi.js';

import {
  fetchActiveCohortProfileIds,
  fetchDailyRecordsForProfilesInRange,
  fetchEarliestProbabilityLog,
  fetchMentorComment,
  fetchPlanTasksInRange,
  fetchProbabilityLogAtOrBefore,
  fetchRecordsInRange,
  fetchStudentRow,
  fetchTimerSessionsInRange,
  openGoalSession
} from '../_lib/goalRepo.js';

import {
  bucketTimeSlots,
  buildJeongsiSubjectMetrics,
  buildMonthlyWeeks,
  buildNaesinSubjectMetrics,
  buildWeeklyStudyTimeBars,
  computeAchievementRate,
  computeAdmissionDelta,
  computeCohortPercentile,
  computeCompletionScore,
  computeConditionBreakdown,
  computeCoreItems,
  computeDistraction,
  computeEffectiveWindow,
  computeJeongsiComposite,
  computeStudyHours,
  computeSubjectShare,
  deriveGradeSystem,
  percentileToGrade,
  resolveMonthlyPeriod,
  resolveWeeklyPeriod,
  round1,
  sumHoursByProfile,
  toNum
} from '../../src/lib/goal/report/aggregate.js';

import {
  buildConditionTip,
  buildCoreItemsTip,
  buildDirectionSummary,
  buildDistractionTip,
  buildHeroNarrative,
  buildMonthlyExpectedEffect,
  buildMonthlyLearningType,
  buildMonthlyStrategy,
  buildSubjectDirectionBody,
  buildSubjectShareTip,
  buildTimeSlotTip
} from '../../src/lib/goal/report/insights.js';

export const config = { runtime: 'nodejs' };

const VALID_TYPES = ['weekly', 'monthly', 'direction'];

// 온보딩 고정 회차(api/goal/intake.js NAESIN_ROUNDS/MOCK_ROUNDS와 글자 단위로 같은 라벨).
const NAESIN_ROUNDS = [
  { key: 's1mid', label: '1학기 중간' },
  { key: 's1final', label: '1학기 기말' },
  { key: 's2mid', label: '2학기 중간' },
  { key: 's2final', label: '2학기 기말' }
];
const MOCK_ROUNDS = [
  { key: 'mar', label: '3모' },
  { key: 'jun', label: '6모' },
  { key: 'sep', label: '9모' },
  { key: 'oct', label: '10모' }
];

function formatHoursMinutesLabel(hoursFloat) {
  const totalMinutes = Math.round(hoursFloat * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h <= 0) return `${m}분`;
  if (m <= 0) return `${h}시간`;
  return `${h}시간${m}분`;
}

// ---------------------------------------------------------------------------
// 성장 리포트(주간/월간)
// ---------------------------------------------------------------------------

async function buildGrowthReport({ supabaseAdmin, profileId, student, type, periodParam, nowYmd }) {
  const period = type === 'monthly' ? resolveMonthlyPeriod(periodParam, nowYmd) : resolveWeeklyPeriod(periodParam, nowYmd);

  const effectiveWindow = computeEffectiveWindow({
    periodStart: period.start,
    periodEnd: period.end,
    actualStartDate: student.actual_start_date,
    nowYmd
  });

  const [records, sessions, planTasks, cohortProfileIds, mentorComment] = await Promise.all([
    fetchRecordsInRange(supabaseAdmin, profileId, period.start, period.end),
    fetchTimerSessionsInRange(supabaseAdmin, profileId, period.start, period.end),
    fetchPlanTasksInRange(supabaseAdmin, profileId, period.start, period.end),
    fetchActiveCohortProfileIds(supabaseAdmin, student.ideal_university, student.ideal_department),
    fetchMentorComment(supabaseAdmin, profileId, type, period.periodKey)
  ]);

  const totalStudyHours = computeStudyHours(records);
  const { idealRate, minRate, minTargetHours } = computeAchievementRate({ totalStudyHours, student, effectiveWindow });

  // "기록 제출일수" — 순공 시간이 실제로 기록된 날(카드-only로 0시간만 찍힌 날은 세지 않는다).
  const recordDays = records.filter((r) => toNum(r.study_hours) > 0).length;
  const doneTasks = planTasks.filter((t) => t.done).length;
  const totalTasks = planTasks.length;
  const completionScore = computeCompletionScore({
    idealRate,
    recordDays,
    elapsedDays: effectiveWindow.elapsedDays,
    doneTasks,
    totalTasks
  });

  // D4 — 목표군 내 위치. 본인 값은 이미 computeStudyHours로 구했으니 코호트 조회 결과에서
  // 덮어써 이중 집계 오차를 없앤다. 코호트 조회에 잡히지 않은(그 기간 기록이 0건인) 학생은
  // sumHoursByProfile 결과에 아예 나타나지 않으므로 0시간으로 채워 넣는다.
  const cohortRecords = await fetchDailyRecordsForProfilesInRange(supabaseAdmin, cohortProfileIds, period.start, period.end);
  const cohortHoursMap = new Map(sumHoursByProfile(cohortRecords).map((x) => [x.profileId, x.hours]));
  const cohortHours = cohortProfileIds.map((pid) => ({
    profileId: pid,
    hours: pid === profileId ? totalStudyHours : cohortHoursMap.get(pid) || 0
  }));
  const cohortPercentile = computeCohortPercentile(profileId, cohortHours);

  const conditionBreakdown = computeConditionBreakdown(records);
  const subjectShare = computeSubjectShare(sessions);
  const timeSlotBuckets = bucketTimeSlots(sessions);
  const distraction = computeDistraction(records);
  const coreItems = computeCoreItems(records);

  // 합격 가능성 변화 — 기간 시작 이전 최신 스냅샷과 기간 끝까지 최신 스냅샷의 차.
  const startBoundaryIso = `${period.start}T00:00:00+09:00`;
  const endBoundaryIso = `${period.end}T23:59:59+09:00`;
  let startLog = await fetchProbabilityLogAtOrBefore(supabaseAdmin, profileId, startBoundaryIso);
  if (!startLog) startLog = await fetchEarliestProbabilityLog(supabaseAdmin, profileId);
  let endLog = await fetchProbabilityLogAtOrBefore(supabaseAdmin, profileId, endBoundaryIso);
  if (!endLog) endLog = startLog;

  const admission = computeAdmissionDelta({
    targets: {
      ideal: { university: student.ideal_university, department: student.ideal_department },
      min: { university: student.min_university, department: student.min_department }
    },
    startLog,
    endLog
  });

  const heroNarrative = buildHeroNarrative({
    period: type,
    totalStudyHours,
    idealRate,
    minRate,
    completionScore,
    recordDays,
    elapsedDays: effectiveWindow.elapsedDays
  });

  const positionKpi = cohortPercentile.insufficientSample ? '표본 부족' : `상위 ${cohortPercentile.topPercent}%`;

  const kpis = [
    { label: type === 'monthly' ? `${Number(period.periodKey.slice(5, 7))}월 공부 시간` : '이번 주 공부 시간', value: formatHoursMinutesLabel(totalStudyHours) },
    { label: '이상 목표 달성률', value: `${idealRate}%` },
    { label: '최소 목표 달성률', value: `${minRate}%` },
    { label: type === 'monthly' ? '월간 완성도' : '주간 완성도', value: `${completionScore}점` },
    { label: '목표군 내 위치', value: positionKpi }
  ];

  const achievementRows = [
    { label: '이상 목표', value: idealRate, max: 100 },
    { label: '최소 목표', value: minRate, max: 100 }
  ];

  let studyTimeBars;
  let monthlyWeeks = [];
  if (type === 'monthly') {
    monthlyWeeks = buildMonthlyWeeks({ records, student, monthStart: period.start, monthEnd: period.end, nowYmd });
    studyTimeBars = monthlyWeeks.map((w) => ({ label: w.label, value: w.hours }));
  } else {
    studyTimeBars = buildWeeklyStudyTimeBars(records, period.start);
  }

  const report = {
    period: type,
    heading: type === 'monthly' ? '월간 성장 리포트' : '주간 성장 리포트',
    periodLabel: period.periodLabel,
    hero: { narrative: heroNarrative, kpis },
    overview: {
      label: '한눈에 보기',
      subLabel: type === 'monthly' ? '이번 달 목표・공부량・컨디션' : '이번 주 목표・공부량・컨디션',
      achievement: {
        title: type === 'monthly' ? '이번 달 목표 달성 현황' : '이번 주 목표 달성 현황',
        rows: achievementRows,
        weeks:
          type === 'monthly'
            ? monthlyWeeks.map((w) => ({ label: w.weekLabel, min: w.minRate, upper: w.idealRate }))
            : undefined
      },
      studyTime: {
        title: type === 'monthly' ? '주차별 공부 시간' : '요일별 공부 시간',
        unit: 'h',
        bars: studyTimeBars
      },
      condition: {
        title: type === 'monthly' ? '이번 달 컨디션' : '이번 주 컨디션',
        rows: conditionBreakdown.listRows
      }
    },
    execution: {
      label: '실행 분석',
      subLabel: '계획을 어떻게 지켰는지',
      subjectShare: {
        title: '과목별 학습 비중',
        empty: subjectShare.empty,
        emptyMessage: '타이머 과목 데이터가 아직 충분히 누적되지 않았습니다.',
        rows: subjectShare.rows,
        tip: buildSubjectShareTip(subjectShare)
      },
      timeSlot: {
        title: '시간대별 학습 효율',
        rows: timeSlotBuckets,
        tip: buildTimeSlotTip(timeSlotBuckets)
      },
      distraction: {
        title: '학습 방해요인 분석',
        rows: distraction,
        tip: buildDistractionTip(distraction)
      }
    },
    outcome: {
      label: '성과의 변화',
      subLabel: '무엇을 끝냈고, 목표에 얼마나 가까워졌는지',
      coreItems: {
        title: '완료한 핵심 학습 항목',
        rows: coreItems,
        tip: buildCoreItemsTip(coreItems)
      },
      conditionTiles: {
        title: '컨디션별 학습량',
        tiles: conditionBreakdown.tiles,
        tip: buildConditionTip(conditionBreakdown.tiles)
      },
      admission: { title: '합격 가능성 변화' }
    },
    admission,
    mentorComment: mentorComment
      ? { title: '멘토 코멘트', dateLabel: `${kstYMD(new Date(mentorComment.written_at))} 작성`, body: mentorComment.body }
      : null
  };

  if (type === 'monthly') {
    const bestWeek = monthlyWeeks.length > 0 ? monthlyWeeks.reduce((a, b) => (b.minRate > a.minRate ? b : a)) : null;
    const learningType = buildMonthlyLearningType({
      idealRate,
      minRate,
      recordDays,
      elapsedDays: effectiveWindow.elapsedDays,
      bestWeek
    });
    report.strategy = {
      label: '다음 달 전략',
      subLabel: '지금 유형에서 무엇부터 바꿀지',
      learningType: { title: '이번 달 학습 유형 진단', ...learningType },
      plan: { title: '다음 달 관리 전략', rows: buildMonthlyStrategy({ distraction, weeks: monthlyWeeks, minTargetHours }) },
      expectedEffect: { title: '기대 효과', ...buildMonthlyExpectedEffect({ subjectShare, idealRate }) }
    };
  }

  return report;
}

// ---------------------------------------------------------------------------
// 학습방향 리포트(내신/정시)
// ---------------------------------------------------------------------------

/** 1~9등급 → GRADE_PERCENTILE 밴드 중앙값(백분위 근사). 정시 스케일 변환 전용, 등급 산출엔 쓰지 않는다. */
function gradeToPercentileMidpoint(grade) {
  const band = GRADE_PERCENTILE[Math.min(9, Math.max(1, Math.round(grade)))];
  if (!band) return 50;
  return round1((band.min + band.max) / 2);
}

/** naesin_scores → 학습방향 리포트 기간 옵션. records(자유 입력 회차)를 최신순으로, 온보딩 고정 회차를 그 뒤에 붙인다. */
function buildNaesinPeriodOptions(naesinScores) {
  const records = Array.isArray(naesinScores?.records) ? naesinScores.records : [];
  const sortedRecords = [...records].sort((a, b) => String(b.enteredAt || '').localeCompare(String(a.enteredAt || '')));

  const options = sortedRecords.map((r) => ({ value: `record:${r.term}`, label: r.term, entry: r }));

  for (const { key, label } of NAESIN_ROUNDS) {
    const entry = naesinScores?.[key];
    if (entry && entry.none !== true && entry.value !== undefined && entry.value !== '') {
      options.push({ value: `onboarding:${key}`, label, entry });
    }
  }

  return options;
}

/**
 * mock_exam_scores → 학습방향 리포트 기간 옵션. records(grades.js, 4과목·백분위 스케일)를
 * 최신순으로 우선하고, 온보딩 고정 회차(5과목·등급 스케일 — Step5MockExam)는
 * gradeToPercentileMidpoint로 근사 변환해 붙인다(판단 지점 — §"실측 구조" 스케일 차이,
 * 참조: api/goal/grades.js 헤더 주석 "온보딩과 완전히 다른 스케일이다").
 */
function buildJeongsiPeriodOptions(mockScores) {
  const records = Array.isArray(mockScores?.records) ? mockScores.records : [];
  const sortedRecords = [...records].sort((a, b) => String(b.examDate || '').localeCompare(String(a.examDate || '')));

  const options = sortedRecords.map((r) => ({ value: `record:${r.term}`, label: r.term, entry: r }));

  for (const { key, label } of MOCK_ROUNDS) {
    const entry = mockScores?.[key];
    if (entry && entry.none !== true) {
      const tamAvg = (toNum(entry.tam1) + toNum(entry.tam2)) / 2;
      const converted = {
        subjects: {
          korean: gradeToPercentileMidpoint(toNum(entry.kor)),
          math: gradeToPercentileMidpoint(toNum(entry.math)),
          english: gradeToPercentileMidpoint(toNum(entry.eng)),
          science: gradeToPercentileMidpoint(tamAvg)
        }
      };
      options.push({ value: `onboarding:${key}`, label, entry: converted });
    }
  }

  return options;
}

async function buildDirectionReport({ student, track, periodParam }) {
  const isNaesin = track === 'naesin';
  const options = isNaesin ? buildNaesinPeriodOptions(student.naesin_scores) : buildJeongsiPeriodOptions(student.mock_exam_scores);

  // 데이터가 하나도 없으면(회차 기록도, 온보딩 값도 없음) 온보딩 최초 산출값으로 대체한다
  // (student.js buildStudentPayload의 scores 블록과 동일 소스 — 이 값은 status='active'
  // 진입 조건상 항상 존재한다).
  const fallbackEntry = isNaesin ? { value: student.converted_grade } : { value: student.current_mogo };
  const chosenOption = options.find((o) => o.value === periodParam) || options[0] || { value: 'current', label: '최근 성적', entry: fallbackEntry };

  const nowYmd = kstYMD(new Date());
  const gradeSystem = deriveGradeSystem(student.grade, nowYmd);

  const subjectsRaw = isNaesin
    ? buildNaesinSubjectMetrics(student, chosenOption.entry)
    : buildJeongsiSubjectMetrics(student, chosenOption.entry);

  const subjects = subjectsRaw.map((s) => ({
    name: s.name,
    zoneLabel: s.zoneLabel,
    badge: s.badge,
    body: buildSubjectDirectionBody(s)
    // materials(추천 교재)는 렌더 생략(D13, 팀장 확정) — 필드 자체를 비워 SubjectDirectionCard가
    // 그 블록을 스킵하도록 한다(컴포넌트 쪽 조건부 렌더는 별도 수정).
  }));

  const avgValue = isNaesin
    ? round1(subjectsRaw.reduce((s, x) => s + x.grade, 0) / subjectsRaw.length)
    : computeJeongsiComposite(chosenOption.entry);

  const summary = buildDirectionSummary({
    track,
    subjects: subjectsRaw,
    avgValue,
    idealCut: isNaesin ? toNum(student.ideal_naesin_cut, null) : toNum(student.ideal_jungsi_cut, null),
    minCut: isNaesin ? toNum(student.min_naesin_cut, null) : toNum(student.min_jungsi_cut, null)
  });

  const meta = isNaesin
    ? `${chosenOption.label} ・평균 ${avgValue.toFixed(2)} 등급・${gradeSystem}`
    : `${chosenOption.label} 기준 · 종합 백분위 ${avgValue} · 평균 ${percentileGradeAverage(subjectsRaw)}등급 · ${gradeSystem}`;

  return {
    tab: track,
    heading: '내 학습 방향 리포트',
    meta: `${nowYmd.replace(/-/g, '.')} · 리포트`,
    periodChips: options.map((o) => ({ value: o.value, label: o.label })),
    activePeriod: chosenOption.value,
    summary: { meta, typeLabel: summary.typeLabel, body: summary.body },
    subjects
  };
}

/** 정시 subjects[].percentile을 등급으로 환산한 평균(요약 배너 "평균 X등급" 표기용). */
function percentileGradeAverage(subjectsRaw) {
  const grades = subjectsRaw.map((s) => percentileToGrade(s.percentile));
  return round1(grades.reduce((sum, g) => sum + g, 0) / grades.length).toFixed(2);
}

// ---------------------------------------------------------------------------
// 핸들러
// ---------------------------------------------------------------------------

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ detail: 'Method not allowed' });
  }

  try {
    const session = await openGoalSession(req);
    if (session.error) {
      return res.status(session.error.status).json(session.error.body);
    }

    const { supabaseAdmin, profileId, allowed } = session;

    // 조회형 규약 — student.js와 동일하게 미결제는 에러가 아니다.
    if (!allowed) {
      return res.status(200).json({ allowed: false });
    }

    const type = req.query?.type;
    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({ detail: 'type은 weekly|monthly|direction 중 하나여야 합니다.' });
    }

    const student = await fetchStudentRow(supabaseAdmin, profileId);

    // daily-record.js requireActiveStudent와 동일한 판정 순서 — 온보딩 미완료/컷 대기 학생은
    // 리포트를 만들 데이터 기반(rate/cut)이 없다.
    if (!student || !student.onboarded_at) {
      return res.status(409).json({ reason: 'not_onboarded' });
    }
    if (student.status !== 'active') {
      return res.status(409).json({ reason: 'awaiting_cuts' });
    }

    const nowYmd = kstYMD(new Date());

    if (type === 'direction') {
      const track = req.query?.track === 'jeongsi' ? 'jeongsi' : 'naesin';
      const report = await buildDirectionReport({ student, track, periodParam: req.query?.period });
      return res.status(200).json({ ok: true, report });
    }

    const report = await buildGrowthReport({
      supabaseAdmin,
      profileId,
      student,
      type,
      periodParam: req.query?.period,
      nowYmd
    });
    return res.status(200).json({ ok: true, report });
  } catch (error) {
    console.error('goal/report error:', error);
    return res.status(500).json({ detail: '처리 중 오류가 발생했습니다.' });
  }
}
