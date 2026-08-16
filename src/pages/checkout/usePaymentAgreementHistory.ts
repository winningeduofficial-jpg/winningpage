import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

// 결제 약관 동의(sql/78) — user_term_agreements 원장. null=조회 중.
// 재구매·다른 자녀 결제처럼 이미 동의 이력이 있으면 화면에서 이 섹션을
// 아예 건너뛴다(매 결제마다 다시 체크하게 하지 않는다 — 원장은 "이 회원이
// 이 문서에 동의했는가"를 표현하지 결제 건별 동의가 아니다).
//
// 3문서(refund_notice/payment_terms/payment_consent) 전부 agreed=true 일 때만
// 건너뛴다. RLS(user_term_agreements own read)가 본인 행만 돌려주므로 embed
// 결과는 항상 본인 것이다.
export function usePaymentAgreementHistory() {
  const [paymentAgreed, setPaymentAgreed] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await supabase
        .from("terms")
        .select("code, user_term_agreements(agreed)")
        .in("code", ["refund_notice", "payment_terms", "payment_consent"])
        .eq("is_active", true);
      if (!alive) return;
      if (error) {
        console.warn("결제 약관 동의 상태 조회 실패:", error.message);
        setPaymentAgreed(false);
        return;
      }
      const allAgreed =
        (data || []).length === 3 &&
        data.every((t) =>
          (t.user_term_agreements || []).some((a) => a.agreed === true),
        );
      setPaymentAgreed(allAgreed);
    })();
    return () => {
      alive = false;
    };
  }, []);

  return [paymentAgreed, setPaymentAgreed] as const;
}
