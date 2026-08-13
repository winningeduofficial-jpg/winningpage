import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import GrowthReportBody from "../../components/goal/report/GrowthReportBody";

// 학부모 뷰어 셸 — 자녀의 성장 리포트를 학부모가 열람한다.
// 진입: 마이페이지 > 자녀 등록 및 수정 > 자녀 카드.
//
// ── 본문을 공유하는 방식 ──────────────────────────────────────────────
// GrowthReportBody 는 애초에 이 용도를 전제로 셸과 분리돼 있다(그 파일 주석:
// "학부모 뷰 셸이 동일한 period/onPeriodChange 만 넘기면 그대로 재사용 가능하도록
// 이 파일 안에 if (isParent) 류의 뷰어 분기를 절대 두지 않는다"). 그 계약을
// 지켜 이 셸은 헤더와 가드만 담당하고 본문에는 아무것도 주입하지 않는다.
//
// ⚠ 지금 본문은 실데이터가 아니다. GrowthReportBody 는 goalReportMock 을 직접
// import 하며 DB 를 전혀 읽지 않는다 — 자녀 것이든 본인 것이든 같은 샘플이 뜬다.
// 그래서 화면 상단에 샘플 표시를 띄운다(아래 SAMPLE_NOTICE). 실데이터가 붙으면
// 조회 축이 auth.uid() 기준이 될 텐데 학부모는 자녀 goal 데이터를 RLS 로 못
// 읽으므로, 그때 fn_child_growth_report(p_student_id, p_period) 같은 SECURITY
// DEFINER RPC 가 필요하다(내부에서 fn_is_linked_pair 로 권한 확인 — sql/68).
// 이 셸은 그 자리를 미리 만들어 둔 것이다.
//
// ── 권한 판정 ─────────────────────────────────────────────────────────
// fn_parent_children(sql/73)이 곧 인가다 — 그 함수는 auth.uid() 가 parent_id 인
// 링크만 돌려주므로, 반환 목록에 이 studentId 가 없으면 볼 권한이 없다는 뜻이다.
// fn_is_linked_pair 를 따로 부르지 않는 이유는 판정 축을 둘로 늘리지 않기
// 위해서다(자녀 목록과 열람 권한이 갈라지면 목록에 보이는데 못 여는 상태가 난다).
// 이 판정은 UI 게이트이며, 실데이터가 붙는 시점의 진짜 방어선은 위 RPC 쪽이다.

const VALID_PERIODS = ["weekly", "monthly"];

// ⚠ 신규 카피 — 승인 필요.
const SAMPLE_NOTICE =
  "지금 보이는 수치는 화면 구성을 확인하기 위한 샘플입니다. 실제 학습 데이터 연동 후 자녀의 기록으로 바뀝니다.";

export default function ChildReport() {
  const { studentId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  const [child, setChild] = useState(undefined); // undefined 로딩 / null 권한없음

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

  const periodParam = searchParams.get("period");
  const period = VALID_PERIODS.includes(periodParam) ? periodParam : "weekly";

  function handlePeriodChange(nextPeriod) {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      params.set("period", nextPeriod);
      return params;
    });
  }

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
          {SAMPLE_NOTICE}
        </p>
      </div>

      {/* 본문은 학생 뷰와 100% 동일한 공유 컴포넌트다 — 여기에 뷰어 분기를 넣지 말 것. */}
      <GrowthReportBody period={period} onPeriodChange={handlePeriodChange} />
    </main>
  );
}
