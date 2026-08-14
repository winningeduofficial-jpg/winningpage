// faq-tab-<id> / faq-tabpanel id 생성 규칙의 유일한 정본. FaqCategoryTabs와 Faq.jsx
// 양쪽이 같은 함수를 써야 aria-controls ↔ aria-labelledby가 항상 일치한다.
//
// index 기반 id(`faq-tab-${index}`)는 activeTab이 visibleTabs에 아직 없는 프레임
// (예: 로딩 직후 탭 목록이 좁혀지기 전)에 indexOf가 -1을 반환해 `faq-tab--1` 같은
// 존재하지 않는 id를 가리키게 된다 — axe aria-valid-attr-value 위반. 탭 이름을
// 슬러그화한 id를 쓰면 탭 순서가 바뀌거나 activeTab이 일시적으로 목록에 없어도
// 항상 유효한 id를 만든다.
//
// 카테고리명에 공백·괄호·가운뎃점(·)이 섞여 있어 encodeURIComponent로 이스케이프한다.
export function getFaqTabId(tab: string) {
  return `faq-tab-${encodeURIComponent(tab)}`;
}

export const FAQ_TABPANEL_ID = "faq-tabpanel";
