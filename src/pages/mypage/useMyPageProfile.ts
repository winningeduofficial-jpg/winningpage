import { useEffect, useState } from "react";
import type { NavigateFunction } from "react-router";
import { supabase } from "../../lib/supabase";

export type SessionUser = {
  id: string;
  email?: string;
};

export type Profile = {
  id?: string;
  name?: string;
  email?: string;
  phone?: string;
  region?: string;
  school_type?: string;
  school_name?: string;
  member_type?: string;
  role?: string;
};

function cleanText(value: unknown) {
  return String(value || "").trim();
}

function withTimeout<T, F = null>(
  promise: PromiseLike<T>,
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

async function queryProfile(user: SessionUser): Promise<Partial<Profile>> {
  const byId = await withTimeout(
    supabase
      .from("profiles")
      .select(
        "id, name, email, phone, region, school_type, school_name, member_type, role",
      )
      .eq("id", user.id)
      .maybeSingle(),
    3500,
    { data: null, error: new Error("profile_timeout") },
  );

  if (!byId?.error && byId?.data?.name) return byId.data;

  const email = cleanText(user.email).toLowerCase();

  if (email) {
    const byEmail = await withTimeout(
      supabase
        .from("profiles")
        .select(
          "id, name, email, phone, region, school_type, school_name, member_type, role",
        )
        .eq("email", email)
        .maybeSingle(),
      3500,
      { data: null, error: new Error("profile_timeout") },
    );

    if (!byEmail?.error && byEmail?.data?.name) return byEmail.data;
  }

  return byId?.data || {};
}

// 로그인 세션 + profiles 조회. 세션이 없으면 /login으로 리다이렉트한다.
export function useMyPageProfile(navigate: NavigateFunction) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    async function loadProfile() {
      setLoading(true);

      try {
        const sessionResult = await withTimeout(
          supabase.auth.getSession(),
          3500,
          {
            data: { session: null },
          },
        );
        const currentUser = sessionResult?.data?.session?.user;

        if (!alive) return;

        if (!currentUser) {
          navigate("/login", { replace: true });
          return;
        }

        const loadedProfile = await queryProfile(currentUser);

        if (!alive) return;

        setUser(currentUser);
        setProfile({
          ...loadedProfile,
          id: loadedProfile?.id || currentUser.id,
          email: loadedProfile?.email || currentUser.email || "",
        });
      } catch (error) {
        console.error("마이페이지 로딩 오류:", error);
      } finally {
        if (alive) setLoading(false);
      }
    }

    loadProfile();

    return () => {
      alive = false;
    };
  }, [navigate]);

  return { user, profile, loading };
}
