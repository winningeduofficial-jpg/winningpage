import { Link, useLocation } from 'react-router-dom';

// 수행평가 앱 좌측 고정 사이드바 — docs/수행평가-상세-명세.md §3.2(블록 실측) / §3.3(진행단계
// 상태 머신) / §3.4(메뉴 라벨 정본). 프로필 · 메뉴 · 진행단계 3블록으로 구성된다.
//
// ⚠️ **표시 전용 컴포넌트다.** 진행단계 상태는 계산하지 않고 `stepStates` prop으로 받는다 —
//    세션의 `completed_steps`/`current_step`에서 5스텝 상태를 파생하는 `deriveStep`은 P13
//    작업이고(외부 앱에 off-by-one 결함이 있던 지점이라 별도 슬라이스로 떼어 뒀다,
//    api/performance/bootstrap.js `deriveResumeStep` 주석 참고), 여기서 임시 파생을 만들면
//    P13이 두 벌의 규칙을 통합해야 한다.
//
// ⚠️ 프로필·진행단계 값의 실제 소스는 `GET /api/performance/bootstrap`이다
//    (`profile.name` / `profile.schoolType`, 학년은 `lastSession.gradeLabel`).
//    그 호출을 붙이는 것은 채팅 페이지 슬라이스(P5) 몫이라 **여기서는 prop만 받는다.**
//    값이 없으면 그 줄을 렌더하지 않을 뿐, 가짜 이름·리터럴 기본값을 만들어 내지 않는다.
//    `SessionContext`는 auth 세션과 이용권만 들고 있고 프로필 행은 갖고 있지 않다.
//
// 좌표계: 시안 절대 y(프로필 100/130, 메뉴 라벨 291, 메뉴 pill 323·365, 진행단계 라벨 456,
// 스텝 pill 486·523·560·597·634)를 flex column + gap으로 환산했다. 아래 여백 상수는 전부
// 그 y좌표를 역산한 값이며, 주석에 원 좌표를 남겨 두었다(GoalSidebar와 같은 관례).

// §3.4 메뉴 라벨. 시안 원문은 `3754:3035` 한 노드만 `위닝 채팅`이고 나머지 전 인앱
// 노드가 `위닝 AI 채팅`이라 후자가 정본이었으나, 사용자 지시로 화면 문구에서 "AI" 표기를
// 전부 제거하며 `위닝 채팅`으로 확정한다(결과적으로 시안 예외 노드와 표기가 같아진다).
// 세 번째 항목 `설정`은 `3754:4872` 단독 출현이라 이번 범위에서 제외한다(§3.4, §11 Q3).
const MENU_ITEMS = [
  { label: '위닝 채팅', to: '/app/performance' },
  { label: '저장 리포트', to: '/app/performance/reports' }
];

// §3.3 스텝 라벨 원문. `작성・평가`의 가운뎃점은 U+30FB(・)이며 시안 원문 그대로다.
export const PERFORMANCE_STEPS = [
  { step: 1, label: '기본 정보' },
  { step: 2, label: '안내문 입력' },
  { step: 3, label: '주제 추천' },
  { step: 4, label: '설계 리포트' },
  { step: 5, label: '작성・평가' }
];

// §3.3 3상태. 시안 자체는 활성 pill 유무 2상태뿐이라 완료/미도래가 구분되지 않는데,
// §3.3이 그 한계를 3상태로 확장하는 것을 정본으로 규정했다(배지 색·라벨 굵기·pill 표).
const STEP_STATE_STYLES = {
  // 완료: 배지 #d1e8ff(surface-badge) + 체크, 라벨 #525252 w500, pill 없음.
  done: { badge: 'bg-surface-badge text-ink', label: 'font-medium text-ink', pill: false },
  // 진행 중: 배지 #0b84fd(accent) + 흰 숫자, 라벨 #525252 w600, pill #eaecef.
  current: { badge: 'bg-accent text-white', label: 'font-semibold text-ink', pill: true },
  // 미도래: 배지 #f5f5f7(surface-04) + ink-sub 숫자, 라벨 ink-sub w500, pill 없음.
  // `ink-sub`가 #6b6b6b로 상향되며 배지(14px on surface-04 = 4.89:1)·라벨(16px on
  // performance-sidebar #f9f8f7 = 5.02:1) 모두 WCAG AA(4.5:1)를 충족한다(tailwind.config.js
  // `ink.sub` 주석 참고). 과거 `TODO(P19, §11.3 Q30)`는 해소되어 제거했다.
  todo: { badge: 'bg-surface-04 text-ink-sub', label: 'font-medium text-ink-sub', pill: false }
};

