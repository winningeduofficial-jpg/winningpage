// "모두 동의합니다" 클릭 시 개별 행 체크마크가 순차 팝인하는 stagger 애니메이션 타이밍 —
// src/components/auth/{AgreementList,AgreementRow}.tsx 와
// src/components/mentorApply/MentorAgreementBlock.tsx 가 공유한다(멘토 판은 회귀 위험
// 때문에 컴포넌트 자체는 재사용하지 않지만, 동일한 index.css의 auth-check-pop 애니메이션을
// 쓰므로 타이밍 값은 하나로 유지한다 — MentorAgreementBlock.tsx 상단 주석 참고).
//
// STAGGER_STEP_MS: 행 index별 animationDelay 간격(각 파일의 `calc(var(--i) * Nms)`).
// STAGGER_BUFFER_MS: 마지막 행의 auth-check-pop(index.css, 220ms)이 끝날 여유를 더한
// batchAnimating 종료 타이머 버퍼. 두 값이 어긋나면 마지막 행 팝인이 끝나기 전에
// batchAnimating이 꺼져 애니메이션이 끊겨 보인다.
export const STAGGER_STEP_MS = 40;
export const STAGGER_BUFFER_MS = 260;
