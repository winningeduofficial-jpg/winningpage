// 멘토신청 §5 선발 절차 타임라인 — docs/mentor-apply-spec.md §5(`3372:3715`).
//
// (a) 이미지 0건. 시안은 선 1개 + 원 5개를 SVG 로 갖고 있지만 전부 CSS 로 재현한다
//     (원 = rounded-full + 배경색, 선 = 1px 그라디언트 div). 명세 §5 "에셋" 지시 그대로다.
//
// (b) **원 5개 vs 스텝 4개** — 원은 스텝 마커가 아니라 **구간 경계 눈금**이다. 각 스텝 텍스트의
//     중심 x 가 인접한 두 원 중심의 정확한 중점이라는 시안 실측(§5 "스텝 개수 판정")이 근거이며,
//     Figma 전수 덤프에서도 스텝 텍스트는 4개뿐임이 확정됐다(확인 항목 ⑯). 따라서 원에는
//     라벨을 붙이지 않고 순수 장식(aria-hidden)으로 둔다.
//
// (c) **원 간격 균등 정규화** — 시안 실측 간격은 268 / 296 / 264 / 276 으로 불균등하지만
//     라벨 길이에 맞춘 수작업 드리프트로 판단해 4등분(0 / 25 / 50 / 75 / 100%)으로 정규화했다
//     (확인 항목 ⑱). 스텝도 자연히 각 구간 중점(12.5 / 37.5 / 62.5 / 87.5%)에 온다.
//     시안 비율을 그대로 살려야 한다면 grid-cols-4 를 grow 268:296:264:276 으로 바꾸면 된다.
//
// (d) Step1 프레임만 `align-items: flex-start` 라 시안에서 2px 좌측으로 밀려 있다 —
//     시안 실수로 보고 4개 모두 center 로 통일했다(확인 항목 ⑲).
//
// (e) 스크롤 인뷰 reveal(선 드로잉 · 도트 순차 페이드)은 시안 근거가 없어 넣지 않았다
//     (확인 항목 ⑲ 후단 / ㊻). 정적 표시 전용 — 클릭 타겟도 variant/state 도 없다.
//
// (f) **모바일 세로 스택은 시안 부재 — 파생 처리다.** 1100px 수평 타임라인은 좁은 폭에서
//     라벨(20px nowrap)이 서로 충돌해 그대로 축소할 수 없다. `wide:`(74rem) 미만에서는
//     선을 세로로 세우고 마커를 좌측에 붙인 세로 타임라인으로 전환한다. 전환점을 `lg:` 가 아니라
//     `wide:` 로 잡은 이유는 명세 § 반응형 전략 3번(데스크톱 그리드 전환은 `wide:`,
//     `max-w-content` 1164px 를 잘림 없이 확보하는 최소 뷰포트) 때문이다.
//     세로 모드에서도 원 5개 해석은 유지된다 — 스텝 4개의 시작점 4개 + 마지막 종료 눈금 1개.
//

import { MENTOR_HEADING_MD } from "@/components/services/serviceTokens";
import { SELECTION_SECTION, SELECTION_STEPS } from "@/data/mentorApply";

// 도트 5단 램프(#E9EDF2 → #426EA9). 좌→우 점진적으로 진해지며, 활성/비활성 상태가 아니라
// "진행도가 쌓인다"는 정적 시각 은유다(명세 §5 색상).
// ⚠ 5색 전부 tailwind.config.js 토큰에 없는 값이라 리터럴로 둔다(serviceTokens.js 상단 규약과 동일).
//    Tailwind JIT 는 `bg-[${color}]` 템플릿 조립을 못 잡으므로 반드시 완성된 리터럴 배열로 쓴다.
const DOT_COLOR_CLASSES = [
  "bg-[#E9EDF2]",
  "bg-[#C5D7EA]",
  "bg-[#A3BFE0]",
  "bg-[#4C94D3]",
  "bg-[#426EA9]",
];

// 도트 가로 위치 — 균등 4등분. 인라인 style(`left: ${n}%`) 대신 리터럴 클래스 lookup 을 쓴다
// (명세 § 반응형 전략 4·6번 규약).
const DOT_LEFT_CLASSES = [
  "left-0",
  "left-1/4",
  "left-1/2",
  "left-3/4",
  "left-full",
];

// 스텝 타이포 — 타이틀 20 SemiBold accent(#0B84FD) / 설명 14 Medium ink(#525252).
// desc 의 `\n` 은 시안 원문 줄바꿈이라 whitespace-pre-line 으로 그대로 살린다.
// ⚠ 1번 설명만 마침표로 끝나고 2·3·4 는 없다 — 시안 원문 그대로 두었다(확인 항목 ⑮).
type Step = { key: string; title: string; desc: string };

function StepText({
  step,
  nowrapTitle = false,
}: {
  step: Step;
  nowrapTitle?: boolean;
}) {
  return (
    <>
      <p
        className={`text-xl font-semibold leading-[1.4] text-accent ${
          nowrapTitle ? "whitespace-nowrap" : "break-keep"
        }`}
      >
        {step.title}
      </p>
      <p
        className={`whitespace-pre-line break-keep text-sm font-medium leading-[1.4] text-ink ${
          nowrapTitle ? "mt-12" : "mt-2"
        }`}
      >
        {step.desc}
      </p>
    </>
  );
}