// 저장 리포트 화면(`3754:3077` / `3754:3121`)은 **활성 스텝이 0개**다(§3.3 노드별 표).
// 그래서 기본값이 「전부 미도래」이고, 활성 스텝 없음은 예외가 아니라 정상 입력이다.
const DEFAULT_STEP_STATES = ['todo', 'todo', 'todo', 'todo', 'todo'];

function CheckIcon() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true" className="h-3 w-3">
      <path
        d="M2.5 6.2 4.9 8.6 9.5 3.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * @param {string|null} [profileName] 로그인 학생 이름 — `bootstrap.profile.name`.
 * @param {string|null} [schoolType] 학교유형 — `profiles.school_type`(§11 Q61-ⓔ 결정).
 * @param {string|null} [gradeLabel] 학년 — STEP1 세션 입력값(`performance_sessions.grade_label`).
 * @param {Array<'done'|'current'|'todo'>} [stepStates] 5스텝 상태. 길이 5를 기대하며 모자란
 *   자리·모르는 값은 `todo`로 떨어진다. 파생은 호출부(P13 `deriveStep`) 책임이다.
 */
export default function PerformanceSidebar({
  profileName = null,
  schoolType = null,
  gradeLabel = null,
  stepStates = DEFAULT_STEP_STATES
}) {
  const { pathname } = useLocation();
  // `/app/performance/:sessionId`(새로고침 복구)도 채팅 화면이므로 `위닝 채팅`이 활성이어야
  // 한다. NavLink의 `end`만으로는 그 경로에서 활성이 꺼지므로 경로 판정을 직접 한다.
  // 두 항목은 상호 배타다 — `3754:3121`에서 pill이 `저장 리포트`(@10,365)로 **이동**하고
  // `위닝 채팅` 쪽 pill은 사라진다.
  const isReports = pathname.startsWith('/app/performance/reports');

  // §11 Q61-ⓔ 결정: 부제는 `{학년}・{학교유형}` 조합이며 **학년 값이 없으면 학년 조각만
  // 미렌더**한다. 외부 앱의 리터럴 기본값 `'일반고'`는 이식 금지 항목이라 여기서도
  // 만들지 않는다 — 둘 다 없으면 부제 줄 자체를 렌더하지 않는다.
  const subtitle = [gradeLabel, schoolType].filter(Boolean).join('・');

  return (
    <aside
      aria-label="수행평가 사이드바"
      className="flex min-h-screen w-perf-sidebar flex-shrink-0 flex-col bg-performance-sidebar"
    >
      {/* 프로필 — 이름 @60,100 (1.25rem/1.625rem w600 #808080), 부제 @60,130 (1rem/1.3125rem
          w400 #808080). 시안이 이름 줄까지 보조색(#808080)을 쓴다 — ink-strong이 아니다.
          min-h는 이름·부제가 비어도 아래 메뉴 y좌표가 흔들리지 않게 자리를 잡아 둔 것이다.
          ⚠️ Tailwind preflight가 `box-sizing: border-box`를 깔기 때문에 min-height는 **padding을
          포함한 총높이**여야 한다. 100(pt) + 26(이름) + 4(gap) + 21(부제) = 151px = 9.4375rem.
          텍스트 높이 51px만 넣으면 padding 100px에 잠겨 무효가 되고, 프로필 값이 비는
          현재 배선(P5 이전)에서 아래 블록 전체가 51px 위로 밀린다. */}
      <div className="min-h-[9.4375rem] px-perf-inset pt-[6.25rem]">
        {/* §11 Q79 확정: 이 화면은 수행평가 앱(/app/performance)이고 목표관리는 별개
            제품이다. 시안 원문 `목표관리`는 목표관리 시안에서 셸을 가져온 흔적으로 보이며,
            사용자가 지금 어느 제품에 있는지 오인하게 만드는 문구는 시안 충실도보다
            우선순위가 낮다고 판단해 `수행평가`로 확정한다. */}
        {profileName && (
          <p className="text-[1.25rem] font-semibold leading-[1.625rem] text-ink-sub">
            {profileName}의 수행평가
          </p>
        )}
        {/* ink-sub(#6b6b6b)는 16px on performance-sidebar(#f9f8f7)에서 5.02:1로 WCAG AA를
            충족한다(과거 TODO(P19, §11.3 Q30) 해소). */}
        {subtitle && (
          <p className="mt-[0.25rem] text-[1rem] leading-[1.3125rem] text-ink-sub">{subtitle}</p>
        )}
      </div>

      {/* 메뉴 — 섹션 라벨 @60,291(프로필 부제 하단 151에서 140px), 항목 pill 피치 42
          (pill 36 + gap 6). 활성/비활성 텍스트 색이 같고 배경 pill 하나로만 구분하는 것이
          시안 정본이다(§3.2 단정). */}
      <nav aria-labelledby="perf-nav-heading" className="mt-[8.75rem]">
        <p
          id="perf-nav-heading"
          className="px-perf-inset text-[1rem] font-semibold leading-[1.3125rem] text-ink-sub"
        >
          메뉴
        </p>
        <ul className="mt-[0.6875rem] flex flex-col gap-[0.375rem]">
          {MENU_ITEMS.map((item) => {
            const isActive = item.to === '/app/performance' ? !isReports : isReports;
            return (
              <li key={item.to}>
                {/* ⚠️ NavLink가 아니라 Link다. NavLink는 `aria-current` prop을 자기 기본값
                    (`'page'`)으로 흡수하고 **라우터 자체 prefix 매칭**으로 다시 계산해 내보낸다
                    (react-router-dom/dist/index.js: `ariaCurrentProp = "page"` →
                    `isActive ? ariaCurrentProp : undefined`). 그래서 `/app/performance/reports`
                    에서 `위닝 채팅`(`to=/app/performance`, end 없음)까지 prefix로 걸려
                    두 항목이 동시에 `aria-current="page"`가 된다 — pill은 하나인데 스크린리더는
                    둘 다 현재 페이지라고 읽는다. 게다가 className이 문자열이면 활성 항목에
                    `active` 리터럴 클래스까지 덧붙는다. 활성 판정이 아래처럼 커스텀이고 두
                    항목이 상호 배타이므로, prop을 <a>로 그대로 흘리는 Link를 쓴다.
                    (회귀 검증: scripts/verify-performance-sidebar-nav.mjs) */}
                <Link
                  to={item.to}
                  aria-current={isActive ? 'page' : undefined}
                  className={[
                    // pill 304×36 @x=10 r6 → mx 0.625rem + 폭 19rem, 텍스트 x=60 → pl 3.125rem.
                    'mx-[0.625rem] flex h-9 w-perf-pill items-center rounded-md pl-[3.125rem]',
                    'text-[1.25rem] font-medium leading-[1.625rem] text-ink transition-colors',
                    isActive ? 'bg-performance-activePill' : 'hover:bg-performance-activePill/60'
                  ].join(' ')}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* 진행단계 — 섹션 라벨 @60,456(메뉴 목록 하단 401에서 55px = §3.2의 섹션 gap 60을
          pill 높이 증분만큼 보정한 값), 스텝 pill 486/523/560/597/634 피치 37(pill 36 + gap 1). */}
      {/* 이름 없는 <section>은 region 랜드마크가 아니라 generic으로 매핑돼, 5스텝이
          「진행단계」와 아무 관계 없는 <ol>로만 노출된다. 이미 보이는 라벨을 id로 묶어
          이름을 준다 — 픽셀 변화 0. id는 목표관리 셸과 동시 렌더될 경우를 대비해 perf- 접두. */}
      <section aria-labelledby="perf-steps-heading" className="mt-[3.4375rem]">
        <p
          id="perf-steps-heading"
          className="px-perf-inset text-[1rem] font-semibold leading-[1.3125rem] text-ink-sub"
        >
          진행단계
        </p>
        <ol className="mt-[0.5625rem] flex flex-col gap-[0.0625rem]">
          {PERFORMANCE_STEPS.map(({ step, label }, index) => {
            const state = STEP_STATE_STYLES[stepStates?.[index]] ? stepStates[index] : 'todo';
            const style = STEP_STATE_STYLES[state];

            return (
              <li
                key={step}
                aria-current={state === 'current' ? 'step' : undefined}
                className={[
                  // 배지 x=60 → pl 3.125rem, 배지 20×20 r10, 배지↔라벨 gap 16 → 라벨 x=96.
                  'mx-[0.625rem] flex h-9 w-perf-pill items-center gap-4 rounded-md pl-[3.125rem]',
                  style.pill ? 'bg-performance-activePill' : ''
                ].join(' ')}
              >
                <span
                  className={[
                    'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full',
                    'text-[0.875rem] font-medium leading-[1.125rem]',
                    style.badge
                  ].join(' ')}
                >
                  {/* 완료는 숫자 대신 체크. 스크린리더에는 상태를 말로 남긴다. */}
                  {state === 'done' ? <CheckIcon /> : step}
                </span>
                <span className={['text-[1rem] leading-[1.3125rem]', style.label].join(' ')}>
                  {label}
                </span>
                <span className="sr-only">
                  {state === 'done' ? ' 완료' : state === 'current' ? ' 진행 중' : ' 진행 전'}
                </span>
              </li>
            );
          })}
        </ol>
      </section>

      {/* 회차(잔여 이용 횟수) UI는 여기 두지 않는다 — 인앱 21개 노드 어디에도 사이드바 회차
          표시가 없고(슬라이스 x<324 영역 텍스트 전수 확인), 회차 소진 안내 표면은 §5.20이
          정한 채팅 상단 배너 + STEP3 인라인 카드 2곳뿐이다(P15). */}
    </aside>
  );
}
