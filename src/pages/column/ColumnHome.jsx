import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import ColumnCard from '../../components/column/ColumnCard';
import CategoryChips from '../../components/column/CategoryChips';
import { ALL_CATEGORY, fetchActiveColumns, getCategoryLabel, pickFeaturedColumns } from './columnData';

const SECTION_TITLE =
  'break-keep text-[2.75rem] font-semibold leading-[1.3] tracking-[-0.02em] text-[#525252]';

export default function ColumnHome() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState(ALL_CATEGORY);

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      const data = await fetchActiveColumns();
      if (!alive) return;
      setRows(data);
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, []);

  const featured = useMemo(() => pickFeaturedColumns(rows), [rows]);
  const [heroLarge, ...heroSmalls] = featured;

  const restRows = useMemo(() => {
    const featuredIds = new Set(featured.map((row) => row.id));
    return rows.filter((row) => !featuredIds.has(row.id));
  }, [rows, featured]);

  const filteredGridRows = useMemo(() => {
    const filtered =
      category === ALL_CATEGORY
        ? restRows
        : restRows.filter((row) => getCategoryLabel(row) === category);

    return filtered.slice(0, 16);
  }, [restRows, category]);

  return (
    <main className="bg-white pt-16">
      {!loading && rows.length === 0 ? (
        <div className="mx-auto w-full max-w-[94rem] px-5 py-24 text-center sm:px-8">
          <p className="text-sm font-bold text-gray-400">등록된 교육칼럼이 없습니다.</p>
        </div>
      ) : (
        <>
          <section className="pt-16 sm:pt-20 md:pt-[11rem]">
            <div className="mx-auto w-full max-w-[94rem] px-5 sm:px-8">
              <h2 className={SECTION_TITLE}>이번주 가장 인기 있는 칼럼</h2>

              {loading ? (
                <div className="py-24 text-center text-sm font-bold text-gray-400">
                  불러오는 중입니다.
                </div>
              ) : (
                heroLarge && (
                  <div className="mt-12 flex flex-col gap-10 lg:flex-row lg:gap-9">
                    <ColumnCard column={heroLarge} variant="heroLarge" />

                    {heroSmalls.length > 0 && (
                      <div className="flex flex-col gap-6 lg:w-[40.75rem] lg:shrink-0">
                        {heroSmalls.map((row) => (
                          <ColumnCard key={row.id} column={row} variant="heroSmall" />
                        ))}
                      </div>
                    )}
                  </div>
                )
              )}
            </div>
          </section>

          {!loading && (
            <section className="mt-24 pb-20 sm:pb-24 md:mt-[11.5rem] md:pb-[10rem]">
              <div className="mx-auto w-full max-w-[94rem] px-5 sm:px-8">
                <div className="flex items-center justify-between">
                  <h2 className={SECTION_TITLE}>카테고리별 보기</h2>
                  <Link
                    to="/info/column/list"
                    className="inline-flex shrink-0 items-center gap-1 text-base font-medium text-[#013262]"
                  >
                    더보기
                    <ChevronRight size={16} />
                  </Link>
                </div>

                <div className="mt-[3.375rem]">
                  <CategoryChips active={category} onChange={setCategory} align="left" />
                </div>

                {filteredGridRows.length === 0 ? (
                  <div className="py-24 text-center text-sm font-bold text-gray-400">
                    등록된 교육칼럼이 없습니다.
                  </div>
                ) : (
                  <div className="mt-[3.375rem] grid grid-cols-1 gap-x-5 gap-y-9 sm:grid-cols-2 wide:grid-cols-4">
                    {filteredGridRows.map((row) => (
                      <ColumnCard key={row.id} column={row} variant="grid" />
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}
