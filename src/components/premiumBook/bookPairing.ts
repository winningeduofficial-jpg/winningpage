// 프리미엄 안내 책자 페어링 — 규칙 전체를 순수 함수 하나에 가둔다.
//
// 명세 §D7: 배열 chunk(pages, 2) 금지. 좌/우 면은 배열 인덱스가 아니라 sort_order 슬롯이
// 고정하므로, 중간 페이지가 지워져도 이후 spread의 좌/우가 조용히 반전되지 않는다.
//
// 표지 페어링 방식은 명세 §8 #10에서 미정이다. 되돌리기 비용을 0으로 만들기 위해
// COVER_ALONE 상수 한 줄로 격리했다 — 뷰어는 buildViews의 출력만 소비하고 페어링을
// 직접 계산하지 않으므로, 아래 한 줄을 바꾸는 것이 전환의 전부다.
//
//   true  (책 관행 = §8 #10의 (b))            [_,1] / [2,3] / [4,5] … / [16,_]  → 16장이면 9뷰
//   false (현재값, §8 #10의 (a) 단순 페어링)   [1,2] / [3,4] … / [15,16]         → 16장이면 8뷰
//
// false로 확정한 근거는 사용자 결정(2026-08-07) — "양(좌우) 페이지로 시작." 16장(짝수)이라
// 이 값에서는 구조적 부재(void) 면이 아예 생기지 않는다.
const COVER_ALONE = false;

// 면의 3종. 빈 면 2종을 구분하는 것이 명세 §D7의 요구다.
//   page — 실제 페이지
//   gap  — 결번. 어드민이 중간 행을 지워 슬롯만 남은 자리. 흰 면 + 중앙 로고 워터마크
//   void — 구조적 부재. 표지 반대편·종단처럼 애초에 짝이 없는 설계상 빈칸. 워터마크를 그리지 않는다
//          (결번과 같은 시각을 쓰면 "지워진 페이지"로 오인시킨다)
export const FACE_PAGE = "page";
export const FACE_GAP = "gap";
export const FACE_VOID = "void";

type FaceKind = typeof FACE_PAGE | typeof FACE_GAP | typeof FACE_VOID;

export type PremiumBookPage = {
  id?: unknown;
  sort_order?: number;
  image_url?: string;
  [key: string]: unknown;
};

export type Face = {
  kind: FaceKind;
  order: number | null;
  page: PremiumBookPage | null;
};

type BookView = {
  index: number;
  left: Face;
  right: Face;
  primaryOrder: number;
};

export type BuildViewsResult = {
  views: BookView[];
  lastOrder: number;
  viewIndexByOrder: Map<number, number>;
  faceByOrder: Map<number, Face>;
};

const VOID_FACE: Face = Object.freeze({
  kind: FACE_VOID,
  order: null,
  page: null,
});

function pageFace(order: number, page: PremiumBookPage): Face {
  return { kind: FACE_PAGE, order, page };
}

function gapFace(order: number): Face {
  return { kind: FACE_GAP, order, page: null };
}

/**
 * premium_book_pages 행 배열을 좌/우 spread 뷰 목록으로 만든다.
 *
 * @param pages sort_order 오름차순 조회 결과. 정렬돼 있지 않아도 되고 결번이 있어도 된다.
 * @param options coverAlone 미지정 시 모듈 상수 COVER_ALONE을 쓴다.
 * @returns views는 spread 모드용, faceByOrder는 1페이지 모드용이다.
 *          lastOrder가 0이면 빈 책(views 길이 0).
 */
export function buildViews(
  pages: PremiumBookPage[] | null | undefined,
  options: { coverAlone?: boolean } = {},
): BuildViewsResult {
  const coverAlone = options.coverAlone ?? COVER_ALONE;

  // sort_order에 UNIQUE 제약이 없다(sql/47_premium_book.sql). 중복이 오면 첫 행만 쓰고
  // 경고를 남긴다 — 조용히 한 장을 삼키면 어드민이 원인을 찾을 단서가 없다.
  const byOrder = new Map<number, PremiumBookPage>();
  for (const page of pages ?? []) {
    const order = Number(page?.sort_order);
    if (!Number.isInteger(order) || order < 1) continue;
    if (byOrder.has(order)) {
      console.warn(
        `프리미엄 책자: sort_order ${order}가 중복입니다. 첫 행만 사용합니다.`,
      );
      continue;
    }
    byOrder.set(order, page);
  }

  let lastOrder = 0;
  for (const order of byOrder.keys()) {
    if (order > lastOrder) lastOrder = order;
  }

  const slot = (order: number): Face =>
    byOrder.has(order)
      ? pageFace(order, byOrder.get(order) as PremiumBookPage)
      : gapFace(order);

  const views: BookView[] = [];
  const push = (left: Face, right: Face) => {
    views.push({
      index: views.length,
      left,
      right,
      // 뷰의 대표 페이지 — 모드 전환·이동 시 유지할 앵커다. 좌측이 구조적 부재면 우측을 쓴다.
      primaryOrder: left.order ?? right.order ?? 0,
    });
  };

  if (lastOrder > 0) {
    // 표지 단독 뷰만 예외이고, 그 뒤는 두 방식 모두 "짝수 시작 2칸씩"으로 같은 루프를 탄다.
    const firstPaired = coverAlone ? 2 : 1;
    if (coverAlone) push(VOID_FACE, slot(1));
    for (let n = firstPaired; n <= lastOrder; n += 2) {
      push(slot(n), n + 1 <= lastOrder ? slot(n + 1) : VOID_FACE);
    }
  }

  // 결번 슬롯도 인덱싱한다 — 결번 페이지로 이동해도 뷰를 찾지 못해 0으로 튀면 안 된다.
  const viewIndexByOrder = new Map<number, number>();
  const faceByOrder = new Map<number, Face>();
  for (const view of views) {
    for (const face of [view.left, view.right]) {
      if (face.kind === FACE_VOID || face.order == null) continue;
      viewIndexByOrder.set(face.order, view.index);
      faceByOrder.set(face.order, face);
    }
  }

  return { views, lastOrder, viewIndexByOrder, faceByOrder };
}
