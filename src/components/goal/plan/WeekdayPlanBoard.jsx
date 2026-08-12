import { WEEKDAY_ACCENT, WEEKDAY_BG_CLASS } from '../weekdayTokens';

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
const DAY_KEY = {
  월요일: 'mon',
  화요일: 'tue',
  수요일: 'wed',
  목요일: 'thu',
  금요일: 'fri',
  토요일: 'sat',
  일요일: 'sun'
};

export default function WeekdayPlanBoard({ days, onAddTask }) {
  return (
    <div className="w-full max-w-[74.625rem]">
      {/* 요일 헤더 행 — 150×36, gap 24px(part-09 §269). 요일명(bold)+날짜(회색) 인라인 2스타일 —
          part-09 §286 "한 텍스트 노드 안 2가지 스타일" 근거로 span 분리. */}
      <div className="grid grid-cols-7 gap-[1.5rem]">
        {days.map((day) => {
          const key = DAY_KEY[day.day] ?? 'mon';
          return (
            <div
              key={day.day}
              className={`flex h-[2.25rem] items-center rounded-lg px-3 ${WEEKDAY_BG_CLASS[key]}`}
            >
              <span className="truncate text-[0.8125rem] leading-[1.4]">
                <span className="font-bold text-ink-strong">{day.day}</span>{' '}
                <span className="text-ink-sub">{String(day.date).padStart(2, '0')}</span>
              </span>
            </div>
          );
        })}
      </div>

      {/* `+ 추가` 버튼 행 — 150×43, 헤더와 24px 간격(part-09 §272). */}
      <div className="mt-[1.5rem] grid grid-cols-7 gap-[1.5rem]">
        {days.map((day) => (
          <button
            key={day.day}
            type="button"
            onClick={() => onAddTask(day.day)}
            className="flex h-[2.6875rem] items-center justify-center rounded-lg border border-line bg-white text-[0.8125rem] font-medium text-ink-sub transition-colors hover:border-ink-strong hover:text-ink-strong"
          >
            + 추가
          </button>
        ))}
      </div>

      {/* 과제 카드 스택 — 컬럼별 세로 pitch 87px(카드 75 + gap 12), 컬럼 높이는 가변(part-10 §127/180).
          items-start로 짧은 컬럼(예: 일요일)이 늘어나지 않게 한다. */}
      <div className="mt-[1.5rem] grid grid-cols-7 items-start gap-[1.5rem]">
        {days.map((day) => {
          const key = DAY_KEY[day.day] ?? 'mon';
          return (
            <div key={day.day} className="flex flex-col gap-[0.75rem]">
              {day.tasks.map((task, index) => (
                // 좌측 4px 보더는 임의 장식이 아니라 시안 실측 그대로다(part-10.md §128 "좌측 4px
                // 컬러 액센트 바 + 본문 면 구조", §181 "border-left: 4px solid로 구현하면 안쪽 그룹
                // 146px가 자연스럽게 맞는다"). #29 카드 18개 전부 이 구조라 여기서 제거하지 않는다.
                <div
                  key={`${task.subject}-${index}`}
                  className={`h-[4.6875rem] rounded-lg border-l-4 px-3 py-[0.75rem] ${WEEKDAY_BG_CLASS[key]}`}
                  style={{ borderLeftColor: WEEKDAY_ACCENT[key] }}
                >
                  <p className="truncate text-[0.8125rem] font-semibold leading-[1.4] text-ink-strong">
                    {task.subject}
                  </p>
                  {/* 문서 §173 "말줄임 확정" — 1행 ellipsis. */}
                  <p className="mt-1 truncate text-[0.8125rem] leading-[1.4] text-ink-sub">{task.title}</p>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