export default function SelectionTimeline() {
  return (
    <div>
      {/* ⚠ h2 를 이 컴포넌트가 직접 렌더한다 — 소비처(ServiceSection)에 heading prop 을 넘기지 마라(h2 중복).
          색은 MENTOR_HEADING_MD(ink.strong #191d23) 재사용. 명세 §5 타이포 표는 #181D24(ink.title)로
          적혀 있어 1비트 차이가 있으나, serviceTokens 가 §4·§5 를 MD 위계로 정의해 두었으므로
          새 클래스를 만들지 않고 토큰을 그대로 쓴다(확인 항목 ⑦·⑩).
          시안 헤딩 프레임의 `padding: 0 10px` 은 Figma 오토레이아웃 잔재로 보고 반영하지 않았다 —
          반영하면 헤딩만 컨테이너 좌측 기준선에서 10px 밀린다. */}
      <h2 className={MENTOR_HEADING_MD}>{SELECTION_SECTION.title}</h2>

      {/* 헤딩 ↔ 타임라인 gap 70(4.375rem). 좁은 폭은 저장소 관례(mt-10 / sm:mt-12)를 따른다. */}
      <div className="mt-10 sm:mt-12 wide:mt-17.5">
        {/* ------------------------------------------------------------------
            데스크톱(wide 이상) — 수평 타임라인.
            그룹 높이 116 = 타이틀 28(20×1.4) + gap 48 + 설명 40(14×1.4×2줄)이라 별도 h 고정 없이
            자연 높이로 떨어진다. 좌우 px-2(0.5rem = 도트 반지름)로 스텝 열의 중심선을
            선/도트가 놓인 구간과 정확히 일치시킨다.
           ------------------------------------------------------------------ */}
        <div className="relative hidden px-2 wide:block">
          {/* 연결선 1100×1px — 첫 도트 중심에서 시작해 마지막 도트 중심에서 끝난다(원 밖으로 튀지 않음).
              두께는 헤어라인이라 rem 환산하지 않고 1px(h-px)로 둔다. */}
          <div
            aria-hidden="true"
            className="absolute left-2 right-2 top-12.5 h-px bg-linear-to-r from-[#D2D2D2] to-[#AFAFAF]"
          />
          {/* 도트 5개 16×16, center y=50 → top 42(2.625rem). */}
          <div
            aria-hidden="true"
            className="absolute left-2 right-2 top-10.5 h-4"
          >
            {DOT_COLOR_CLASSES.map((colorClass, index) => (
              <span
                key={colorClass}
                className={`absolute top-0 h-4 w-4 -translate-x-1/2 rounded-full ${DOT_LEFT_CLASSES[index]} ${colorClass}`}
              />
            ))}
          </div>

          {/* biome-ignore lint/a11y/noRedundantRoles: Tailwind list-none이 Safari/VoiceOver의 list role을 지워서 role="list"로 명시 복구한다. */}
          <ol role="list" className="grid grid-cols-4 list-none">
            {SELECTION_STEPS.map((step) => (
              <li key={step.key} className="text-center">
                <StepText step={step} nowrapTitle />
              </li>
            ))}
          </ol>
        </div>

        {/* ------------------------------------------------------------------
            모바일·태블릿(wide 미만) — 세로 스택 타임라인. [시안 부재 — 파생 처리]
            선이 세로로 서고 도트가 좌측 거터에 붙는다. 도트는 여전히 5개(스텝 시작 4 + 종료 눈금 1).
           ------------------------------------------------------------------ */}
        <div className="relative pb-8 wide:hidden">
          {/* 세로 연결선 — 첫 도트 중심(top 0.875rem)에서 마지막 도트 중심(bottom 0.5rem)까지.
              1px 헤어라인이라 w-px 유지. */}
          <div
            aria-hidden="true"
            className="absolute bottom-2 left-2 top-3.5 w-px -translate-x-1/2 bg-linear-to-b from-[#D2D2D2] to-[#AFAFAF]"
          />

          {/* biome-ignore lint/a11y/noRedundantRoles: Tailwind list-none이 Safari/VoiceOver의 list role을 지워서 role="list"로 명시 복구한다. */}
          <ol role="list" className="list-none space-y-8">
            {SELECTION_STEPS.map((step, index) => (
              <li key={step.key} className="relative pl-8">
                {/* 도트 중심(top 0.375rem + 반지름 0.5rem = 0.875rem)을 타이틀 첫 줄 중심(28÷2 = 14px)에 맞춘다. */}
                <span
                  aria-hidden="true"
                  className={`absolute left-0 top-1.5 h-4 w-4 rounded-full ${DOT_COLOR_CLASSES[index]}`}
                />
                <StepText step={step} />
              </li>
            ))}
          </ol>

          {/* 5번째 도트 = 마지막 구간 경계 눈금. 스텝이 없으므로 목록 밖에 장식으로만 둔다. */}
          <span
            aria-hidden="true"
            className={`absolute bottom-0 left-0 h-4 w-4 rounded-full ${DOT_COLOR_CLASSES[4]}`}
          />
        </div>
      </div>
    </div>
  );
}
