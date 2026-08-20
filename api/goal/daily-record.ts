// GET/POST /api/goal/daily-record
// Authorization: Bearer <access_token>
//
// 목표관리 "오늘의 공부 기록"(#26 페이지) · "오늘의 목표" 대시보드 카드가 공유하는
// 일별 기록 엔드포인트. 컨벤션은 api/goal/intake.js · api/goal/student.js 하우스
// 스타일을 그대로 따른다(openGoalSession, config.runtime, 405/401/403/500 형태).
//
// ── 실제 달력 모델(팀장 작업 지시 "배경" 절, 확정 설계 — 변경 금지) ──────────
// goal_daily_records.record_index 는 "제출 순번"이 아니라
// actual_start_date 부터 **실제 KST 경과 일수**다(diffDaysYMD). record_date 는
// 실제 오늘(KST) 그 자체다. (profile_id, record_date) UNIQUE 가 하루 1행을
// 보장하고, 당일 재제출은 upsert(= 갱신 + delta 재계산)로 처리한다 — 과거 날짜
// 쓰기는 불가능하다(recordIndex 가 음수면 400).
//
// ── 수식 v2 ─────────────────────────────────────────────────────────────
// delta = rate × 달성률배수 × 컨디션배수 × 과목태그배수. 계산은 전부
// src/lib/goal/calc/bonusV2.js(calculateDailyBonusV2)에 위임한다 — 이 파일은
// DB 컬럼 ↔ 계산 함수 인자를 잇는 배선만 한다(bonus.js/pipeline.js 는 동결,
// 이 파일이 재구현하지 않는다).
//
// ── 부분 제출(카드 vs 페이지) ────────────────────────────────────────────
// 대시보드 "오늘의 목표" 카드는 studyHours만 보낸다. "오늘의 공부 기록" 페이지는
// bodyCondition/reasons/tasks/memo(+선택적으로 studyHours)를 보낸다. 이 라우트는
// 바디에 있는 필드만 교체하고 나머지는 오늘 기존 행의 값을 유지한다(merge) —
// 그래서 카드 제출이 페이지에서 이미 기록한 컨디션·태그를 지우지 않고, 페이지
// 제출도 카드가 이미 기록한 순공 시간을 지우지 않는다.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  calculateDailyBonusV2,
  diffDaysYMD,
  getDayIndexFromYMDServer,
  kstYMD,
  VIRTUAL_DAY_NAMES,
} from "../../src/lib/goal/calc/index.js";
import {
  appendProbabilityLog,
  fetchStudentRow,
  fetchStudentStateRow,
  fetchTodayRecord,
  narrowGoalSession,
  num,
  openGoalSession,
  PAID_MESSAGE,
  upsertDailyRecord,
} from "../_lib/goalRepo.js";

export const config = { runtime: "nodejs" };

// goalRepo.js(.js, Stage3 대상)의 openGoalSession 반환 shape을 그 함수 자체에서
// 추론해 재사용한다(중복 선언 없이 JSDoc이 바뀌면 여기도 함께 따라간다).
type GoalSession = Awaited<ReturnType<typeof openGoalSession>>;

// ---------------------------------------------------------------------------
// 화이트리스트 — 코드값 → 한글 라벨 (src/components/goal/studyRecordOptions.js 와 글자 단위로 같다)
// ---------------------------------------------------------------------------

// STUDY_ITEM_OPTIONS(studyRecordOptions.js:49-56). schoolSubject→'내신 과목' /
// mockExam→'기출/모의고사' 는 bonusV2.js 의 TASK_NAESIN/TASK_MOCK_EXAM 태그 가산
// 입력이기도 하다 — 라벨이 어긋나면 태그 가산이 조용히 0배가 된다.
export const TASK_LABELS = {
  concept: "개념 학습",
  academyHomework: "학원 숙제",
  wrongAnswerReview: "오답 정리",
  schoolSubject: "내신 과목",
  mockExam: "기출/모의고사",
  etc: "기타",
};

// DISTURBANCE_OPTIONS(studyRecordOptions.js:40-46). 수식 미반영 — 기록 전용(팀장 지시).
export const REASON_LABELS = {
  academySchedule: "수업 · 학원 일정",
  smartphone: "스마트폰",
  fatigue: "피로 · 수면 부족",
  distraction: "집중 안 됨",
  none: "없었음",
};

// CONDITION_OPTIONS(studyRecordOptions.js:31-36). sql/73_goal_daily_record_v2.sql 의
// body_condition CHECK 값 도메인과 정확히 같다(빈 문자열 별도 허용).
export const BODY_CONDITIONS = new Set(["great", "normal", "tired", "exhausted"]);

