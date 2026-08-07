// 개발 확인용 더미 책자 16장. DB(premium_book_pages)가 아직 비어 있어 뷰어를 눈으로
// 확인할 방법이 없기 때문에 둔다.
//
// 호출부(usePremiumBookPages)가 `import.meta.env.DEV` 안에서만 호출한다. Vite가 프로덕션
// 빌드에서 그 분기를 false로 접어버리므로 이 모듈은 통째로 트리셰이킹되고, 프로덕션 경로에는
// 아무 영향이 없다. 실제 이미지가 아니라 페이지 번호만 박힌 인라인 SVG라 네트워크도 타지 않는다.
//
// 어드민 미리보기(BookViewer에 pages prop을 직접 넘기는 경로)는 이 모듈을 참조하지 않는다 —
// usePremiumBookPages는 공개 페이지(/premium-apply) 전용 훅이고, 어드민은 방금 변환한 실제
// 이미지를 pages prop으로 조립해 넘기므로 더미가 끼어들 경로 자체가 없다.

const DUMMY_PAGE_COUNT = 16;

function dummySvg(pageNumber) {
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 708">',
    '<rect width="512" height="708" fill="#f7f7f7"/>',
    '<rect x="14" y="14" width="484" height="680" fill="none" stroke="#013262" stroke-width="4"/>',
    '<text x="256" y="360" text-anchor="middle" font-family="sans-serif"',
    ` font-size="200" font-weight="700" fill="#013262">${pageNumber}</text>`,
    '<text x="256" y="440" text-anchor="middle" font-family="sans-serif"',
    ' font-size="30" letter-spacing="6" fill="#767676">DEV DUMMY</text>',
    '</svg>'
  ].join('');

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// premium_book_pages 행과 같은 모양이라 buildViews가 실데이터와 구분 없이 받는다.
export function createDevDummyPages() {
  return Array.from({ length: DUMMY_PAGE_COUNT }, (_, i) => ({
    id: `dev-dummy-${i + 1}`,
    sort_order: i + 1,
    image_url: dummySvg(i + 1)
  }));
}
