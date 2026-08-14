// 멘토 지원서 "작성 현황" 사이드바(진행률 트래커) — docs/mentor-apply-spec.md §6-3 / § 반응형 전략 §6 행.
//
// 시안(3413:5022, 307×393)은 5단계 라벨 + 각 단계 `0%` + 하단 `필수항목 25개가 남았습니다` 가
// 전부 정적 텍스트로만 그려져 있다. 실제로는 폼 입력에 따라 실시간으로 갱신돼야 하는 화면이라
// 이 파일은 "표시"가 아니라 "계산 + 표시"를 함께 책임진다. 계산부(computeProgress 등)는 렌더와
// 무관한 순수 함수로 분리해 named export 했다 — 리뷰·테스트를 컴포넌트 마운트 없이 하기 위함이다.
//
// ⚠ 시안의 `25개` 는 실제 필수 필드 수와 맞지 않는다(명세 § 필수 항목 카운트: 중복 제거 27 /
//    시안 중복 포함 28 — 확인 항목 22). 하드코딩하면 사용자가 27개를 다 채워도 카운터가 2에서
//    멈추는 거짓 표시가 되므로, **문장 형태(remainingTemplate)는 시안 원문을 그대로 쓰되 숫자만
//    실제 잔여 필수 항목 수로 계산해서 렌더**한다. 즉 초기 렌더는 `필수항목 25개…` 가 아니라
//    `필수항목 27개…` 로 나온다. 25가 정본으로 확정되면 필수 필드 정의(sections[].fields) 쪽을
//    고칠 일이지 이 컴포넌트를 고칠 일이 아니다.
//
// 미확정 사항(확인 항목 34)에 대한 구현 판단 2가지 — 둘 다 아래 해당 위치에 근거를 적어 두었다.
//   ① sticky 상단 오프셋: `wide:top-[6.5rem]`
//   ② 단계 배지 클릭 시 앵커 이동: **구현함**
import { PROGRESS_SIDEBAR } from "../../data/mentorApply";

// sticky 상단 오프셋. 선례는 src/pages/AdmissionGuidelines.jsx:1388 의 `lg:sticky lg:top-[104px]`
// 이며, 그 104px 의 내역은 전역 헤더 + 여백이다: Header.jsx:508 이 `fixed top-0` 이고 그 안쪽 바가
// Header.jsx:512 `h-16`(4rem/64px) 이므로 헤더에 가리지 않는 최소값이 4rem, 거기에 시각적 여백
// 2.5rem(40px)을 더해 6.5rem(=104px) 이 된다. 선례는 px 표기지만 이 저장소 규칙대로 rem 으로 쓴다.
// 시안에 정확한 오프셋 정의가 없어(확인 항목 34) 선례값을 그대로 승계했다.
const STICKY_OFFSET_REM = 6.5;

// 배지 원형 스타일 — 28×28, radius 6(0.375rem), bg Surface/02(surface.badge), 숫자 14 Medium accent.
const BADGE_CLASS =
  "flex h-7 w-7 shrink-0 items-center justify-center rounded-[0.375rem] bg-surface-badge text-sm font-medium leading-none text-accent";

/**
 * 값 하나가 "채워졌는가" 판정.
 *
 * 폼 상태는 필드 타입이 섞여 있다 — 텍스트(string) / 칩 복수선택(string[]) / 약관(boolean) /
 * 첨부(File). 타입별로 빈 값의 모양이 다르므로 한 곳에서 판정한다.
 * 숫자 0 과 문자열 '0' 은 유효한 입력이므로 채워진 것으로 본다(falsy 검사만으로는 오판).
 */
export function isFieldFilled(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "boolean") return value; // 필수 약관은 체크(true)여야 채워진 것
  if (typeof value === "number") return !Number.isNaN(value);
  return true; // File 등 객체
}

/**
 * 단계 하나의 진행률.
 * @param {string[]} fields 해당 단계의 **필수** 필드 이름 배열(각 폼 섹션 컴포넌트가 named export)
 * @param {Record<string, unknown>} values 폼 전체 상태
 * @returns {{ filled: number, total: number, percent: number }}
 */
export function getSectionProgress(fields, values) {
  const list = Array.isArray(fields) ? fields : [];
  const total = list.length;
  const filled = list.filter((name) => isFieldFilled(values?.[name])).length;
  // 필수 필드가 0개인 단계(전부 선택 항목)는 0으로 나누지 않고 100% 로 본다 — 남은 일이 없기 때문.
  const percent = total === 0 ? 100 : Math.round((filled / total) * 100);
  return { filled, total, percent };
}

