// GET|POST|PUT|DELETE /api/goal/plan-tasks
// Authorization: Bearer <access_token>
//
// 목표관리 학습 계획(주간 계획표 WeeklyPlan.jsx + 대시보드 "오늘 학습 계획" 레일
// StudyPlanRail.jsx)이 공유하는 과제 CRUD. 스키마는 sql/75_goal_plan_tasks.sql.
//
// 이 파일 하나가 4개 메서드를 전부 받는다 — student.js/intake.js처럼 메서드당
// 파일을 쪼개면 GET(조회)과 POST/PUT/DELETE(쓰기)가 게이트 문구만 다를 뿐
// openGoalSession 호출·소유자 스코프 로직이 그대로 중복되고, 클라이언트도
// 엔드포인트 하나를 CRUD 네 동사로 부르는 편이 REST 관행에 더 가깝다.
//
// ── 미결제 처리가 메서드마다 다른 이유 ──────────────────────────────────────
// GET은 조회형이라 200 {allowed:false}(§ api/goal/student.js 관례), 나머지
// 셋은 쓰기형이라 403 PAID_MESSAGE(§ api/goal/intake.js 관례)다. 조회형을
// 403으로 주면 entitlement.js가 그걸 "판정 불가(null)"로 접어 가드가
// 오작동한다 — 두 파일에 이미 있는 규약을 그대로 따른다.
//
// ── "일정(오늘만/이번 주만/매주 반복)" 은 이 API 계약에 없다 ────────────────
// AddTaskModal의 스케줄 셀렉트는 반복 규칙이 아니라 "몇 개의 plan_date에
// 각각 1행씩 만들지"를 결정하는 클라이언트 판단이다(sql/75 헤더 주석,
// src/lib/goalPlanUtils.js). 이 라우트는 단건 CRUD만 알고, 여러 날짜에
// 걸친 반복 생성은 클라이언트가 POST를 날짜 수만큼 반복 호출해서 만든다.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  buildPlanTaskPayload,
  deletePlanTask,
  fetchPlanTasks,
  insertPlanTask,
  narrowGoalSession,
  openGoalSession,
  PAID_MESSAGE,
  SUBJECT_LABEL_TO_CODE,
  updatePlanTask,
} from "../_lib/goalRepo.js";
import { sendError } from "../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

// goalRepo.js(.js, Stage3 대상)의 openGoalSession 반환 shape을 그 함수 자체에서
// 추론해 재사용한다(중복 선언 없이 JSDoc이 바뀌면 여기도 함께 따라간다).
type GoalSession = Awaited<ReturnType<typeof openGoalSession>>;

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const TITLE_MAX_LENGTH = 100;
const DURATION_MAX_MINUTES = 24 * 60;
// GET 기간 상한(일). WeeklyPlan.jsx는 항상 7일, StudyPlanRail.jsx는 1일 창만 쓴다 —
// 이 API 계약이 명시하지 않은 값이라 방어적으로 넓게(약 2개월) 잡았다(판단 기록).
const MAX_RANGE_DAYS = 62;

// 검증기는 전부 `return { error: fail(400, ...) }` 형태로 감싸 호출한다 — 그래서
// fail() 자신은 { status, body }만 반환해야 한다({ error: {...} }로 한 번 더 감싸면
// 호출부의 `x.error.status`가 정의되지 않아 res.status(undefined)가 ERR_HTTP_INVALID_STATUS_CODE로
// 500을 던진다 — 스모크에서 잡힌 이중 래핑 버그, 수정).
function fail(status: number, detail: string, extra?: Record<string, unknown>) {
  return { status, body: { detail, ...extra } };
}

