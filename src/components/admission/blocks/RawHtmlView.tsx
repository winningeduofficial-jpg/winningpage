import SafeHtml from "../SafeHtml";

// RawHtmlBlock 렌더러 — SafeHtml 화이트리스트 렌더러를 그대로 쓴다.
// admission-existing-html 클래스는 wrapExistingHtml(admissionParsing.js:2705)이
// 큐레이션 HTML을 감싸던 것과 동일 CSS(스크롤바 숨김, 표 스타일 오버라이드)를
// 그대로 승계하기 위해 유지한다.
type RawHtmlViewProps = {
  html?: string | null;
};

export default function RawHtmlView({ html }: RawHtmlViewProps) {
  // SafeHtml은 falsy html을 이미 null 렌더로 처리한다(SafeHtml.tsx:349) — ""로 좁혀도 동일.
  return <SafeHtml html={html ?? ""} className="admission-existing-html" />;
}