/**
 * 사이드바가 그릴 값 전체를 한 번에 계산한다.
 *
 * 잔여 카운트는 단계별 total 의 단순 합이 아니라 **필드 이름 기준 중복 제거** 후 센다.
 * 명세 § 필수 항목 카운트가 27(중복 제거) / 28(시안 중복 포함)로 갈리는 이유가 4-8 문항 중복이며
 * (확인 항목 21에서 복제 실수로 확정), 같은 필드를 두 단계가 공유하게 되더라도 사용자가 채워야 할
 * "일의 개수"는 하나이기 때문이다. 단계별 percent 는 그 단계 자신의 목록으로만 계산한다.
 *
 * @param {{ no: number, label: string, fields: string[], id?: string }[]} sections
 * @param {Record<string, unknown>} values
 */
export function computeProgress(sections, values) {
  const list = Array.isArray(sections) ? sections : [];
  const steps = list.map((section) => ({
    ...section,
    ...getSectionProgress(section.fields, values),
  }));

  const requiredNames = new Set();
  list.forEach((section) => {
    (Array.isArray(section.fields) ? section.fields : []).forEach((name) => {
      requiredNames.add(name);
    });
  });

  const totalRequired = requiredNames.size;
  let filledRequired = 0;
  requiredNames.forEach((name) => {
    if (isFieldFilled(values?.[name])) filledRequired += 1;
  });

  return {
    steps,
    totalRequired,
    filledRequired,
    remaining: totalRequired - filledRequired,
  };
}

// 잔여 안내문 `필수항목 {count}개가 남았습니다` 조각내기.
// 시안은 "25개" 전체가 accent 색이므로(§6-3 타이포) {count} 직후의 단위 문자 `개` 까지를 강조
// 범위에 넣는다. 카피는 데이터 파일이 정본이라 여기서 문장을 새로 쓰지 않고 분해만 한다.
const [REMAINING_HEAD, REMAINING_REST_RAW] =
  PROGRESS_SIDEBAR.remainingTemplate.split("{count}");
const REMAINING_UNIT = REMAINING_REST_RAW.startsWith("개") ? "개" : "";
const REMAINING_TAIL = REMAINING_REST_RAW.slice(REMAINING_UNIT.length);

