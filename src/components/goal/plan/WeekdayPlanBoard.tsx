import { useState } from "react";
import {
  WEEKDAY_ACCENT,
  WEEKDAY_BG_CLASS,
} from "@/components/goal/weekdayTokens";

type PlanTask = {
  id: string | number;
  subject: string;
  title: string;
  // 문제집 연결(QA 행286-B, 선택) — 연결이 없으면 workbookTitle이 null/undefined.
  workbookTitle?: string | null;
  pageFrom?: number | null;
  pageTo?: number | null;
};

type PlanDay = {
  day: string;
  date: string | number;
  dateYmd: string;
  tasks: PlanTask[];
};

type WeekdayPlanBoardProps = {
  days: PlanDay[];
  onAddTask: (day: string, dateYmd: string) => void;
  // 행280/행321(계획) — 주간학습계획표 전용 삭제. 대시보드 레일(StudyPlanRail.tsx)에는
  // 삭제가 없다(행305 이후 그쪽 ✕는 "미달성 표시" 전용) — 여기서만 실제 DELETE를 낸다.
  onDeleteTask: (task: PlanTask) => void;
  todayKey?: string | null;
};

// 주간 학습 계획표 보드 — docs/figma-goal/part-09.md #27(빈) / part-10.md #29(채움) 정본 그리드.
// #29가 그리드 규격의 정본이다(화면별 지침 §2 확정 사항): 개방형 1194px(74.625rem) =
// 150px(9.375rem) × 7컬럼 + 24px(1.5rem) 갭 × 6. #28의 카드형 1176px(컬럼 106 / gap 58)은 채택하지
// 않는다.
//
// 3단 구조(part-09/10 실측 그대로): 요일 헤더 행 → `+ 추가` 버튼 행 → 요일별 과제 카드 스택.
// `+ 추가`는 항상 헤더 바로 아래 고정되고 카드는 그 아래로 쌓인다 — part-10 §184가 "`+ 추가`가
// 스택 하단으로 이동할 것"이라 추정하지만, #29 실측 좌표(헤더 y=292 → `+ 추가` y=352 고정 → 카드
// y=419부터)를 그대로 따랐다.
//
// WEEKDAY_BG_CLASS/WEEKDAY_ACCENT는 공용 상수 모듈(weekdayTokens.js)로 분리했다(코드 검수 NIT §6).
const DAY_KEY: Record<string, string> = {
  월요일: "mon",
  화요일: "tue",
  수요일: "wed",
  목요일: "thu",
  금요일: "fri",
  토요일: "sat",
  일요일: "sun",
};

