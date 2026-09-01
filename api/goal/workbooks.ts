// GET·POST·PUT·DELETE /api/goal/workbooks
// Authorization: Bearer <access_token>
//
// 목표관리 "나의 노력" 화면(과목별 문제집 진도)의 CRUD. student.js(조회형)와
// intake.js(쓰기형) 두 파일의 게이트 관례를 한 파일 안에서 메서드별로 나눠 쓴다 —
// GET은 미결제를 200 {allowed:false}로, 그 외는 403으로 돌려준다(goalRepo.js
// openGoalSession 주석 §9-1과 동일 규약). 계산 로직은 없다 — 소유자 판정과
// status(reading/done) 재계산만 이 파일이 맡고 나머지는 goalRepo.js에 위임한다.
//
// 응답 필드는 카멜 케이스(goalRepo.js buildWorkbookPayload). subject는 한글 라벨이
// 아니라 id(korean/math/english/science/etc)다 — 표시 문자열 변환은
// src/components/goal/subjectTokens.js가 프론트에서 담당한다.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  buildWorkbookPayload,
  computeWorkbookStatus,
  deleteWorkbookOwned,
  fetchWorkbookOwned,
  fetchWorkbooks,
  insertWorkbook,
  narrowGoalSession,
  openGoalSession,
  PAID_MESSAGE,
  updateWorkbookOwned,
} from "../_lib/goalRepo.js";
import { sendError } from "../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

// sql/76_goal_workbooks.sql goal_workbooks_subject_check와 정확히 같은 5종.
const SUBJECT_IDS = ["korean", "math", "english", "science", "etc"];

const TITLE_MAX_LENGTH = 100;
// 페이지 수 상한 — 실제 문제집 규모를 훨씬 웃도는 값으로 여유를 두되, 오입력(자릿수
// 실수)이 그대로 저장되는 것만 막는다.
const MAX_PAGES = 100000;

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

// intake.js isNumericInput과 동일한 사유 — boolean/객체가 Number()를 통해 조용히
// 숫자로 접히는 경로를 막는다.
function isNumericInput(raw: unknown) {
  return typeof raw === "number" || typeof raw === "string";
}

function isValidPageCount(
  raw: unknown,
  { min, max }: { min: number; max: number },
) {
  if (!isNumericInput(raw)) return false;
  const value = Number(raw);
  return Number.isInteger(value) && value >= min && value <= max;
}