export default function ProgressSidebar({ sections = [], values = {} }) {
  const { steps, remaining } = computeProgress(sections, values);

  // 단계 배지 클릭 → 해당 폼 섹션 카드로 앵커 이동.
  // 시안에 hover/active 프레임이 없어 클릭 동작이 미확정이지만(확인 항목 34), 세로 5090px 짜리
  // 폼에서 단계 목록이 눈앞에 sticky 로 떠 있는데 눌리지 않는 쪽이 오히려 기대를 배신한다고 보고
  // **이동을 구현하는 쪽으로 판단**했다. 되돌릴 경우 <button> 을 <div> 로 바꾸면 된다.
  //
  // scrollIntoView + 대상의 scroll-mt 대신 직접 좌표를 계산하는 이유는 두 가지다.
  //   ① 대상(FormSectionCard)은 다른 담당 파일이라 scroll-mt 클래스를 심을 수 없다.
  //   ② 오프셋을 sticky 와 같은 STICKY_OFFSET_REM 한 곳에서만 관리할 수 있다.
  // rem→px 환산은 루트 폰트 크기를 실측해서 한다(사용자 브라우저 글꼴 확대 설정을 존중).
  const handleStepClick = (id) => {
    if (!id || typeof window === "undefined") return;
    const target = document.getElementById(id);
    if (!target) return;

    const rootFontSize =
      parseFloat(window.getComputedStyle(document.documentElement).fontSize) ||
      16;
    const top =
      target.getBoundingClientRect().top +
      window.scrollY -
      STICKY_OFFSET_REM * rootFontSize;

    // prefers-reduced-motion 존중 — 저장소 관례(BookViewer.jsx:28, HeroSection.jsx:194)와 동일한
    // matchMedia 판정. reduce 면 즉시 점프한다.
    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    window.scrollTo({
      top: Math.max(top, 0),
      behavior: prefersReduced ? "auto" : "smooth",
    });
  };

  return (
    // 반응형 방침 — wide(74rem) 미만에서는 sticky 를 끄고 폼 위에 놓이는 **가로 요약 스텝퍼**로
    // 축약한다(명세 § 반응형 전략 §6 행의 "사이드바 → 상단 가로 스텝퍼 또는 숨김" 중 전자).
    // 근거: 시안 세로형을 그대로 모바일에 sticky 로 두면 라벨 5행(28×5 + gap 20×4 = 220px)에
    // 헤더·구분선·안내문까지 더해 뷰포트 높이의 절반 가까이를 상시 점유한다. 그렇다고 통째로
    // 숨기면 5090px 폼에서 위치 감각과 잔여 카운터를 동시에 잃는다. 그래서 라벨만 sr-only 로
    // 접어 배지+퍼센트 칩 줄로 눕히고(스크린리더에는 라벨이 그대로 남는다) 잔여 안내문은 유지,
    // sticky 는 해제해 화면을 잡아먹지 않게 했다.
    // 2컬럼 그리드(사이드바 307 + gap 16 + 폼 832) 자체는 소비처인 페이지가 만든다 —
    // 데스크톱 전환점을 lg 가 아니라 wide 로 잡은 근거는 tailwind.config.js screens.wide 주석 참고.
    <aside
      aria-labelledby="mentor-progress-heading"
      className="rounded-2xl bg-white px-5 py-6 wide:sticky wide:top-[6.5rem] wide:px-[1.8125rem] wide:pb-8 wide:pt-[1.8125rem]"
    >
      {/* 사이드바 제목 — 14 Medium ink.sub. 폼 섹션 카드의 h3 위계를 침범하지 않도록 h2 로 두고
          시각적 크기만 작게 간다(구조상 폼 전체와 동렬인 보조 패널). */}
      <h2
        id="mentor-progress-heading"
        className="text-sm font-medium leading-[1.4] text-ink-sub"
      >
        {PROGRESS_SIDEBAR.label}
      </h2>

      {/* 라벨 ↔ 리스트 gap 32(2rem) / 행 간 gap 20(1.25rem). wide 미만에서는 칩이 가로로 흐르며
          줄바꿈(flex-wrap)한다 — 가로 스크롤을 만들지 않아 스크롤 어포던스 학습이 필요 없다. */}
      <ol
        // biome-ignore lint/a11y/noRedundantRoles: Tailwind list-none이 Safari/VoiceOver의 list role을 지워서 role="list"로 명시 복구한다.
        role="list"
        className="mt-4 flex list-none flex-row flex-wrap gap-x-2 gap-y-2 wide:mt-8 wide:flex-col wide:flex-nowrap wide:gap-y-5"
      >
        {steps.map((step) => (
          <li key={step.no} className="wide:w-full">
            <button
              type="button"
              onClick={() => handleStepClick(step.id)}
              className="flex items-center gap-1.5 rounded-lg py-1 pl-0 pr-1.5 text-left transition-colors hover:bg-surface-footer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 motion-reduce:transition-none wide:w-full wide:justify-between wide:pr-0 wide:hover:bg-transparent"
            >
              <span className="flex items-center wide:gap-3">
                {/* 배지 숫자는 라벨 앞 순번을 그림으로 반복할 뿐이라 스크린리더에서 뺀다
                    (<ol> 이 이미 순서를 전달한다). */}
                <span className={BADGE_CLASS} aria-hidden="true">
                  {step.no}
                </span>
                {/* wide 미만에서는 라벨을 sr-only 로 접는다 — 시각적으로만 사라지고 접근성 트리에는
                    남아서 배지만 보이는 화면에서도 SR 사용자는 단계 이름을 그대로 듣는다. */}
                <span className="sr-only text-sm font-medium leading-[1.4] text-ink-strong wide:not-sr-only">
                  {step.label}
                </span>
              </span>
              <span className="text-sm font-normal leading-[1.4] text-ink-sub">
                <span className="sr-only">작성률 </span>
                {step.percent}%
              </span>
            </button>
          </li>
        ))}
      </ol>

      {/* 구분선(249×1) — 1px 헤어라인이라 rem 환산하지 않고 border 기본 1px 을 쓴다.
          rem 으로 환산하면(0.0625rem) 브라우저·배율에 따라 0px 로 반올림돼 선이 사라질 수 있다. */}
      <div className="mt-5 border-t border-line" aria-hidden="true" />

      {/* 잔여 안내문 — Regular 14 ink.strong, 숫자만 accent(§6-3 타이포).
          aria-live="polite": 값이 바뀌는 시점이 "빈 값 → 채워짐" 전환뿐이라 타이핑마다 떠들지
          않는다. 실제로 진척이 생겼을 때만 조용히 알려 주는 용도. */}
      <p
        className="mt-5 text-sm font-normal leading-[1.4] text-ink-strong"
        aria-live="polite"
      >
        {REMAINING_HEAD}
        <span className="text-accent">
          {remaining}
          {REMAINING_UNIT}
        </span>
        {REMAINING_TAIL}
      </p>
    </aside>
  );
}
