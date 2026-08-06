// 공용 차트 토큰 — 색·폰트 크기. 다음 화면에 추가되는 차트도 여기서 톤을 맞춘다.
//
// 값은 전부 저장소 기존 Sparkline이 쓰던 색을 그대로 정본으로 삼는다(임의로 새 팔레트를
// 만들지 않는다). 지금 실제로 쓰는 토큰만 둔다(YAGNI) — 안 쓰는 차트 종류를 위한 토큰을
// 미리 추가하지 않는다.
export const CHART_COLORS = {
  line: '#013262', // 포인트/선(추세선)
  grid: '#d7d7d7', // 그리드선 · 결측 라벨
  label: '#525252', // 축 라벨(연도 · 값)
  tooltipBg: '#000000', // 호버 말풍선 배경
  tooltipText: '#ffffff' // 호버 말풍선 텍스트
};

export const CHART_FONT_SIZE = 11;
