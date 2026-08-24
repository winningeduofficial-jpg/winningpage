import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

// university_acceptances track='graduate' 조회 — 대학원입학 프리미엄 랜딩(§5 마퀴) 전용.
// is_active=true만, sort_order asc. 0행이면 빈 배열을 반환하고, 호출부(GraduateSchoolAdmission)가
// length===0일 때 마퀴 섹션 자체를 렌더하지 않는다(no-fallback-constants — 폴백 상수 금지).

export type PremiumGraduateAcceptance = {
  id: string;
  name: string;
  emblem_url: string | null;
  subtitle: string | null;
  count: number | null;
  sort_order: number;
};

export function usePremiumGraduateAcceptances() {
  const [universities, setUniversities] = useState<PremiumGraduateAcceptance[]>(
    [],
  );

  useEffect(() => {
    let mounted = true;

    async function fetchUniversities() {
      const { data, error } = await supabase
        .from("university_acceptances")
        .select("id, name, emblem_url, subtitle, count, sort_order")
        .eq("track", "graduate")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (!mounted) return;

      if (error) {
        console.error("대학원입학 합격생 조회 오류:", error);
        setUniversities([]);
        return;
      }

      setUniversities((data || []) as PremiumGraduateAcceptance[]);
    }

    fetchUniversities();

    return () => {
      mounted = false;
    };
  }, []);

  return { universities };
}
