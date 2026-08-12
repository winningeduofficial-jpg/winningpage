import SafeHtml from '../SafeHtml';

// RawHtmlBlock 렌더러 — SafeHtml 화이트리스트 렌더러를 그대로 쓴다.
// admission-existing-html 클래스는 wrapExistingHtml(admissionParsing.js:2705)이
// 큐레이션 HTML을 감싸던 것과 동일 CSS(스크롤바 숨김, 표 스타일 오버라이드)를
// 그대로 승계하기 위해 유지한다.
export default function RawHtmlView({ html }) {
  return <SafeHtml html={html} className="admission-existing-html" />;
}
