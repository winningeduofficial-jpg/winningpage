import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";

type ProtectedAdminProps = {
  children: ReactNode;
};

export default function ProtectedAdmin({ children }: ProtectedAdminProps) {
  const location = useLocation();

  const [status, setStatus] = useState("loading");

  useEffect(() => {
    let alive = true;

    async function checkAdmin() {
      if (import.meta.env.DEV && import.meta.env.VITE_ADMIN_BYPASS === "true") {
        setStatus("admin");
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;

      if (!alive) return;

      if (!user) {
        setStatus("guest");
        return;
      }

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (!alive) return;

      if (error || profile?.role !== "admin") {
        setStatus("forbidden");
        return;
      }

      setStatus("admin");
    }

    checkAdmin();

    return () => {
      alive = false;
    };
  }, []);

  if (status === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F7F4EF] pt-16 text-[#0D1B2A]">
        <div className="rounded-2xl border border-[#0D1B2A]/10 bg-white px-6 py-4 text-sm font-extrabold shadow-[0_18px_45px_rgba(13,27,42,0.10)]">
          관리자 권한 확인 중...
        </div>
      </main>
    );
  }

  if (status === "guest") {
    // §5.2: 로그인 후 원래 경로 복귀는 ?redirect= 쿼리 관례로 통일(Login.jsx가 location.state를
    // 읽지 않고 ?redirect만 읽는다).
    const redirectPath = `${location.pathname}${location.search}${location.hash}`;
    return (
      <Navigate
        to={`/login?redirect=${encodeURIComponent(redirectPath)}`}
        replace
      />
    );
  }

  if (status === "forbidden") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F7F4EF] px-6 pt-16 text-[#0D1B2A]">
        <div className="max-w-md rounded-3xl border border-[#0D1B2A]/10 bg-white p-8 text-center shadow-[0_22px_60px_rgba(13,27,42,0.12)]">
          <p className="text-2xl font-black">관리자 권한이 없습니다.</p>

          <p className="mt-3 text-sm font-bold leading-6 text-[#5B6573]">
            관리자 페이지는 profiles 테이블의 role 값이 admin인 계정만 접근할 수
            있습니다.
          </p>
        </div>
      </main>
    );
  }

  return children;
}
