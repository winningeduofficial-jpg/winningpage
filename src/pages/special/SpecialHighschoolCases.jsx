import { useEffect, useState } from 'react';
import AcceptanceRateHero from '../../components/admission/AcceptanceRateHero';
import SpecialHighschoolCaseCard from '../../components/special/SpecialHighschoolCaseCard';
import {
  SPECIAL_HS_TABS,
  SPECIAL_HS_DESCRIPTION,
  fetchSpecialHighschoolCases,
  filterByType
} from './specialHighschoolData';

export default function SpecialHighschoolCases() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all');

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      const data = await fetchSpecialHighschoolCases();
      if (!alive) return;
      setRows(data);
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, []);

  const visible = filterByType(rows, tab);

  return (
    <main className="bg-white pt-16">
      <AcceptanceRateHero scope="special-highschool" />

      <section className="pb-20 pt-16 sm:pb-24 sm:pt-20">
        <div className="mx-auto w-full max-w-content px-5 sm:px-8">
          <h1 className="break-keep text-2xl font-semibold leading-[1.3] tracking-[-0.02em] text-[#525252] sm:text-[2.25rem]">
            특목고 합격 사례
          </h1>

          <p className="mt-5 max-w-[48rem] break-keep text-base font-medium leading-[1.4] text-[#7A7A7A]">
            {SPECIAL_HS_DESCRIPTION}
          </p>

          <div className="mt-9 flex items-center gap-4 sm:mt-11" role="tablist">
            {SPECIAL_HS_TABS.map((item, index) => (
              <div key={item.key} className="flex items-center gap-4">
                {index > 0 && <span className="h-6 w-px bg-[#D7D7D7]" aria-hidden="true" />}
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === item.key}
                  onClick={() => setTab(item.key)}
                  className={`text-2xl font-semibold leading-[1.3] tracking-[-0.02em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
                    tab === item.key ? 'text-[#525252]' : 'text-[#D7D7D7]'
                  }`}
                >
                  {item.label}
                </button>
              </div>
            ))}
          </div>

          <div className="mt-9">
            {loading ? (
              <div className="py-24 text-center text-sm font-bold text-gray-400">
                불러오는 중입니다.
              </div>
            ) : visible.length === 0 ? (
              <div className="py-24 text-center text-sm font-bold text-gray-400">
                등록된 합격 사례가 없습니다.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-x-[1.0625rem] gap-y-[1.4625rem] sm:grid-cols-2 wide:grid-cols-4">
                {visible.map((row) => (
                  <SpecialHighschoolCaseCard key={row.id} row={row} />
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
