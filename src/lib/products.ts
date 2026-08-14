// 상품/서비스 조회 — 신뢰 소스는 Supabase `products` 테이블 하나뿐이다.
// 프론트 코드에는 가격 데이터를 하드코딩/폴백하지 않는다(사용자 요구: "가격표가
// 프론트에 있으면 안 된다"). 조회 실패 시에도 임의의 가격을 지어내지 말고
// 호출부가 loading/error 상태를 그대로 사용자에게 안내해야 한다.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";

const PRODUCT_COLUMNS =
  "id, service_key, service_name, service_desc, service_sort_order, sort_order, name, list_price, price, badge, is_recommended, is_active";

type ProductRow = {
  id: string;
  service_key: string;
  service_name: string;
  service_desc?: string | null;
  service_sort_order?: number | null;
  sort_order?: number | null;
  name: string;
  list_price?: number | null;
  price?: number | null;
  badge?: string | null;
  is_recommended?: boolean | null;
  is_active?: boolean;
};

export type ServiceProduct = {
  id: string;
  name: string;
  listPrice: number | null | undefined;
  price: number | null | undefined;
  badge: string | null | undefined;
  recommended: boolean;
};

export type ServiceGroup = {
  key: string;
  name: string;
  desc: string;
  order: number;
  products: ServiceProduct[];
};

// Supabase products 행 → 서비스별 그룹 구조로 변환
function groupProducts(rows: ProductRow[] | null | undefined): ServiceGroup[] {
  const map = new Map<string, ServiceGroup>();
  (rows || []).forEach((r) => {
    if (!map.has(r.service_key)) {
      map.set(r.service_key, {
        key: r.service_key,
        name: r.service_name,
        desc: r.service_desc || "",
        order: Number.isFinite(r.service_sort_order)
          ? r.service_sort_order
          : 99,
        products: [],
      });
    }
    map.get(r.service_key)?.products.push({
      id: r.id,
      name: r.name,
      listPrice: r.list_price,
      price: r.price,
      badge: r.badge,
      recommended: !!r.is_recommended,
    });
  });
  return Array.from(map.values()).sort((a, b) => a.order - b.order);
}

// products 테이블에서 활성 상품을 조회해 서비스별로 그룹핑한 배열을 반환한다.
// serviceKey를 넘기면 해당 서비스 상품만 조회한다. 조회 실패 시 예외를 던진다
// (호출부인 useProducts가 error 상태로 변환한다) — 조용히 빈 배열을 반환하지 않는다.
export async function fetchProducts(
  serviceKey?: string | null,
): Promise<ServiceGroup[]> {
  let query = supabase
    .from("products")
    .select(PRODUCT_COLUMNS)
    .eq("is_active", true)
    .order("service_sort_order", { ascending: true })
    .order("sort_order", { ascending: true });

  if (serviceKey) query = query.eq("service_key", serviceKey);

  const { data, error } = await query;
  if (error) throw error;
  return groupProducts(data);
}

// products 조회 훅. serviceKey를 넘기면 해당 서비스 상품만 조회한다(전체가 필요하면
// 인자 없이 호출). 반환: { services, loading, error, refetch }
// - services: 서비스별 그룹 배열(빈 배열이면 로딩/에러가 아닌 이상 "조회된 상품 없음"을 뜻함)
// - error: 조회 실패 시 Error 객체, 정상이면 null
// - refetch: 실패/빈 결과 시 재시도용
export function useProducts(serviceKey?: string | null) {
  const [services, setServices] = useState<ServiceGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [reloadToken, setReloadToken] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: TODO(useEffectEvent) reloadToken은 effect 안에서 읽지 않는 재시도(refetch) 트리거 전용 카운터다.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const grouped = await fetchProducts(serviceKey);
        if (!alive) return;
        setServices(grouped);
      } catch (err) {
        if (!alive) return;
        console.warn("products 조회 실패:", err?.message || err);
        setError(err);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [serviceKey, reloadToken]);

  const refetch = useCallback(() => setReloadToken((t) => t + 1), []);

  return { services, loading, error, refetch };
}
