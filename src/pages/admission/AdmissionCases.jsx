import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import AcceptanceRateHero from "../../components/admission/AcceptanceRateHero";
import AdmissionCaseCard from "../../components/admission/AdmissionCaseCard";
import {
  CASE_CATEGORIES,
  CATEGORY_LABELS,
  fetchAdmissionCases,
} from "./admissionCaseData";

const DESCRIPTION =
  "강원석미래교육연구소 위닝에듀는 해운대 센텀 연구소와 화명센터가 운영되고 있으며 학생 개인에 맞춘 학습코칭으로 정확한 로드맵을 제시합니다. 1:1 학습코칭으로 내신 상승 프로그램을 제시, 성적향상을 이끌며 각 교과별 수행평가에서 진로.진학을 고려해 학생의 학업역량이 드러나는 탐구활동을 제시, 가이드하여 수시학생부종합의 합격 조건인 학교생활기록부의 차별성을 인정받고 있습니다";

export default function AdmissionCases() {
  // /admission/susi, /admission/jungsi는 리터럴 경로(:category 세그먼트 없음) —
  // pathname으로 직접 판정한다.
  const { pathname } = useLocation();
  const category =
    CASE_CATEGORIES.find((key) => pathname.startsWith(`/admission/${key}`)) ||
    "susi";

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      const data = await fetchAdmissionCases(category);
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
      <AcceptanceRateHero />

      <section className="pb-20 pt-16 sm:pb-24 sm:pt-20">
        <div className="mx-auto w-full max-w-content px-5 sm:px-8">
          <h1 className="break-keep text-2xl font-semibold leading-[1.3] tracking-[-0.02em] text-[#525252] sm:text-[2.25rem]">
            수시정시 합격 사례
          </h1>

          <p className="mt-5 max-w-[48rem] break-keep text-base font-medium leading-[1.4] text-[#7A7A7A]">
            {DESCRIPTION}
          </p>

          <div className="mt-9 flex items-center gap-4 sm:mt-11">
            {CASE_CATEGORIES.map((key, index) => (
              <div key={key} className="flex items-center gap-4">
                {index > 0 && (
                  <span className="h-6 w-px bg-[#D7D7D7]" aria-hidden="true" />
                )}
                <Link
                  to={`/admission/${key}`}
                  className={`text-2xl font-semibold leading-[1.3] tracking-[-0.02em] ${
                    category === key ? "text-[#525252]" : "text-[#D7D7D7]"
                  }`}
                >
                  {CATEGORY_LABELS[key]}
                </Link>
              </div>
            ))}
          </div>

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