function isValidYmd(value: unknown): value is string {
  if (typeof value !== "string" || !YMD_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

// ---------------------------------------------------------------------------
// 필드 검증기 — 셋 다 값이 없으면(undefined) "제공되지 않음"으로 통과시킨다.
// PUT은 부분 수정이라 있는 필드만 검증·반영해야 한다.
// ---------------------------------------------------------------------------

/** @returns {{error?:object, value?:string}} */
function validateTitle(raw: unknown) {
  if (typeof raw !== "string")
    return { error: fail(400, "과제 내용을 입력해 주세요.") };
  const title = raw.trim();
  if (!title || title.length > TITLE_MAX_LENGTH) {
    return {
      error: fail(400, `과제 내용은 1~${TITLE_MAX_LENGTH}자 사이여야 합니다.`),
    };
  }
  return { value: title };
}

/** @returns {{error?:object, value?:string}} 한글 라벨 → DB 코드. */
function validateSubject(raw: unknown) {
  const code = SUBJECT_LABEL_TO_CODE[String(raw ?? "").trim()];
  if (!code) return { error: fail(400, "과목을 선택해 주세요.") };
  return { value: code };
}

/** @returns {{error?:object, value?:number}} */
function validateDurationMinutes(raw: unknown) {
  if (raw === undefined || raw === null) return { value: 0 };
  if (
    typeof raw !== "number" ||
    !Number.isFinite(raw) ||
    raw < 0 ||
    raw > DURATION_MAX_MINUTES
  ) {
    return {
      error: fail(
        400,
        `예상 소요 시간은 0~${DURATION_MAX_MINUTES}분 사이여야 합니다.`,
      ),
    };
  }
  return { value: Math.round(raw) };
}

function validatePlanDate(raw: unknown) {
  if (!isValidYmd(raw))
    return { error: fail(400, "날짜 형식이 올바르지 않습니다(YYYY-MM-DD).") };
  return { value: raw };
}

function validateId(raw: unknown) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0)
    return { error: fail(400, "과제 id가 올바르지 않습니다.") };
  return { value: id };
}

const PLAN_TASK_STATUSES = new Set(["pending", "done", "fail"]);

/** @returns {{error?:object, value?:"pending"|"done"|"fail"}} */
function validateStatus(raw: unknown) {
  if (typeof raw !== "string" || !PLAN_TASK_STATUSES.has(raw)) {
    return {
      error: fail(400, "status는 pending/done/fail 중 하나여야 합니다."),
    };
  }
  return { value: raw as "pending" | "done" | "fail" };
}

// ---------------------------------------------------------------------------
// 메서드별 핸들러
// ---------------------------------------------------------------------------

async function handleGet(
  req: VercelRequest,
  res: VercelResponse,
  session: GoalSession,
) {
  const { allowed } = session;

  // 조회형 규약 — 미결제는 에러가 아니다(§ api/goal/student.js).
  if (!allowed) return res.status(200).json({ allowed: false });

  const { supabaseAdmin, profileId } = narrowGoalSession(session);

  const from = req.query?.from;
  const to = req.query?.to;
  if (!isValidYmd(from) || !isValidYmd(to)) {
    return res
      .status(400)
      .json({ detail: "from/to는 YYYY-MM-DD 형식이어야 합니다." });
  }
  if (from > to) {
    return res.status(400).json({ detail: "from은 to보다 이전이어야 합니다." });
  }
  const rangeDays =
    (new Date(`${to}T00:00:00Z`).getTime() -
      new Date(`${from}T00:00:00Z`).getTime()) /
    86400000;
  if (rangeDays > MAX_RANGE_DAYS) {
    return res
      .status(400)
      .json({ detail: `조회 기간은 최대 ${MAX_RANGE_DAYS}일까지 가능합니다.` });
  }

  const rows = await fetchPlanTasks(supabaseAdmin, profileId, from, to);
  return res
    .status(200)
    .json({ ok: true, tasks: rows.map(buildPlanTaskPayload) });
}

async function handlePost(
  req: VercelRequest,
  res: VercelResponse,
  session: GoalSession,
) {
  const { allowed } = session;
  if (!allowed) return res.status(403).json({ detail: PAID_MESSAGE });

  const { supabaseAdmin, profileId } = narrowGoalSession(session);

  const body = readBody(req);
  if (!isPlainObject(body))
    return res.status(400).json({ detail: "요청 본문이 올바르지 않습니다." });

  const planDate = validatePlanDate(body.planDate);
  if (planDate.error)
    return res.status(planDate.error.status).json(planDate.error.body);

  const title = validateTitle(body.title);
  if (title.error) return res.status(title.error.status).json(title.error.body);

  const subject = validateSubject(body.subject);
  if (subject.error)
    return res.status(subject.error.status).json(subject.error.body);

  const duration = validateDurationMinutes(body.durationMinutes);
  if (duration.error)
    return res.status(duration.error.status).json(duration.error.body);

  const row = await insertPlanTask(supabaseAdmin, {
    profile_id: profileId,
    plan_date: planDate.value,
    title: title.value,
    subject: subject.value,
    duration_minutes: duration.value,
  });

  return res.status(200).json({ ok: true, task: buildPlanTaskPayload(row) });
}

