// GET /api/goal/student
// Authorization: Bearer <access_token>
//
// 목표관리 대시보드가 필요로 하는 학생 상태를 한 번에 반환한다 —
// 학생 마스터(목표·성적·기준확률·증분율·주간 목표) + 현재확률(뷰가 재계산) +
// 기록 요약(건수·마지막 가상 날짜). 계약 전문은
// docs/figma-goal/goal-schema-design.md §9-4.
//
// ── 메서드가 GET 인 이유 ──────────────────────────────────────────────────
// 이 repo 의 기존 엔드포인트는 전부 POST 인데, 그건 전부 요청 바디를 갖기
// 때문이다. 이 라우트는 바디가 없는 순수 조회다. Authorization 헤더는
// CORS-safelisted 가 아니라 크로스오리진 요청이 preflight 를 유발하고
// OPTIONS 는 405 로 떨어지므로, GET 이어도 방어선은 그대로 유지된다.
//
// ── 미결제를 403 이 아니라 200 {allowed:false} 로 주는 이유 ────────────────
// 클라이언트(src/lib/entitlement.js:92-97)는 non-2xx 응답을 전부 null(판정 불가)로
// 접고, RequireGoalAccess.jsx 가 true / false / null 3분기를 구현한다. 미결제를
// 403 으로 주면 "서버 장애"와 구분이 사라져 가드가 오작동한다. 이건 조회형
// 엔드포인트의 저장소 관행이다(check-service-access.js:16-18).
//
// 현재확률은 저장된 값이 아니다 — 뷰 goal_student_state 가 매 조회 시점에
// clamp(0, 100, base + Σdelta) 로 다시 더한다(§4). 이 파일은 그 값을 읽어
// 카멜 케이스로 옮기기만 한다.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSchoolCutType } from "../../src/lib/goal/calc/index.js";

import {
  buildAwaitingCutsPayload,
  buildStudentPayload,
  fetchProbabilityHistory,
  fetchStudentRow,
  fetchStudentStateRow,
  openGoalSession,
} from "../_lib/goalRepo.js";

export const config = { runtime: "nodejs" };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ detail: "Method not allowed" });
  }

  try {
    const session = await openGoalSession(req);
    if (session.error) {
      return res.status(session.error.status).json(session.error.body);
    }

    const { supabaseAdmin, profileId, allowed } = session;

    // 조회형 규약 — 미결제는 에러가 아니다.
    if (!allowed) {
      return res.status(200).json({ allowed: false });
    }

    const row = await fetchStudentRow(supabaseAdmin, profileId);

    // 아직 온보딩을 시작하지 않았다.
    if (!row) {
      return res.status(200).json({ onboarded: false });
    }

    // 목표 대학 컷을 찾지 못해 확률이 아직 산출되지 않은 상태.
    // 확률 필드를 전부 생략해서, UI 가 "0%"가 아니라 "목표 대학 재선택"을
    // 그리도록 한다(calcNaesinProb 은 컷 누락을 확률 0 으로 접어버린다 —
    // primitives.js:119 — 그래서 0 과 미산출을 API 레벨에서 갈라 준다).
    if (row.status === "awaiting_cuts" || !row.onboarded_at) {
      return res.status(200).json(buildAwaitingCutsPayload(row));
    }

    const [stateRow, historyRows] = await Promise.all([
      fetchStudentStateRow(supabaseAdmin, profileId),
      fetchProbabilityHistory(supabaseAdmin, profileId),
    ]);

    // schoolCutType 은 DB 에 저장하지 않고 school_type 에서 매번 파생한다(§7-2).
    return res
      .status(200)
      .json(
        buildStudentPayload(
          row,
          stateRow,
          getSchoolCutType(row.school_type),
          historyRows,
        ),
      );
  } catch (error) {
    console.error("goal/student error:", error);
    return res.status(500).json({ detail: "처리 중 오류가 발생했습니다." });
  }
}
