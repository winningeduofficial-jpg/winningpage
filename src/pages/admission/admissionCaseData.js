import { supabase } from '../../lib/supabase';

export const CATEGORY_LABELS = {
  susi: '수시',
  jungsi: '정시'
};

export const CASE_CATEGORIES = ['susi', 'jungsi'];

/**
 * admission_posts.image_urls(jsonb/string/array 혼재) → 문자열 배열로 정규화.
 * columnData.js normalizeImageUrls 이식.
 */
export function normalizeImageUrls(row) {
  const value = row?.image_urls;
  if (Array.isArray(value)) return value;
  if (!value) return [];

  if (typeof value === 'string') {
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
  return normalizeImageUrls(row)[0] || row?.image_url || '';
}

export function formatDate(value) {
  if (!value) return '';
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
    .from('admission_posts')
    .select('*')
    .eq('is_active', true)
    .eq('category', category)
    .order('is_pinned', { ascending: false })
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('합격사례 조회 실패:', error);
    return [];
  }

  return data || [];
}

export async function fetchAdmissionCaseById(id) {
  const { data, error } = await supabase
    .from('admission_posts')
    .select('*')
    .eq('id', id)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    console.error('합격사례 상세 조회 실패:', error);
    return null;
  }

  return data || null;
}
