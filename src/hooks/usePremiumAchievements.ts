import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

// premium_achievements 조회 — 대입컨설팅(A 프로그램) 랜딩 섹션 2(PremiumStatsPills) 전용.
// is_active=true만, sort_order asc. 0행이면 빈 배열을 반환하고, 호출부(PremiumStatsPills)가
// items.length===0일 때 섹션 자체를 렌더하지 않는다(no-fallback-constants — 폴백 상수 금지).

export type PremiumAchievement = {
  id: string;
  label: string;
  count: number;
  sort_order: number;
};

export function usePremiumAchievements() {
  const [achievements, setAchievements] = useState<PremiumAchievement[]>([]);

  useEffect(() => {
    let mounted = true;

    async function fetchAchievements() {
      const { data, error } = await supabase
        .from("premium_achievements")
        .select("id, label, count, sort_order")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (!mounted) return;

      if (error) {
        console.error("프리미엄 실적 조회 오류:", error);
        setAchievements([]);
        return;
      }

      setAchievements((data || []) as PremiumAchievement[]);
    }

    fetchAchievements();

    return () => {
      mounted = false;
    };
  }, []);

  return { achievements };
}
