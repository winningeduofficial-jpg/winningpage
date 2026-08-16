import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { supabase } from "../lib/supabase";

// getSession()이 응답 없이 무한 대기하는 경우를 대비한 타임아웃 폴백.
// MyPage.jsx / Header.jsx의 withTimeout 선례와 동일한 패턴이다.
function withTimeout<T, F = null>(
  promise: Promise<T>,
  ms: number,
  fallbackValue: F = null as F,
): Promise<T | F> {
  return Promise.race([
    promise,
    new Promise<F>((resolve) => {
      window.setTimeout(() => resolve(fallbackValue), ms);
    }),
  ]);
}

/**
 * 이미 로그인된 사용자를 로그인 폼에서 목적지로 튕겨내는 게이트.
 *
 * 반환하는 checking 이 true 인 동안은 세션 확인이 끝나지 않은 것이므로
 * 호출부는 로그인 폼 대신 로딩 화면을 그려야 한다 — 세션이 있는 사용자에게
 * 폼이 잠깐 노출됐다 사라지는 번쩍임을 막기 위함이다. 세션 확인 자체가
 * 실패해도 fail-open 으로 checking 을 false 로 내려 로그인 폼은 반드시 연다.
 */
export function useRedirectIfAuthenticated(redirectTo: string) {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let alive = true;

    async function checkSession() {
      try {
        const { data } = await withTimeout(supabase.auth.getSession(), 3500, {
          data: { session: null },
        });

        if (!alive) return;

        if (data?.session?.user) {
          // 이동 중 폼이 번쩍이지 않도록 checking은 계속 true로 둔다.
          navigate(redirectTo, { replace: true });
          return;
        }

        setChecking(false);
      } catch (error) {
        console.error("기존 세션 확인 오류:", error);
        if (alive) setChecking(false);
      }
    }

    checkSession();

    return () => {
      alive = false;
    };
  }, [navigate, redirectTo]);

  return checking;
}
