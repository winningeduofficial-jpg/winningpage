// GET /api/cron/weekly-report — 주간 학습 리포트 발행 안내 (매주 월 08:00 KST)
//
// 시각: 월 08:00 KST = 일 23:00 UTC (vercel.json crons "0 23 * * 0").
//
// 대상: **지난 주**에 기록이 하나라도 있는 학생의 연결된 학부모.
//   기록이 전혀 없는 학생에게 "리포트가 발행되었습니다"를 보내면 열어봤을 때
//   빈 리포트라 안 보내느니만 못하다(일간의 "기록 남긴 날만"과 같은 원칙).
//
// 링크의 reportId
//   리포트는 저장되지 않고 기간 키로 계산된다 — 주간 키는 **그 주 월요일 YMD**다
//   (api/goal/report). 그래서 지난 주 월요일을 그대로 넣는다. 이렇게 해야 2주
//   뒤에 링크를 눌러도 그 주 리포트가 열린다.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sendAndLog } from "../_lib/alimtalkSend.js";
import { isAuthorizedCron } from "../_lib/cronAuth.js";
import {
  kstNow,
  mondayOf,
  resolveParentRecipients,
  toYmd,
  weekOfMonth,
} from "../_lib/goalReportNotify.js";
import { createSupabaseAdmin } from "../_lib/supabaseAdmin.js";

export const config = { runtime: "nodejs", maxDuration: 300 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (
    !isAuthorizedCron(req as { headers: Record<string, string | undefined> })
  ) {
    return res.status(401).json({ detail: "Unauthorized" });
  }

  let supabaseAdmin: ReturnType<typeof createSupabaseAdmin>;
  try {
    supabaseAdmin = createSupabaseAdmin();
  } catch (error) {
    console.error("cron/weekly-report 설정 오류:", error);
    return res.status(500).json({ detail: "서버 설정이 올바르지 않습니다." });
  }

  // 이번 주 월요일에서 7일을 빼면 지난 주 월요일. 발송 시점이 월요일 아침이라
  // "지난 주"가 방금 끝난 주다.
  const thisMonday = mondayOf(kstNow());
  const lastMonday = new Date(thisMonday.getTime());
  lastMonday.setUTCDate(lastMonday.getUTCDate() - 7);
  const lastSunday = new Date(thisMonday.getTime());
  lastSunday.setUTCDate(lastSunday.getUTCDate() - 1);

  // 손으로 메울 때를 위해 주 시작일을 강제할 수 있게 둔다.
  const weekStart = String(req.query.week || toYmd(lastMonday));
  const weekEnd =
    req.query.week && typeof req.query.week === "string"
      ? toYmd(
          new Date(
            new Date(`${req.query.week}T00:00:00Z`).getTime() +
              6 * 24 * 60 * 60 * 1000,
          ),
        )
      : toYmd(lastSunday);

  const { data: records, error } = await supabaseAdmin
    .from("goal_daily_records")
    .select("profile_id")
    .gte("record_date", weekStart)
    .lte("record_date", weekEnd);

  if (error) {
    console.error("cron/weekly-report 기록 조회 실패:", error);
    return res.status(500).json({ detail: error.message });
  }

  const studentIds = Array.from(
    new Set((records || []).map((r) => String(r.profile_id))),
  );

  if (studentIds.length === 0) {
    return res.status(200).json({ ok: true, weekStart, students: 0 });
  }

  const recipients = await resolveParentRecipients(supabaseAdmin, studentIds);

  const monday = new Date(`${weekStart}T00:00:00Z`);
  const month = monday.getUTCMonth() + 1;
  const nth = weekOfMonth(monday);

  const summary = { sent: 0, failed: 0, skipped: 0 };

  for (const target of recipients) {
    const outcome = await sendAndLog({
      supabaseAdmin,
      templateKey: "weeklyReport",
      phone: target.parentPhone,
      profileId: target.parentProfileId,
      dedupeKey: `weeklyReport:${target.parentProfileId}:${target.studentProfileId}:${weekStart}`,
      meta: { studentProfileId: target.studentProfileId, weekStart, weekEnd },
      variables: {
        학생명: target.studentName,
        N월: String(month),
        N주차: String(nth),
        // 주간 키 = 그 주 월요일 YMD.
        reportId: weekStart,
      },
    });

    if (outcome.status === "sent") summary.sent += 1;
    else if (outcome.status === "failed") {
      summary.failed += 1;
      console.error(
        `cron/weekly-report 발송 실패 student=${target.studentProfileId}: ${outcome.reason}`,
      );
    } else summary.skipped += 1;
  }

  console.log(
    `cron/weekly-report ${weekStart}~${weekEnd} — 학생 ${studentIds.length}명, ${JSON.stringify(summary)}`,
  );

  return res.status(200).json({
    ok: true,
    weekStart,
    weekEnd,
    students: studentIds.length,
    ...summary,
  });
}
