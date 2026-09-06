import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// `@theme`의 공유 타입 스케일(`--text-app-*`, src/index.css)은 tailwind-merge 기본 설정이
// 모르는 font-size 키라 `text-xs`와 `text-app-label`을 충돌로 인식하지 못한다 — 그 상태로는
// shadcn 컴포넌트 기본값(`text-xs`)과 호출부 클래스가 둘 다 살아남아 CSS 생성 순서가 승자를
// 정한다(2026-09-06 MessageHeader 12px 사고). 여기서 키를 등록해 뒤에 온 값이 이기게 한다.
// 새 `--text-app-*` 토큰을 추가하면 이 목록도 함께 갱신할 것.
const APP_TEXT_SCALE = [
  "app-title",
  "app-section",
  "app-card-title",
  "app-body",
  "app-label",
  "app-caption",
];

// 같은 이유(MessageHeader 12px 사고)로 커스텀 `--radius-*` 토큰도 등록한다 — 등록이
// 없으면 `rounded-perf-modal`이 shadcn 기본값(`rounded-xl` 등)과 충돌로 인식되지 않아
// 둘 다 살아남고, 어느 쪽이 이기는지가 CSS 생성 순서에 맡겨진다(수행평가 리포트 모달을
// shadcn `DialogContent`로 옮기며 실측 확인 — `rounded-perf-modal` 신설 당시엔 `cn()`을
// 거치지 않는 raw 문자열 className이라 이 문제가 드러나지 않았다). 새 `--radius-*` 토큰을
// 추가하면 이 목록도 함께 갱신할 것.
const APP_RADIUS_SCALE = ["perf-modal"];

const twMerge = extendTailwindMerge({
  extend: {
    theme: { text: APP_TEXT_SCALE, radius: APP_RADIUS_SCALE },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