async function handlePut(
  req: VercelRequest,
  res: VercelResponse,
  session: GoalSession,
) {
  const { allowed } = session;
  if (!allowed) return res.status(403).json({ detail: PAID_MESSAGE });

  const { supabaseAdmin, profileId } = narrowGoalSession(session);

  const body = readBody(req);
  if (!isPlainObject(body))
    return res.status(400).json({ detail: "요청 본문이 올바르지 않습니다." });

  const id = validateId(body.id);
  if (id.error) return res.status(id.error.status).json(id.error.body);

  // 부분 수정 — 요청에 실려온 필드만 검증·반영한다.
  const patch: {
    title?: string;
    subject?: string;
    duration_minutes?: number;
    plan_date?: string;
    status?: "pending" | "done" | "fail";
    done?: boolean;
  } = {};

  if (body.title !== undefined) {
    const title = validateTitle(body.title);
    if (title.error)
      return res.status(title.error.status).json(title.error.body);
    patch.title = title.value;
  }

  if (body.subject !== undefined) {
    const subject = validateSubject(body.subject);
    if (subject.error)
      return res.status(subject.error.status).json(subject.error.body);
    patch.subject = subject.value;
  }

  if (body.durationMinutes !== undefined) {
    const duration = validateDurationMinutes(body.durationMinutes);
    if (duration.error)
      return res.status(duration.error.status).json(duration.error.body);
    patch.duration_minutes = duration.value;
  }

  if (body.planDate !== undefined) {
    const planDate = validatePlanDate(body.planDate);
    if (planDate.error)
      return res.status(planDate.error.status).json(planDate.error.body);
    patch.plan_date = planDate.value;
  }

  // status가 단일 원본(QA 행305) — done은 status에서 파생해 항상 함께 갱신한다.
  // ✓ 버튼(체크)은 done↔pending, ✕ 버튼은 fail↔pending을 토글하는 판단은
  // 클라이언트(StudyPlanRail.tsx nextPlanTaskStatus)가 다음 status를 계산해
  // 그대로 실어 보낸다 — 이 라우트는 유효한 3값인지만 검증한다.
  if (body.status !== undefined) {
    const status = validateStatus(body.status);
    if (status.error)
      return res.status(status.error.status).json(status.error.body);
    patch.status = status.value;
    patch.done = status.value === "done";
  }

  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ detail: "수정할 필드가 없습니다." });
  }

  const row = await updatePlanTask(supabaseAdmin, profileId, id.value, patch);
  if (!row) return res.status(404).json({ detail: "과제를 찾을 수 없습니다." });

  return res.status(200).json({ ok: true, task: buildPlanTaskPayload(row) });
}

async function handleDelete(
  req: VercelRequest,
  res: VercelResponse,
  session: GoalSession,
) {
  const { allowed } = session;
  if (!allowed) return res.status(403).json({ detail: PAID_MESSAGE });

  const { supabaseAdmin, profileId } = narrowGoalSession(session);

  const body = readBody(req);
  if (!isPlainObject(body))
    return res.status(400).json({ detail: "요청 본문이 올바르지 않습니다." });

  const id = validateId(body.id);
  if (id.error) return res.status(id.error.status).json(id.error.body);

  const deleted = await deletePlanTask(supabaseAdmin, profileId, id.value);
  if (!deleted)
    return res.status(404).json({ detail: "과제를 찾을 수 없습니다." });

  return res.status(200).json({ ok: true });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!["GET", "POST", "PUT", "DELETE"].includes(req.method || "")) {
    return sendError(res, "detail", 405, "Method not allowed");
  }

  try {
    const session = await openGoalSession(req);
    if (session.error) {
      return sendError(
        res,
        "detail",
        session.error.status,
        session.error.body.detail as string,
      );
    }

    switch (req.method) {
      case "GET":
        return await handleGet(req, res, session);
      case "POST":
        return await handlePost(req, res, session);
      case "PUT":
        return await handlePut(req, res, session);
      case "DELETE":
        return await handleDelete(req, res, session);
      default:
        // 위 405 가드가 이미 걸렀다 — 도달하지 않는다.
        return sendError(res, "detail", 405, "Method not allowed");
    }
  } catch (error) {
    console.error("goal/plan-tasks error:", error);
    return sendError(res, "detail", 500, "처리 중 오류가 발생했습니다.");
  }
}
