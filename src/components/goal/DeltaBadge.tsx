// 목표관리 앱 증감 뱃지 — docs/figma-goal/00-INDEX.md §5-4 `DeltaBadge`, part-11/12/13 실측.
// 시안 실측 60×31 + 삼각형 14×12.
//
// direction: 'up' | 'down' | 'flat' — 삼각형 방향(▲/▼/■). 시안에는 상승(▲)만 존재한다
// (part-11 §353 "하락(▼)/변동없음 상태 미정의"). down/flat은 시안 근거가 없는 근사 구현이다
// — (추정).
//
// tone: 'positive' | 'negative' | 'neutral' — 배경/텍스트 색. direction과 의도적으로 분리했다.
// 이유(part-12 §241): 등급 지표는 값이 낮을수록 좋은데, 시안은 고2-1 기말 등급이 3.24로
// "하락"했음에도 `▲0.29`를 초록(positive)으로 표기한다 — 즉 화살표 방향(값의 증감)과 색상
// 의미(좋은 변화인지)가 지표 성격에 따라 뒤집힐 수 있어 부호 규칙이 확정되지 않았다. 색을
// direction에서 자동 유도하면 등급처럼 "낮을수록 좋음"인 지표에서 오작동하므로, 호출부가
// 지표 성격을 알고 tone을 명시적으로 넘기도록 강제한다.
import type { ReactNode } from "react";

const DIRECTION_GLYPH: Record<string, string> = {
  up: "▲",
  down: "▼", // (추정) 시안에 없음
  flat: "■", // (추정) 시안에 없음
};

const TONE_CLASS: Record<string, string> = {
  positive: "bg-[#E3F3E6] text-[#2E9E4C]", // (추정) 연초록 — insight.success와 동일 계열
  negative: "bg-[#FCE4E4] text-[#D14343]", // (추정) 연빨강 — GoalDdayBadge red 톤 재사용
  neutral: "bg-[#F0F0F0] text-ink-sub", // (추정) 회색
};

type DeltaBadgeProps = {
  value?: ReactNode;
  direction?: "up" | "down" | "flat";
  tone?: "positive" | "negative" | "neutral";
};

export default function DeltaBadge({
  value,
  direction = "up",
  tone = "positive",
}: DeltaBadgeProps) {
  const glyph = DIRECTION_GLYPH[direction] ?? DIRECTION_GLYPH.up;
  const toneClass = TONE_CLASS[tone] ?? TONE_CLASS.positive;

  return (
    <span
      className={`inline-flex h-[1.9375rem] w-fit shrink-0 items-center justify-center gap-1 rounded-lg px-2.5 text-[0.8125rem] font-semibold leading-[1.2] ${toneClass}`}
    >
      <span aria-hidden="true" className="text-[0.625rem] leading-none">
        {glyph}
      </span>
      {value}
    </span>
  );
}