// todayKey(선택) — 현재 표시 중인 주에 오늘이 포함될 때만 그 요일의 short key를
// 넘긴다(src/lib/goalPlanUtils.js getTodayShortKeyInWeek). 확정 사항: 오늘 요일은
// 헤더 pill에 링 강조 + 굵기를 한 단계 더 올려 표시한다(원래 확정 pill 디자인은
// 그대로 두고 얹기만 한다).
export default function WeekdayPlanBoard({
  days,
  onAddTask,
  onDeleteTask,
  todayKey,
}: WeekdayPlanBoardProps) {
  // 행280/321 — × 클릭 한 번으로 바로 지우지 않고 카드 안에서 "삭제" 확인 버튼을
  // 한 번 더 눌러야 실제 DELETE가 나간다(window.confirm 대신 인라인 2단계 확인).
  // 한 번에 한 카드만 확인 상태를 가진다 — 다른 카드의 ×를 누르면 이전 확인은
  // 자동으로 취소된다(id 하나만 들고 있으므로).
  const [confirmingTaskId, setConfirmingTaskId] = useState<
    string | number | null
  >(null);

  return (
    <div className="w-full max-w-298.5">
      {/* 요일 헤더 행 — 150×36, gap 24px(part-09 §269). 요일명(bold)+날짜(회색) 인라인 2스타일 —
          part-09 §286 "한 텍스트 노드 안 2가지 스타일" 근거로 span 분리. */}
      <div className="grid grid-cols-7 gap-6">
        {days.map((day) => {
          const key = DAY_KEY[day.day] ?? "mon";
          const isToday = todayKey != null && key === todayKey;
          return (
            <div
              key={day.day}
              className={`flex h-9 items-center rounded-lg px-3 ${WEEKDAY_BG_CLASS[key]} ${
                isToday ? "ring-2 ring-ink-strong ring-offset-1" : ""
              }`}
            >
              <span className="truncate text-[0.8125rem] leading-[1.4]">
                <span
                  className={`text-ink-strong ${isToday ? "font-black" : "font-bold"}`}
                >
                  {day.day}
                </span>{" "}
                <span className="text-ink-sub">
                  {String(day.date).padStart(2, "0")}
                </span>
                {isToday && <span className="sr-only"> (오늘)</span>}
              </span>
            </div>
          );
        })}
      </div>

      {/* `+ 추가` 버튼 행 — 150×43, 헤더와 24px 간격(part-09 §272). */}
      <div className="mt-6 grid grid-cols-7 gap-6">
        {days.map((day) => (
          <button
            key={day.day}
            type="button"
            onClick={() => onAddTask(day.day, day.dateYmd)}
            className="flex h-10.75 items-center justify-center rounded-lg border border-line bg-white text-[0.8125rem] font-medium text-ink-sub transition-colors hover:border-ink-strong hover:text-ink-strong"
          >
            + 추가
          </button>
        ))}
      </div>

      {/* 과제 카드 스택 — 컬럼별 세로 pitch 87px(카드 75 + gap 12), 컬럼 높이는 가변(part-10 §127/180).
          items-start로 짧은 컬럼(예: 일요일)이 늘어나지 않게 한다. */}
      <div className="mt-6 grid grid-cols-7 items-start gap-6">
        {days.map((day) => {
          const key = DAY_KEY[day.day] ?? "mon";
          return (
            <div key={day.day} className="flex flex-col gap-3">
              {day.tasks.map((task) => {
                const isConfirming = confirmingTaskId === task.id;
                // 문제집 연결 캡션(QA 행286-B) — 연결이 있으면 3번째 줄이 필요해
                // 카드 높이가 고정 75px(h-18.75)로는 잘린다. 연결 없는 카드는 시안
                // 실측 그대로 고정 높이를 유지하고, 연결된 카드만 min-h로 늘어난다.
                const caption = task.workbookTitle
                  ? `${task.workbookTitle}${
                      task.pageFrom != null && task.pageTo != null
                        ? ` p.${task.pageFrom}–${task.pageTo}`
                        : ""
                    }`
                  : null;
                return (
                  // 좌측 4px 보더는 임의 장식이 아니라 시안 실측 그대로다(part-10.md §128 "좌측 4px
                  // 컬러 액센트 바 + 본문 면 구조", §181 "border-left: 4px solid로 구현하면 안쪽 그룹
                  // 146px가 자연스럽게 맞는다"). #29 카드 18개 전부 이 구조라 여기서 제거하지 않는다.
                  <div
                    key={task.id}
                    className={`relative rounded-lg border-l-4 px-3 py-3 ${caption ? "min-h-18.75" : "h-18.75"} ${WEEKDAY_BG_CLASS[key]}`}
                    style={{ borderLeftColor: WEEKDAY_ACCENT[key] }}
                  >
                    {isConfirming ? (
                      // 인라인 2단계 확인(window.confirm 대신) — 행280/321.
                      <div className="flex h-full flex-col items-center justify-center gap-1.5">
                        <p className="text-[0.75rem] leading-[1.4] text-ink-strong">
                          삭제할까요?
                        </p>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setConfirmingTaskId(null);
                              onDeleteTask(task);
                            }}
                            className="rounded-md bg-error px-2 py-1 text-[0.6875rem] font-semibold leading-[1.4] text-white"
                          >
                            삭제
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmingTaskId(null)}
                            className="rounded-md border border-line px-2 py-1 text-[0.6875rem] leading-[1.4] text-ink-sub"
                          >
                            취소
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => setConfirmingTaskId(task.id)}
                          aria-label="과제 삭제"
                          className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded text-[0.625rem] leading-none text-ink-sub/70 transition-colors hover:text-error"
                        >
                          ✕
                        </button>
                        <p className="truncate pr-4 text-[0.8125rem] font-semibold leading-[1.4] text-ink-strong">
                          {task.subject}
                        </p>
                        {/* 문서 §173 "말줄임 확정" — 1행 ellipsis. */}
                        <p className="mt-1 truncate pr-4 text-[0.8125rem] leading-[1.4] text-ink-sub">
                          {task.title}
                        </p>
                        {caption && (
                          <p className="mt-1 truncate pr-4 text-[0.6875rem] leading-[1.4] text-ink-sub/80">
                            {caption}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
