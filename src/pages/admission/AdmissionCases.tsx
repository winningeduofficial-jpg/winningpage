import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import AcceptanceRateHero from "@/components/admission/AcceptanceRateHero";
import AdmissionCaseCard, {
  type AdmissionCaseRow,
} from "@/components/admission/AdmissionCaseCard";
import {
  CASE_CATEGORIES,
  CATEGORY_LABELS,
  fetchAdmissionCases,
  fetchAllAdmissionCases,
} from "./admissionCaseData";

// QA 시트(입시정보 카테고리) 반영 — 수시/정시 구분 탭을 숨기고 목록을 통합 노출한다.
// 탭 UI·카테고리별 조회 코드는 지우지 않고 이 상수로만 끈다(복원 가능해야 함).
const SHOW_CATEGORY_TABS = false;

const DESCRIPTION =
  "위닝에듀의 시작은 학생 자신입니다. 방향을 정하고, 방향에 맞는 활동을 함께 설계하고, 실행 과정을 준비합니다. 위닝의 목표는 학생 스스로 갖추는 경쟁력입니다";

export default function AdmissionCases() {
  // /admission/susi, /admission/jungsi는 리터럴 경로(:category 세그먼트 없음) —
  // pathname으로 직접 판정한다.
  const { pathname } = useLocation();
  const category =
    CASE_CATEGORIES.find((key) => pathname.startsWith(`/admission/${key}`)) ||
    "susi";

  const [rows, setRows] = useState<AdmissionCaseRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      const data = SHOW_CATEGORY_TABS
        ? await fetchAdmissionCases(category)
        : await fetchAllAdmissionCases();
      if (!alive) return;
      setRows(data);
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [category]);

  return (
    <main className="bg-white pt-16">
      <AcceptanceRateHero headlineOverride="합격생 선배들의 압도적 선택, 위닝에듀" />

      <section className="pb-20 pt-16 sm:pb-24 sm:pt-20">
        <div className="mx-auto w-full max-w-content px-5 sm:px-8">
          <h1 className="break-keep text-2xl font-semibold leading-[1.3] tracking-[-0.02em] text-ink sm:text-[2.25rem]">
            위닝에듀의 방향은 학생 스스로 갖추는 경쟁력
          </h1>

          <p className="mt-5 break-keep text-base font-medium leading-[1.4] text-[#7A7A7A]">
            {DESCRIPTION}
          </p>

          {SHOW_CATEGORY_TABS && (
            <div className="mt-9 flex items-center gap-4 sm:mt-11">
              {CASE_CATEGORIES.map((key, index) => (
                <div key={key} className="flex items-center gap-4">
                  {index > 0 && (
                    <span className="h-6 w-px bg-line" aria-hidden="true" />
                  )}
                  <Link
                    to={`/admission/${key}`}
                    className={`text-2xl font-semibold leading-[1.3] tracking-[-0.02em] ${
                      category === key ? "text-ink" : "text-line"
                    }`}
                  >
                    {CATEGORY_LABELS[key]}
                  </Link>
                </div>
              ))}
            </div>
          )}

          <div className="mt-9">
            {loading ? (
              <div className="py-24 text-center text-sm font-bold text-gray-400">
                불러오는 중입니다.
              </div>
            ) : rows.length === 0 ? (
              <div className="py-24 text-center text-sm font-bold text-gray-400">
                등록된 합격 사례가 없습니다.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-x-6 gap-y-9 sm:grid-cols-2 wide:grid-cols-4">
                {rows.map((row) => (
                  <AdmissionCaseCard key={row.id} row={row} />
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
