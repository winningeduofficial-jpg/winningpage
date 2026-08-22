// GET /api/cron/monthly-report — 월간 학습 리포트 발행 안내 (매월 1일 08:00 KST)
//
// 시각이 까다로운 이유
//   1일 08:00 KST = **전월 마지막 날 23:00 UTC** 다. cron 표현식에는 "그 달의
//   마지막 날"이 없다(Vercel 은 표준 5필드만 받고 `L` 을 지원하지 않는다).
//   그래서 28~31일 23:00 UTC 에 매번 깨우고(vercel.json "0 23 28-31 * *"),
//   여기서 **KST 기준 내일이 1일인지**를 보고 아니면 즉시 종료한다.
//   28일을 포함하는 이유는 2월(윤년이면 29일) 때문이다.
//
// 대상: **지난 달**에 기록이 하나라도 있는 학생의 연결된 학부모.
// 링크의 reportId: 월간 키 = 'YYYY-MM' (api/goal/report).

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sendAndLog } from "../_lib/alimtalkSend.js";
import { isAuthorizedCron } from "../_lib/cronAuth.js";
import {
  kstNow,
  resolveParentRecipients,
  toYmd,
} from "../_lib/goalReportNotify.js";
import { createSupabaseAdmin } from "../_lib/supabaseAdmin.js";

export const config = { runtime: "nodejs", maxDuration: 300 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (
    !isAuthorizedCron(req as { headers: Record<string, string | undefined> })
  ) {
    return res.status(401).json({ detail: "Unauthorized" });
  }

  const now = kstNow();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const forcedMonth =
    typeof req.query.month === "string" ? req.query.month : null;

  // 손으로 메우는 경우(?month=2026-07)가 아니면, 내일이 1일일 때만 돈다.
  if (!forcedMonth && tomorrow.getUTCDate() !== 1) {
    return res
      .status(200)
      .json({ ok: true, skipped: "not_month_end", today: toYmd(now) });
  }

  let supabaseAdmin: ReturnType<typeof createSupabaseAdmin>;
  try {
    supabaseAdmin = createSupabaseAdmin();
  } catch (error) {
    console.error("cron/monthly-report 설정 오류:", error);
    return res.status(500).json({ detail: "서버 설정이 올바르지 않습니다." });
  }

  // 지난 달 = 지금(=말일 밤) 이 속한 달. 발송 시점이 1일 아침이지만 KST 로는
  // 아직 말일이므로 now 의 달이 곧 대상 달이다.
  const targetMonth = forcedMonth || toYmd(now).slice(0, 7);
  const monthStart = `${targetMonth}-01`;
  // split 결과가 undefined 일 수 있다고 보므로(noUncheckedIndexedAccess) 명시적으로
  // 좁힌다. targetMonth 형식이 깨지면 여기서 400 으로 끊는 편이 낫다 —
  // NaN 이 그대로 흘러가면 조회 범위가 조용히 어긋난 채 발송된다.
  const [yearPart, monthPart] = targetMonth.split("-");
  const year = Number(yearPart);
  const month = Number(monthPart);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    return res
      .status(400)
      .json({ detail: `month 형식이 올바르지 않습니다: ${targetMonth}` });
  }

  // 다음 달 0일 = 이 달 마지막 날.
  const monthEnd = toYmd(new Date(Date.UTC(year, month, 0)));

  const { data: records, error } = await supabaseAdmin
    .from("goal_daily_records")
    .select("profile_id")
    .gte("record_date", monthStart)
    .lte("record_date", monthEnd);

  if (error) {
    console.error("cron/monthly-report 기록 조회 실패:", error);
    return res.status(500).json({ detail: error.message });
  }

  const studentIds = Array.from(
    new Set((records || []).map((r) => String(r.profile_id))),
  );

  if (studentIds.length === 0) {
    return res.status(200).json({ ok: true, month: targetMonth, students: 0 });
  }

  const recipients = await resolveParentRecipients(supabaseAdmin, studentIds);
  const summary = { sent: 0, failed: 0, skipped: 0 };

  for (const target of recipients) {
    const outcome = await sendAndLog({
      supabaseAdmin,
      templateKey: "monthlyReport",
      phone: target.parentPhone,
      profileId: target.parentProfileId,
      dedupeKey: `monthlyReport:${target.parentProfileId}:${target.studentProfileId}:${targetMonth}`,
      meta: {
        studentProfileId: target.studentProfileId,
        month: targetMonth,
        monthStart,
        monthEnd,
      },
      variables: {
        학생명: target.studentName,
        N월: String(month),
        // 월간 키 = 'YYYY-MM'.
        reportId: targetMonth,
      },
    });

    if (outcome.status === "sent") summary.sent += 1;
    else if (outcome.status === "failed") {
      summary.failed += 1;
      console.error(
        `cron/monthly-report 발송 실패 student=${target.studentProfileId}: ${outcome.reason}`,
      );
    } else summary.skipped += 1;
  }

  console.log(
    `cron/monthly-report ${targetMonth} — 학생 ${studentIds.length}명, ${JSON.stringify(summary)}`,
  );

  return res.status(200).json({
    ok: true,
    month: targetMonth,
    students: studentIds.length,
    ...summary,
  });
}
