import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";

// 학부모 뷰어 셸 — 자녀의 성장 리포트를 학부모가 열람한다.
// 진입: 마이페이지 > 자녀 등록 및 수정 > 자녀 카드.
//
// ── 본문을 공유하는 방식(현재 보류) ──────────────────────────────────
// 원래 이 셸은 GrowthReportBody 에 period/onPeriodChange 만 넘겨 학생 뷰와 동일한
// 본문을 그대로 재사용할 계획이었다(그 파일 주석: "학부모 뷰 셸이 동일한
// period/onPeriodChange 만 넘기면 그대로 재사용 가능"). 그런데 다른 배치
// (goal-app-api, mock 제거/실배선)가 GrowthReportBody 를 "report 를 필수 prop 으로
// 받는" 순수 프레젠테이션 컴포넌트로 이미 바꿔놨다 — 더 이상 mock 을 스스로 들고
// 있지 않는다. 자녀 리포트를 실제로 조회하려면 학부모는 자녀 goal 데이터를 RLS 로
// 못 읽으므로 fn_child_growth_report(p_student_id, p_period) 같은 SECURITY DEFINER
// RPC 가 새로 필요하다(내부에서 fn_is_linked_pair 로 권한 확인 — sql/68). 그 RPC와
// 실배선은 이 파일의 범위(TS 타입 전환)를 넘는 별도 작업이라 지어내지 않는다 —
// 대신 아래에서 "준비 중" 안내만 보여주고, RPC가 생기면 여기서 report 를 조회해
// GrowthReportBody 를 다시 렌더하면 된다.
//
// ── 권한 판정 ─────────────────────────────────────────────────────────
// fn_parent_children(sql/73)이 곧 인가다 — 그 함수는 auth.uid() 가 parent_id 인
// 링크만 돌려주므로, 반환 목록에 이 studentId 가 없으면 볼 권한이 없다는 뜻이다.
// fn_is_linked_pair 를 따로 부르지 않는 이유는 판정 축을 둘로 늘리지 않기
// 위해서다(자녀 목록과 열람 권한이 갈라지면 목록에 보이는데 못 여는 상태가 난다).
// 이 판정은 UI 게이트이며, 실데이터가 붙는 시점의 진짜 방어선은 위 RPC 쪽이다.

// ⚠ 신규 카피 — 승인 필요.
const PREPARING_NOTICE =
  "자녀의 성장 리포트를 준비 중이에요. 실제 학습 데이터 연동 후 확인할 수 있어요.";

type ParentChildRow = {
  student_profile_id: string;
  student_name: string;
  link_status: string;
};

export default function ChildReport() {
  const { studentId } = useParams();

  // undefined 로딩 / null 권한없음
  const [child, setChild] = useState<ParentChildRow | null | undefined>(
    undefined,
  );

  useEffect(() => {
    let alive = true;

    (async () => {
      const { data, error } = await supabase.rpc("fn_parent_children");
      if (!alive) return;

      if (error) {
        console.error("자녀 조회 실패:", error);
        setChild(null);
        return;
      }

      const found = (data || []).find(
        (row) =>
          row.student_profile_id === studentId &&
          row.link_status === "approved",
      );
      setChild(found || null);
    })();

    return () => {
      alive = false;
    };
  }, [studentId]);

  if (child === undefined) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white pt-16">
        <p className="text-[0.875rem] font-medium text-ink-sub">
          리포트를 불러오는 중입니다.
        </p>
      </main>
    );
  }

  if (child === null) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-5 bg-white pt-16">
        <p className="text-[0.9375rem] font-medium text-ink">
          이 학생의 리포트를 볼 수 있는 권한이 없습니다.
        </p>
        <Link
          to="/mypage?tab=children"
          className="inline-flex h-[2.5rem] items-center justify-center rounded-lg bg-primary px-5 text-[0.875rem] font-semibold text-white transition hover:opacity-90"
        >
          자녀 목록으로
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white pt-16">
      <div className="mx-auto w-full max-w-content px-5 pt-10 sm:px-8">
        <Link
          to="/mypage?tab=children"
          className="text-[0.875rem] font-medium text-ink-sub underline underline-offset-4 transition hover:text-ink"
        >
          ← 자녀 목록
        </Link>

        <h1 className="mt-4 text-[1.5rem] font-semibold leading-[1.3] tracking-[-0.02em] text-ink">
          {child.student_name} 학생의 성장 리포트
        </h1>

        <p className="mt-4 break-keep rounded-xl bg-[#FFF7E0] px-4 py-3 text-[0.8125rem] leading-relaxed text-[#8A6D1F]">
          {PREPARING_NOTICE}
        </p>
      </div>
    </main>
  );
}
