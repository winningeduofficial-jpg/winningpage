import { supabase } from "../../lib/supabase";

export const CATEGORY_LABELS = {
  susi: "수시",
  jungsi: "정시",
};

export const CASE_CATEGORIES = ["susi", "jungsi"];

/**
 * 히어로 scope — 코드는 공용, 데이터는 **테이블 자체가 다르다**.
 * 대학 로고 스트립(admission_case_logos)은 scope와 무관하게 두 페이지가 공유한다
 * (시안 실측 결과 로고 12종·1행 7개/2행 5개 배치가 완전히 동일).
 */
export const HERO_SCOPES = {
  "susi-jungsi": {
    ratesTable: "admission_acceptance_rates",
    heroLabel: "목표 대학 합격률",
    fallbackRates: [
      { year: 2021, rate: 92 },
      { year: 2022, rate: 97 },
      { year: 2023, rate: 95 },
      { year: 2024, rate: 95 },
      { year: 2025, rate: 98 },
    ],
  },
  "special-highschool": {
    ratesTable: "special_highschool_acceptance_rates",
    heroLabel: "목표 특목고 합격률",
    fallbackRates: [
      { year: 2021, rate: 92 },
      { year: 2022, rate: 97 },
      { year: 2023, rate: 95 },
      { year: 2024, rate: 95 },
      { year: 2025, rate: 98 },
    ],
  },
};

export const DEFAULT_HERO_SCOPE = "susi-jungsi";

/**
 * admission_posts.image_urls(jsonb/string/array 혼재) → 문자열 배열로 정규화.
 * columnData.js normalizeImageUrls 이식.
 */
export function normalizeImageUrls(row) {
  const value = row?.image_urls;
  if (Array.isArray(value)) return value;
  if (!value) return [];

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : value ? [value] : [];
    } catch {
      return value ? [value] : [];
    }
  }

  return [];
}

export function getThumbnailUrl(row) {
  return normalizeImageUrls(row)[0] || row?.image_url || "";
}

export function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toISOString().slice(0, 10);
}

/**
 * select('*') 고정 — 운영 DB에 content_json 컬럼이 아직 없어도(38번 SQL 미적용 상태)
 * 에러 없이 동작해야 함 (스키마 확장 전 fallback 원칙, columnData.js와 동일 원칙).
 */
export async function fetchAdmissionCases(category) {
  const { data, error } = await supabase
    .from("admission_posts")
    .select("*")
    .eq("is_active", true)
    .eq("category", category)
    .order("is_pinned", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("합격사례 조회 실패:", error);
    return [];
  }

  return data || [];
}

export async function fetchAdmissionCaseById(id) {
  const { data, error } = await supabase
    .from("admission_posts")
    .select("*")
    .eq("id", id)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.error("합격사례 상세 조회 실패:", error);
    return null;
  }

  return data || null;
}

/**
 * 노출 중인 연도별 합격률. 테이블 미생성/조회 실패면 폴백 상수를 반환한다.
 * 정상 응답이면 활성 행이 0건이어도(어드민이 전부 비활성화한 상태) 빈 배열을
 * 그대로 반환한다 — 호출부가 "조회 실패"와 "의도적으로 0건"을 구분해야 하므로
 * 여기서 빈 배열을 폴백으로 덮어써서는 안 된다.
 * select('*') 고정 — 마이그레이션 미적용 환경에서도 죽지 않게 하는 규약(fetchAdmissionCases와 동일).
 * @returns {Promise<Array<{ year: number, rate: number }>>}
 */
export async function fetchAcceptanceRates(scope = DEFAULT_HERO_SCOPE) {
  const scopeConfig = HERO_SCOPES[scope] || HERO_SCOPES[DEFAULT_HERO_SCOPE];
  const { data, error } = await supabase
    .from(scopeConfig.ratesTable)
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("year", { ascending: true });

  if (error) {
    console.error("연도별 합격률 조회 실패:", error);
    return scopeConfig.fallbackRates;
  }

  return data || [];
}

/**
 * 히어로 대학 로고 스트립. 테이블 미생성/조회 실패면 null을 반환해 호출부
 * (AcceptanceRateHero)가 번들 로고 12종 폴백을 유지하게 한다. 정상 응답이면
 * 활성 행이 0건이어도(어드민이 전부 비활성화한 상태) 빈 배열을 그대로
 * 반환해 호출부가 로고 스트립 자체를 숨길 수 있게 한다.
 * @returns {Promise<Array<{ id: string, name: string, logo_url: string,
 *   display_height_rem: number, opacity: number, sort_order: number }> | null>}
 */
export async function fetchAdmissionCaseLogos() {
  const { data, error } = await supabase
    .from("admission_case_logos")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    console.error("합격 대학 로고 조회 실패:", error);
    return null;
  }

  return data || [];
}

/**
 * 합격률 평균(소수 첫째 자리 반올림). 어드민 요약값과 동일한 계산.
 * @param {Array<{ rate: number | string }>} rates
 * @returns {number}
 */
export function computeAcceptanceAverage(rates) {
  const list = (rates || []).filter((row) =>
    Number.isFinite(Number(row?.rate)),
  );
  if (list.length === 0) return 0;
  const sum = list.reduce((acc, row) => acc + Number(row.rate), 0);
  return Math.round((sum / list.length) * 10) / 10;
}
