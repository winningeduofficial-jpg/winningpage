import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

// Header.jsx(:151 근방)가 profiles 를 조회하는 것과 같은 컬럼 세트.
const PROFILE_COLUMNS = "id, name, email, username, member_type, role";

/**
 * 로그인 세션 + profiles.member_type 을 함께 조회하는 공용 훅.
 *
 * Checkout.jsx 와 Pricing.jsx 가 둘 다 "로그인 사용자가 학생/학부모/그 외 중
 * 무엇인지" 판정해야 하는데, 각자 인라인으로 이 조회를 손으로 쓰면 판정이
 * 갈릴 수 있다(2026-08-12b 팀 리드 지시 — 이번 세션에 DB 쪽에서 같은 병으로
 * 결함이 두 번 났다) — 그래서 조회 자체는 여기 한 곳으로 뺀다.
 *
 * memberType 값을 "역할"로 해석해 화면을 분기하는 것은 호출부 책임으로
 * 남겨둔다 — Checkout 은 ProtectedRoute(App.jsx:109)가 이미 비로그인을
 * 막아 게스트 케이스가 없고, Pricing 은 게스트를 별도로(기존 판매 UI 그대로)
 * 다뤄야 해서 두 페이지의 분기 자체는 서로 다르다. 이 훅은 그 차이를 알
 * 필요가 없다.
 *
 * 반환:
 *   loading      조회 진행 중(세션 확인 + profiles 조회 모두 끝나면 false)
 *   userId       로그인 사용자 id. 게스트/로딩 중이면 null.
 *   memberType   profiles.member_type 소문자 정규화값('' = 미설정). 게스트면 null
 *                (미설정과 게스트를 구분해야 호출부가 "로그인은 했지만 유형이
 *                없는 사용자"를 게스트로 오판하지 않는다).
 *   error        profiles 조회 실패 시 Error, 그 외엔 null.
 *   refetch      조회를 처음부터 다시 실행한다. 소비처가 error 를 "차단"이
 *                아니라 "일시 오류"로 다룰 때(재시도 버튼) 쓴다 — useProducts
 *                의 refetch 와 같은 역할이라 이름도 맞췄다.
 */
export function useMemberType() {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState(null);
  const [memberType, setMemberType] = useState(null);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  const refetch = useCallback(() => setReloadKey((k) => k + 1), []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadKey는 effect 안에서 읽지 않는 refetch 트리거 전용 카운터다.
  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      setError(null);

      const { data: sessionData } = await supabase.auth.getSession();
      const uid = sessionData?.session?.user?.id ?? null;

      if (!alive) return;

      if (!uid) {
        setUserId(null);
        setMemberType(null);
        setLoading(false);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select(PROFILE_COLUMNS)
        .eq("id", uid)
        .maybeSingle();

      if (!alive) return;

      if (profileError) {
        console.error("profiles 조회 실패:", profileError);
        setUserId(uid);
        setMemberType(null);
        setError(profileError);
        setLoading(false);
        return;
      }

      setUserId(uid);
      setMemberType(String(profile?.member_type || "").toLowerCase());
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [reloadKey]);

  return { loading, userId, memberType, error, refetch };
}
