import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { PremiumBookPage } from "./bookPairing";
import { createDevDummyPages } from "./devDummyPages";

// 프리미엄 안내 책자 페이지 조회 훅 — 공개 페이지(/premium-apply) 전용 데이터 소스다.
//
// BookViewer는 표현 전용(presentational) 컴포넌트로 데이터를 직접 조회하지 않는다(§5.1).
// 소비처가 둘이기 때문이다 — 공개 페이지는 DB의 premium_book_pages를 읽어야 하고, 어드민
// 미리보기는 아직 저장 전인 방금 변환한 이미지를 봐야 한다(DB 조회 대상이 아님). 이 훅은
// 그중 앞의 경로만 담당한다. 어드민은 이 훅을 쓰지 않고 변환 결과를 직접 pages로 조립한다.
//
// 페칭 규율은 옛 BookViewer(현 usePremiumBookPages 이관 전) 관례 그대로:
//   `let alive = true` 가드 / loading·error 분리 / 실패 시 한국어 로그 + reloadToken 재시도.
//
// DB가 비어 있을 때만, 그리고 개발 모드에서만 더미 16장으로 대체한다. 프로덕션에서는
// `import.meta.env.DEV` 분기가 통째로 접히므로 empty 상태가 그대로 살아 있다. DEV 더미는
// 의도적으로 이 훅 안에만 둔다 — 어드민 미리보기 경로는 이 훅을 호출하지 않으므로 더미가
// 새어들 일이 없다.
export function usePremiumBookPages() {
  const [pages, setPages] = useState<PremiumBookPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [reloadToken, setReloadToken] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: TODO(useEffectEvent) reloadToken은 effect 안에서 읽지 않는 재조회(refetch) 트리거 전용 카운터다.
  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      setError(null);

      const { data, error: queryError } = await supabase
        .from("premium_book_pages")
        .select("id, sort_order, image_url")
        .order("sort_order", { ascending: true });

      if (!alive) return;

      if (queryError) {
        console.error("프리미엄 책자 페이지 조회 실패:", queryError);
        setError(queryError);
        setPages([]);
      } else {
        setPages((data ?? []) as PremiumBookPage[]);
      }
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [reloadToken]);

  const effectivePages = useMemo(() => {
    if (pages.length > 0) return pages;
    if (import.meta.env.DEV && !loading && !error) return createDevDummyPages();
    return pages;
  }, [pages, loading, error]);

  const retry = useCallback(() => setReloadToken((n) => n + 1), []);

  return { pages: effectivePages, loading, error, retry };
}
