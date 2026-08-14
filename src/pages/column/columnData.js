import { supabase } from "../../lib/supabase";

// 시안(hsokTD6OilcNEXyCR24sn4, 1882:7837/8153) 원문 그대로 — 오탈자·구분자(U+2022) 임의 수정 금지.
// Admin.jsx select options는 이 배열과 자 단위로 동일해야 함 (edu-column-renewal-spec §4-5).
export const ALL_CATEGORY = "전체";

export const COLUMN_CATEGORIES = [
  "학습관리 방법",
  "수시 및 정시 전략",
  "특목고 입학",
  "해외 및 대학원",
  "입시제도 변화",
  "대학 입시 제로", // 시안 원문 그대로 — '입시 정보' 오타 의심이나 임의 수정 금지
  "학생부•수행평가•세특", // 가운뎃점 U+2022 BULLET
];

/**
 * galleries.image_urls(jsonb/string/array 혼재) → 문자열 배열로 정규화.
 * AS-IS Gallery.jsx normalizeArray 이식.
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

// 커버 이미지도 동일 로직 — 의미 분리용 별칭.
export function getCoverUrl(row) {
  return getThumbnailUrl(row);
}

export function getDisplayDate(row) {
  return row?.published_at || row?.created_at;
}

export function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toISOString().slice(0, 10);
}

/**
 * view_count 없거나 부재/비정상 값이면 null — 호출부는 null이면 조회수 메타 자체를 숨겨야 함.
 */
export function getViewCount(row) {
  const num = Number(row?.view_count);
  return Number.isFinite(num) ? num : null;
}

/**
 * category가 COLUMN_CATEGORIES에 속하지 않으면 '전체' 취급(필터 미노출·뱃지/칩 미렌더 판단은 호출부 몫).
 */
export function getCategoryLabel(row) {
  const value = row?.category;
  return COLUMN_CATEGORIES.includes(value) ? value : ALL_CATEGORY;
}

/**
 * select('*') 고정 — category/view_count/published_at/is_featured 컬럼이 DB에 없어도
 * 에러 없이 동작해야 함 (스키마 확장 전 fallback 원칙).
 */
export async function fetchActiveColumns() {
  const { data, error } = await supabase
    .from("galleries")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("교육칼럼 조회 실패:", error);
    return [];
  }

  return data || [];
}

export async function fetchColumnById(id) {
  const { data, error } = await supabase
    .from("galleries")
    .select("*")
    .eq("id", id)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.error("교육칼럼 상세 조회 실패:", error);
    return null;
  }

  return data || null;
}

/**
 * is_featured===true 인 것을 getDisplayDate desc로 최대 4건 뽑고,
 * 부족하면(또는 전부 false/컬럼 부재) 최신순으로 채워 총 4건을 반환.
 */
export function pickFeaturedColumns(rows) {
  const sorted = [...rows].sort(
    (a, b) =>
      new Date(getDisplayDate(b) || 0) - new Date(getDisplayDate(a) || 0),
  );

  const featured = sorted
    .filter((row) => row?.is_featured === true)
    .slice(0, 4);

  if (featured.length >= 4) return featured;

  const featuredIds = new Set(featured.map((row) => row.id));
  const rest = sorted.filter((row) => !featuredIds.has(row.id));

  return [...featured, ...rest].slice(0, 4);
}
