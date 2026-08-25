// GET /api/cron/daily-report — 일간 학습 보고서 알림톡 (매일 22:00 KST)
//
// 대상: 그날 goal_daily_records 에 기록을 남긴 학생의 **연결된 학부모**.
//   기록이 없는 날은 보내지 않는다(사용자 확정 2026-08-22) — 「실제 학습 시간
//   0분, 달성률 0%」가 매일 가면 잔소리로 느껴져 수신거부를 부르고, 발송량도
//   불필요하게 늘어난다.
//
// 시각: 22:00 KST = 13:00 UTC (vercel.json crons "0 13 * * *").
//   학생이 저녁에 기록을 쓰므로 이 시각이면 그날 데이터가 차 있다.
//
// 실패는 건별로 삼킨다 — 한 명이 실패했다고 나머지가 멈추면 안 된다.
// 집계 결과를 응답으로 돌려주고, 상세는 alimtalk_send_logs 에 남는다.

import { sendAndLog } from "../_lib/alimtalkSend.js";
import {
  achievementRate,
  formatHours,
  kstNow,
  resolveParentRecipients,
  toYmd,
} from "../_lib/goalReportNotify.js";
import { defineHandler } from "../_lib/handler.js";
// 라벨 정본은 저장 라우트가 들고 있다 — 여기서 다시 적으면 두 벌이 되고,
// 어긋나면 학부모 문자에 코드값('normal', 'concept')이 그대로 찍힌다.
// 클라이언트 studyRecordOptions.ts 와의 패리티는 그쪽 테스트가 단언한다.
import { CONDITION_LABELS, TASK_LABELS } from "../goal/daily-record.js";

export const config = { runtime: "nodejs", maxDuration: 300 };

type DailyRecord = {
  profile_id: string;
  record_date: string;
  study_hours: number | null;
  target_ideal_hours: number | null;
  target_min_hours: number | null;
  tasks: string[] | null;
  body_condition: string | null;
  memo: string | null;
};

export default defineHandler({
  methods: ["GET"],
  auth: "cron",
  errorShape: "detail",
  // dev 원본은 { detail: "Unauthorized" }였다 — 공통 CRON_REQUIRED_MESSAGE
  // ("인증이 필요합니다.")는 performance/cleanup-attachments 등 다른 cron 라우트
  // 기준이라 여기서만 override한다.
  authFailureMessage: "Unauthorized",
  unhandledMessage: "일간 학습 보고서 발송 중 오류가 발생했습니다.",
  logLabel: "cron/daily-report",
  handler: async (req, res, ctx) => {
    const supabaseAdmin = ctx.supabaseAdmin;

    // 쿼리로 날짜를 강제할 수 있게 둔다 — 발송이 하루 밀렸을 때 손으로 메우거나
    // 로컬에서 특정 날짜를 재현할 때 필요하다(크론 인증은 그대로 요구한다).
    const today = String(req.query.date || toYmd(kstNow()));

    const { data: records, error } = await supabaseAdmin
      .from("goal_daily_records")
      .select(
        "profile_id, record_date, study_hours, target_ideal_hours, target_min_hours, tasks, body_condition, memo",
      )
      .eq("record_date", today);

    if (error) {
      console.error("cron/daily-report 기록 조회 실패:", error);
      res.status(500).json({ detail: error.message });
      return;
    }

    const rows = (records || []) as DailyRecord[];
    if (rows.length === 0) {
      res.status(200).json({ ok: true, date: today, records: 0 });
      return;
    }

    const studentIds = Array.from(
      new Set(rows.map((r) => String(r.profile_id))),
    );

    // 계획 달성 — 같은 날짜의 goal_plan_tasks 를 한 번에 받아 학생별로 센다.
    // 학생 수만큼 쿼리를 날리면 크론이 느려지고 타임아웃에 걸린다.
    const { data: planTasks, error: planError } = await supabaseAdmin
      .from("goal_plan_tasks")
      .select("profile_id, done")
      .eq("plan_date", today)
      .in("profile_id", studentIds);

    if (planError) {
      console.error("cron/daily-report 계획 조회 실패:", planError);
    }

    const planStat = new Map<string, { total: number; done: number }>();
    for (const task of planTasks || []) {
      const key = String(task.profile_id);
      const stat = planStat.get(key) || { total: 0, done: 0 };
      stat.total += 1;
      if (task.done) stat.done += 1;
      planStat.set(key, stat);
    }

    const recipients = await resolveParentRecipients(supabaseAdmin, studentIds);
    const byStudent = new Map<string, typeof recipients>();
    for (const recipient of recipients) {
      const list = byStudent.get(recipient.studentProfileId) || [];
      list.push(recipient);
      byStudent.set(recipient.studentProfileId, list);
    }

    const [, month, day] = today.split("-");
    const summary = { sent: 0, failed: 0, skipped: 0, noParent: 0 };

    for (const record of rows) {
      const studentId = String(record.profile_id);
      const targets = byStudent.get(studentId);

      if (!targets || targets.length === 0) {
        summary.noParent += 1;
        continue;
      }

      const plan = planStat.get(studentId) || { total: 0, done: 0 };
      // tasks 는 코드값 배열(text[])이다 — 'concept', 'mockExam' 같은 값이 들어
      // 있으므로 반드시 라벨로 바꿔야 한다. 모르는 코드는 버리지 않고 원문을
      // 남긴다(신규 옵션이 추가됐는데 라벨 맵이 안 따라온 경우를 드러낸다).
      // 비어 있으면 문구의 v() 가 던지므로 여기서 메운다 — "완료한 게 없다"는
      // 정상 상태이지 데이터 결손이 아니다.
      const doneText =
        (record.tasks || [])
          .filter(Boolean)
          .map((code) => TASK_LABELS[code as keyof typeof TASK_LABELS] || code)
          .join(", ") || "기록된 완료 항목이 없습니다.";

      for (const target of targets) {
        const outcome = await sendAndLog({
          supabaseAdmin,
          templateKey: "dailyReport",
          phone: target.parentPhone,
          profileId: target.parentProfileId,
          // 같은 학부모·같은 날 한 통. 크론이 두 번 떠도 중복 발송되지 않는다.
          dedupeKey: `dailyReport:${target.parentProfileId}:${studentId}:${today}`,
          meta: { studentProfileId: studentId, date: today },
          variables: {
            학생명: target.studentName,
            월: String(Number(month)),
            일: String(Number(day)),
            이상목표시간: formatHours(record.target_ideal_hours),
            최소목표시간: formatHours(record.target_min_hours),
            실제학습시간: formatHours(record.study_hours),
            이상달성률: String(
              achievementRate(record.study_hours, record.target_ideal_hours),
            ),
            최소달성률: String(
              achievementRate(record.study_hours, record.target_min_hours),
            ),
            오늘완료내용: doneText,
            전체계획수: String(plan.total),
            달성계획수: String(plan.done),
            오늘컨디션:
              CONDITION_LABELS[String(record.body_condition || "")] ||
              "기록 없음",
            학생한마디: record.memo || "오늘도 수고했습니다.",
          },
        });

        if (outcome.status === "sent") summary.sent += 1;
        else if (outcome.status === "failed") {
          summary.failed += 1;
          console.error(
            `cron/daily-report 발송 실패 student=${studentId}: ${outcome.reason}`,
          );
        } else summary.skipped += 1;
      }
    }

    console.log(
      `cron/daily-report ${today} — 기록 ${rows.length}건, ${JSON.stringify(summary)}`,
    );

    res
      .status(200)
      .json({ ok: true, date: today, records: rows.length, ...summary });
  },
});
