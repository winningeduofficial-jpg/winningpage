import { useEffect, useState } from "react";
import type { NavigateFunction } from "react-router";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/types/database.types";

export type SessionUser = {
  id: string;
  email?: string;
};

// profiles 테이블 행 — 생성 타입(Tables<"profiles">)에서 파생시켜 null 가능
// 여부가 실제 스키마와 어긋나지 않게 한다(role만 NOT NULL이라 string).
export type Profile = Pick<
  Tables<"profiles">,
  | "id"
  | "name"
  | "email"
  | "phone"
  | "region"
  | "school_type"
  | "school_name"
  | "member_type"
  | "role"
>;

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
        // Profile 필드는 exactOptionalPropertyTypes 하에서 전부 필수 키(값은
        // nullable)라 Partial<Profile> 스프레드로는 채워지지 않는 키가 남는다.
        // 각 필드를 명시적으로 채워 Profile 형태를 완성한다.
        setProfile({
          id: loadedProfile?.id || currentUser.id,
          name: loadedProfile?.name ?? null,
          email: loadedProfile?.email || currentUser.email || "",
          phone: loadedProfile?.phone ?? null,
          region: loadedProfile?.region ?? null,
          school_type: loadedProfile?.school_type ?? null,
          school_name: loadedProfile?.school_name ?? null,
          member_type: loadedProfile?.member_type ?? null,
          // profiles.role은 DEFAULT 'user' NOT NULL(baseline.sql:7043).
          role: loadedProfile?.role ?? "user",
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