const MEMO_MAX_LENGTH = 1000;
const STUDY_HOURS_MAX = 24;

// ---------------------------------------------------------------------------
// 값 검증 헬퍼 (api/goal/intake.js 관례 재사용 — 화이트리스트 우선, 클라이언트 값 불신)
// ---------------------------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNumericInput(raw: unknown) {
  return typeof raw === "number" || typeof raw === "string";
}

// unwrapped {status, body}를 돌려준다 — 호출부가 항상 `return { error: fail(...) }`
// 형태의 object literal로 감싸야 TS가 형제 프로퍼티를 undefined로 자동 추론해
// gate.error / tasksResult.error 접근이 좁혀진다(순수 타입 추론 편의, 런타임
// JSON 응답 바이트는 이전과 동일 — { error: { status, body } }).
function fail(status: number, body: Record<string, unknown>) {
  return { status, body };
}

function readBody(req: VercelRequest) {
  const body = req.body;
  if (typeof body !== "string") return body;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

/**
 * 코드값 배열 → 한글 라벨 배열. body 에 키 자체가 없으면(undefined) "미제출"로 보고
 * value:undefined 를 돌려준다(병합 단계에서 기존 값을 유지하는 신호) — 빈 배열([])과
 * 다르다(빈 배열은 "전부 지움"이라는 유효한 제출이다).
 */
function mapWhitelist(
  rawArray: unknown,
  labelMap: Record<string, string>,
  label: string,
) {
  if (rawArray === undefined) return { value: undefined };
  if (!Array.isArray(rawArray)) {
    return {
      error: fail(400, { detail: `${label} 형식이 올바르지 않습니다.` }),
    };
  }

  const mapped: string[] = [];
  for (const code of rawArray) {
    const mappedLabel = labelMap[String(code)];
    if (!mappedLabel) {
      return {
        error: fail(400, { detail: `${label}에 알 수 없는 값이 있습니다.` }),
      };
    }
    mapped.push(mappedLabel);
  }
  return { value: mapped };
}

// ---------------------------------------------------------------------------
// 학생 상태 게이트 — GET/POST 공용
// ---------------------------------------------------------------------------

/**
 * 온보딩 완료(status='active') 학생인지 확인한다. 아니면 409 를 돌려준다.
 * 순서 판단(둘 다 spec 문구 그대로): onboarded_at 이 null 이면(행 자체가 없는 경우
 * 포함) 애초에 온보딩을 완료한 적이 없는 것이라 'not_onboarded' — status='awaiting_cuts'
 * 행은 항상 onboarded_at 이 null 이므로(sql/55) 이 분기에서 함께 걸린다. onboarded_at
 * 은 있는데 status 가 'active' 가 아니면(paused) 'awaiting_cuts' 사유로 막는다.
 */
async function requireActiveStudent(
  // handleGet/handlePost가 session.error 체크를 통과한 뒤 narrowGoalSession()으로
  // 좁힌 값만 넘기므로 항상 존재한다(비-optional로 받는다).
  supabaseAdmin: NonNullable<GoalSession["supabaseAdmin"]>,
  profileId: NonNullable<GoalSession["profileId"]>,
) {
  const row = await fetchStudentRow(supabaseAdmin, profileId);

  if (!row?.onboarded_at) {
    return { error: fail(409, { reason: "not_onboarded" }) };
  }
  if (row.status !== "active") {
    return { error: fail(409, { reason: "awaiting_cuts" }) };
  }

  return { row };
}

// fetchTodayRecord/fetchStudentStateRow(goalRepo.js, Stage3 대상)는 JSDoc
// @returns 타입 없이 raw DB row(any)를 그대로 돌려준다 — 이 두 빌더의 인자만
// any로 받는다(goalRepo.js 자체는 수정하지 않는다).

/** DB 행(snake) → API 응답 record 블록(camel). GET/POST 응답이 완전히 같은 모양을 쓴다. */
// biome-ignore lint/suspicious/noExplicitAny: goalRepo.js fetchTodayRecord가 타입을 내보내지 않는다(Stage3 대상).
function buildRecordPayload(row: any) {
  if (!row) return null;
  return {
    recordIndex: num(row.record_index),
    recordDate: row.record_date,
    studyHours: num(row.study_hours) ?? 0,
    bodyCondition: row.body_condition || "",
    tasks: row.tasks || [],
    reasons: row.reasons || [],
    memo: row.memo || "",
  };
}

// biome-ignore lint/suspicious/noExplicitAny: goalRepo.js fetchStudentStateRow가 타입을 내보내지 않는다(Stage3 대상).
function buildProbsPayload(stateRow: any) {
  const state = stateRow || {};
  return {
    idealSusi: num(state.ideal_susi),
    idealJungsi: num(state.ideal_jungsi),
    minSusi: num(state.min_susi),
    minJungsi: num(state.min_jungsi),
  };
}

// ---------------------------------------------------------------------------
// GET — 오늘(KST) 기록 조회(프리필용)
// ---------------------------------------------------------------------------

async function handleGet(
  _req: VercelRequest,
  res: VercelResponse,
  session: GoalSession,
) {
  const { allowed } = session;

  // 조회형 규약 — student.js:50-53 과 동일하게 미결제는 에러가 아니다.
  if (!allowed) {
    return res.status(200).json({ allowed: false });
  }

  const { supabaseAdmin, profileId } = narrowGoalSession(session);

  const gate = await requireActiveStudent(supabaseAdmin, profileId);
  if (gate.error) {
    return res.status(gate.error.status).json(gate.error.body);
  }

  const now = new Date();
  const recordDate = kstYMD(now);

  const [record, stateRow] = await Promise.all([
    fetchTodayRecord(supabaseAdmin, profileId, recordDate),
    fetchStudentStateRow(supabaseAdmin, profileId),
  ]);

  return res.status(200).json({
    ok: true,
    record: buildRecordPayload(record),
    probs: buildProbsPayload(stateRow),
  });
}

// ---------------------------------------------------------------------------
// POST — 오늘 기록 upsert(부분 제출 허용, 재제출 = 갱신 + delta 재계산)
// ---------------------------------------------------------------------------

async function handlePost(
  req: VercelRequest,
  res: VercelResponse,
  session: GoalSession,
) {
  const { allowed } = session;

  // 쓰기형이므로 미결제는 403 이다(intake.js:545-548 과 동일 규약).
  if (!allowed) {
    return res.status(403).json({ detail: PAID_MESSAGE });
  }

  const { supabaseAdmin, profileId } = narrowGoalSession(session);

  const gate = await requireActiveStudent(supabaseAdmin, profileId);
  if (gate.error) {
    return res.status(gate.error.status).json(gate.error.body);
  }
  const student = gate.row;

  const body = readBody(req);
  if (!isPlainObject(body)) {
    return res.status(400).json({ detail: "요청 본문이 올바르지 않습니다." });
  }

  const now = new Date();
  const recordDate = kstYMD(now);

  // 실제 달력 모델의 정본 계산 — "제출 N번째"가 아니라 시작일부터 실제 경과 일수.
  const recordIndex = diffDaysYMD(student.actual_start_date, recordDate, now);
  if (!Number.isFinite(recordIndex) || recordIndex < 0) {
    return res.status(400).json({ reason: "before_start_date" });
  }

  const existing = await fetchTodayRecord(supabaseAdmin, profileId, recordDate);

  // ── 병합 — 바디에 있는 필드만 교체, 없으면 기존 행 값 유지 ────────────────
  const tasksResult = mapWhitelist(body.tasks, TASK_LABELS, "학습 항목");
  if (tasksResult.error)
    return res.status(tasksResult.error.status).json(tasksResult.error.body);

  const reasonsResult = mapWhitelist(body.reasons, REASON_LABELS, "방해 요인");
  if (reasonsResult.error)
    return res
      .status(reasonsResult.error.status)
      .json(reasonsResult.error.body);

  const tasks =
    tasksResult.value !== undefined ? tasksResult.value : existing?.tasks || [];
  const reasons =
    reasonsResult.value !== undefined
      ? reasonsResult.value
      : existing?.reasons || [];

  // bodyCondition — 신규 값이 오면 화이트리스트 검증, 없으면 기존 값 유지, 그마저
  // 없으면(오늘 첫 제출이 카드-only) ''(빈 문자열)로 둔다. bonusV2 는 ''를
  // CONDITION_MULTIPLIER 미매칭 → normal(1.0) 로 적용한다(팀장 지시 "카드 최초 제출은
  // condition 미보유 허용" 규칙).
  let bodyCondition: string;
  if (body.bodyCondition !== undefined) {
    // Set.has()는 런타임에 타입이 달라도(string이 아니어도) 그냥 false를 준다 —
    // as string은 그 동작을 바꾸지 않고 TS 인자 타입만 맞춘다.
    if (!BODY_CONDITIONS.has(body.bodyCondition as string)) {
      return res.status(400).json({ detail: "컨디션 값이 올바르지 않습니다." });
    }
    bodyCondition = body.bodyCondition as string;
  } else {
    bodyCondition = existing?.body_condition || "";
  }

  // memo — trim + 1000자 컷. 신규 값이 없으면 기존 값 유지.
  let memo: string;
  if (body.memo !== undefined) {
    if (typeof body.memo !== "string") {
      return res.status(400).json({ detail: "메모 형식이 올바르지 않습니다." });
    }
    memo = body.memo.trim().slice(0, MEMO_MAX_LENGTH);
  } else {
    memo = existing?.memo || "";
  }

  // studyHours — 병합 결과에 최종 검증을 건다(부분 제출이라 "이 요청에 studyHours가
  // 없었다"와 "0시간을 제출했다"를 구분해야 한다 — 후자만 명시적 400 사유를 준다).
  let studyHoursInput: number;
  if (body.studyHours !== undefined) {
    if (!isNumericInput(body.studyHours)) {
      return res
        .status(400)
        .json({ detail: "순공 시간 형식이 올바르지 않습니다." });
    }
    studyHoursInput = Number(body.studyHours);
  } else {
    studyHoursInput = num(existing?.study_hours) ?? 0;
  }

  if (
    !Number.isFinite(studyHoursInput) ||
    studyHoursInput <= 0 ||
    studyHoursInput > STUDY_HOURS_MAX
  ) {
    return res.status(400).json({ reason: "no_study_time" });
  }
  const studyHours = Math.round(studyHoursInput * 10) / 10;

  // ── 오늘 적용 목표 시간 스냅샷 — study_schedule[요일] ──────────────────
  const dayIndex = getDayIndexFromYMDServer(recordDate, now);
  // biome-ignore lint/style/noNonNullAssertion: getDayIndexFromYMDServer는 항상 0-6을 돌려줌(7개 배열)
  const dayName = VIRTUAL_DAY_NAMES[dayIndex]!;
  const daySchedule = student.study_schedule?.[dayName] || {
    ideal: 0,
    min: 0,
  };
  const idealHours = num(daySchedule.ideal) ?? 0;
  const minHours = num(daySchedule.min) ?? 0;

  // ── 수식 v2 — rate 는 온보딩 시 1회 산출된 값(goal_students.rate_*). 정시 컷이
  // 없어 null 인 학생은 0 취급(그 목표엔 애초에 게이지가 없다, jungsiAvailable=false
  // 와 동일한 판정 — goalRepo.js buildStudentPayload 참고).
  const delta = calculateDailyBonusV2({
    idealSusiRate: num(student.rate_ideal_susi) ?? 0,
    idealJungsiRate: num(student.rate_ideal_jungsi) ?? 0,
    minSusiRate: num(student.rate_min_susi) ?? 0,
    minJungsiRate: num(student.rate_min_jungsi) ?? 0,
    condition: bodyCondition,
    tasks,
    studyHours,
    idealHours,
    minHours,
  });

  const payload = {
    profile_id: profileId,
    record_index: recordIndex,
    record_date: recordDate,
    submitted_on: kstYMD(now),

    study_hours: studyHours,
    achievement: "",
    focus: "",
    body_condition: bodyCondition,
    reasons,
    tasks,
    memo,

    target_ideal_hours: idealHours,
    target_min_hours: minHours,

    delta_ideal_susi: delta.idealSusiBonus,
    delta_ideal_jungsi: delta.idealJungsiBonus,
    delta_min_susi: delta.minSusiBonus,
    delta_min_jungsi: delta.minJungsiBonus,
  };

  const savedRow = await upsertDailyRecord(supabaseAdmin, payload);

  const stateRow = await fetchStudentStateRow(supabaseAdmin, profileId);
  const probs = buildProbsPayload(stateRow);

  await appendProbabilityLog(
    supabaseAdmin,
    profileId,
    probs,
    "daily_record",
    savedRow.id,
  );

  return res.status(200).json({
    ok: true,
    record: buildRecordPayload(savedRow),
    delta: {
      idealSusi: delta.idealSusiBonus,
      idealJungsi: delta.idealJungsiBonus,
      minSusi: delta.minSusiBonus,
      minJungsi: delta.minJungsiBonus,
    },
    probs,
    recordCount: num(stateRow?.record_count) ?? 0,
  });
}

// ---------------------------------------------------------------------------
// 핸들러
// ---------------------------------------------------------------------------

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ detail: "Method not allowed" });
  }

  try {
    const session = await openGoalSession(req);
    if (session.error) {
      return res.status(session.error.status).json(session.error.body);
    }

    if (req.method === "GET") {
      return await handleGet(req, res, session);
    }
    return await handlePost(req, res, session);
  } catch (error) {
    console.error("goal/daily-record error:", error);
    return res.status(500).json({ detail: "처리 중 오류가 발생했습니다." });
  }
}
