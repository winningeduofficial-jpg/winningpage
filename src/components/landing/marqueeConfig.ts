// 메인랜딩 합격생/멘토 마퀴 공용 설정 (QA 행219·221: 좌→우로 천천히 흐르도록 조정).
// useInfiniteMarquee 기본 속도(DEFAULT_SPEED ≈ 0.035px/ms)의 약 60% 수준 — AcceptanceSection,
// MentorSection이 이 상수를 공유해 둘의 속도가 어긋나지 않게 한다. 프리미엄 마퀴
// (PremiumAcceptanceMarquee)는 대상 아님 — 기본 속도/방향 유지.
export const LANDING_MARQUEE_SPEED = 0.02; // px per ms ≈ 20px/s (기존 대비 약 60%)