function fail(detail: string) {
  return { status: 400, body: { detail } };
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

function validateId(rawId: unknown) {
  const id = Number(rawId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function validateCreateBody(body: unknown) {
  if (!isPlainObject(body))
    return { error: fail("요청 본문이 올바르지 않습니다.") };

  const subject = clean(body.subject);
  if (!SUBJECT_IDS.includes(subject))
    return { error: fail("과목을 선택해 주세요.") };

  const title = clean(body.title);
  if (!title) return { error: fail("문제집 이름을 입력해 주세요.") };
  if (title.length > TITLE_MAX_LENGTH)
    return { error: fail("문제집 이름이 너무 깁니다.") };

  if (!isValidPageCount(body.totalPages, { min: 1, max: MAX_PAGES })) {
    return {
      error: fail(`전체 페이지는 1~${MAX_PAGES} 사이의 숫자여야 합니다.`),
    };
  }
  const totalPages = Number(body.totalPages);

  let currentPage = 0;
  if (
    body.currentPage !== undefined &&
    body.currentPage !== null &&
    body.currentPage !== ""
  ) {
    if (!isValidPageCount(body.currentPage, { min: 0, max: MAX_PAGES })) {
      return { error: fail("현재 페이지는 0 이상의 숫자여야 합니다.") };
    }
    currentPage = Number(body.currentPage);
  }
  // 전체 페이지를 넘는 현재 페이지는 완독으로 클램프한다 — total을 넘는 진도는
  // 의미가 없고, 아래 status 계산(current >= total)이 그대로 성립해야 한다.
  currentPage = Math.min(currentPage, totalPages);

  return { value: { subject, title, totalPages, currentPage } };
}

/**
 * PUT 바디를 검증한다. subject는 수정 대상에서 뺐다 — 등록 후 과목을 바꾸면
 * EffortSubjectCard 카드 간 이동이 되는데, 그 동선이 시안에 없다(추정 회피).
 * 과목을 바꾸려면 삭제 후 재등록해야 한다.
 */
function validateUpdateBody(body: unknown) {
  if (!isPlainObject(body))
    return { error: fail("요청 본문이 올바르지 않습니다.") };

  const id = validateId(body.id);
  if (!id) return { error: fail("문제집을 찾을 수 없습니다.") };

  const patch: { title?: string; totalPages?: number; currentPage?: number } =
    {};

  if (body.title !== undefined) {
    const title = clean(body.title);
    if (!title) return { error: fail("문제집 이름을 입력해 주세요.") };
    if (title.length > TITLE_MAX_LENGTH)
      return { error: fail("문제집 이름이 너무 깁니다.") };
    patch.title = title;
  }

  if (body.totalPages !== undefined) {
    if (!isValidPageCount(body.totalPages, { min: 1, max: MAX_PAGES })) {
      return {
        error: fail(`전체 페이지는 1~${MAX_PAGES} 사이의 숫자여야 합니다.`),
      };
    }
    patch.totalPages = Number(body.totalPages);
  }

  if (body.currentPage !== undefined) {
    if (!isValidPageCount(body.currentPage, { min: 0, max: MAX_PAGES })) {
      return { error: fail("현재 페이지는 0 이상의 숫자여야 합니다.") };
    }
    patch.currentPage = Number(body.currentPage);
  }

  if (Object.keys(patch).length === 0) {
    return { error: fail("변경할 값이 없습니다.") };
  }

  return { value: { id, patch } };
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

    const { allowed } = session;

    if (req.method === "GET") {
      // 조회형 규약 — 미결제는 에러가 아니다(student.js와 동일).
      if (!allowed) return res.status(200).json({ allowed: false });

      const { supabaseAdmin, profileId } = narrowGoalSession(session);
      const rows = await fetchWorkbooks(supabaseAdmin, profileId);
      return res
        .status(200)
        .json({ ok: true, workbooks: rows.map(buildWorkbookPayload) });
    }

    // 이하 전부 쓰기형이므로 미결제는 403이다(intake.js와 동일).
    if (!allowed) return res.status(403).json({ detail: PAID_MESSAGE });

    const { supabaseAdmin, profileId } = narrowGoalSession(session);
    const body = readBody(req);

    if (req.method === "POST") {
      const validated = validateCreateBody(body);
      if (validated.error)
        return res.status(validated.error.status).json(validated.error.body);

      const { subject, title, totalPages, currentPage } = validated.value;
      const row = await insertWorkbook(supabaseAdmin, {
        profile_id: profileId,
        subject,
        title,
        total_pages: totalPages,
        current_page: currentPage,
        status: computeWorkbookStatus(currentPage, totalPages),
      });

      return res
        .status(200)
        .json({ ok: true, workbook: buildWorkbookPayload(row) });
    }

    if (req.method === "PUT") {
      const validated = validateUpdateBody(body);
      if (validated.error)
        return res.status(validated.error.status).json(validated.error.body);

      const { id, patch } = validated.value;
      const existing = await fetchWorkbookOwned(supabaseAdmin, id, profileId);
      if (!existing)
        return res.status(404).json({ detail: "문제집을 찾을 수 없습니다." });

      // 바뀌지 않은 필드는 기존 값을 그대로 되먹여 항상 완전한 행을 쓴다 —
      // 부분 patch 조립보다 단순하고, current_page/total_pages 조합이 바뀔 때마다
      // status를 놓치지 않는다(sql/76 status 컬럼 코멘트와 동일 규약).
      const nextTotalPages = patch.totalPages ?? existing.total_pages;
      const nextCurrentPage = Math.min(
        patch.currentPage ?? existing.current_page,
        nextTotalPages,
      );

      const updated = await updateWorkbookOwned(supabaseAdmin, id, profileId, {
        title: patch.title ?? existing.title,
        total_pages: nextTotalPages,
        current_page: nextCurrentPage,
        status: computeWorkbookStatus(nextCurrentPage, nextTotalPages),
      });

      if (!updated)
        return res.status(404).json({ detail: "문제집을 찾을 수 없습니다." });
      return res
        .status(200)
        .json({ ok: true, workbook: buildWorkbookPayload(updated) });
    }

    // DELETE
    const id = validateId(body?.id);
    if (!id)
      return res.status(400).json({ detail: "문제집을 찾을 수 없습니다." });

    const deleted = await deleteWorkbookOwned(supabaseAdmin, id, profileId);
    if (!deleted)
      return res.status(404).json({ detail: "문제집을 찾을 수 없습니다." });

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("goal/workbooks error:", error);
    return sendError(res, "detail", 500, "처리 중 오류가 발생했습니다.");
  }
}
