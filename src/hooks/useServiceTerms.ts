import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

// "위닝에듀 서비스 이용약관" 전문(sql/89) 단건 조회 — /terms(Legal.tsx),
// StudentService.tsx, ParentService.tsx 세 곳이 공유하는 단일 원본.
// terms.code='service_fulltext'는 가입 필수 약관(student_service/parent_service)과
// 무관한 열람 전용 문서라 user_term_agreements 원장을 건드리지 않는다.
export interface ServiceTerms {
  content: string;
  effectiveFrom: string;
  title: string;
}

interface UseServiceTermsResult {
  terms: ServiceTerms | null;
  loading: boolean;
  error: string | null;
}

export function useServiceTerms(): UseServiceTermsResult {
  const [terms, setTerms] = useState<ServiceTerms | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      const { data, error: fetchError } = await supabase
        .from("terms")
        .select("content, effective_from, title")
        .eq("code", "service_fulltext")
        .eq("is_active", true)
        .maybeSingle();
      if (!alive) return;
      if (fetchError || !data || !data.content) {
        console.warn("서비스 이용약관 조회 실패:", fetchError?.message);
        setError("문서를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
        setLoading(false);
        return;
      }
      setTerms({
        content: data.content,
        effectiveFrom: data.effective_from,
        title: data.title,
      });
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  return { terms, loading, error };
}
