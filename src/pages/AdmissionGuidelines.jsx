import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, MapPin, Search } from 'lucide-react';
import Header from '../components/Header';
import { supabase } from '../lib/supabase';

const REGION_ORDER = [
  '서울',
  '경기',
  '인천',
  '강원',
  '충북',
  '충남',
  '대전',
  '세종',
  '전북',
  '전남',
  '광주',
  '경북',
  '경남',
  '대구',
  '부산',
  '울산',
  '제주'
];

const RESOURCE_BUTTONS = [
  { key: 'admission_home_url', label: '입학처', className: 'bg-[#0078EA] text-white' },
  { key: 'plan_2027_url', label: '2027 계획', className: 'bg-[#1F9E45] text-white' },
  { key: 'plan_2028_url', label: '2028 계획', className: 'bg-[#1F9E45] text-white' },
  { key: 'final_guideline_url', label: '확정 안내서', className: 'bg-[#FF7A12] text-white' },
  { key: 'hakjong_guide_url', label: '학종 안내서', className: 'bg-[#6D3CCB] text-white' },
  { key: 'major_guide_url', label: '전공안내', className: 'bg-[#6D3CCB] text-white' }
];

function cleanText(value) {
  return String(value || '').trim();
}

function openResource(url) {
  if (!url) return;
  window.open(url, '_blank', 'noopener,noreferrer');
}

function getRegionOrder(region) {
  const index = REGION_ORDER.indexOf(region);
  return index === -1 ? 999 : index;
}

function groupByRegion(rows) {
  const map = new Map();

  rows.forEach((row) => {
    const region = cleanText(row.region) || '기타';
    if (!map.has(region)) map.set(region, []);
    map.get(region).push(row);
  });

  return Array.from(map.entries())
    .sort((a, b) => getRegionOrder(a[0]) - getRegionOrder(b[0]) || a[0].localeCompare(b[0], 'ko'))
    .map(([region, items]) => ({
      region,
      items: items.sort((a, b) => {
        const orderA = Number(a.sort_order || 999);
        const orderB = Number(b.sort_order || 999);
        return orderA - orderB || cleanText(a.university_name).localeCompare(cleanText(b.university_name), 'ko');
      })
    }));
}

export default function AdmissionGuidelines() {
  const [rows, setRows] = useState([]);
  const [keyword, setKeyword] = useState('');
  const [activeRegion, setActiveRegion] = useState('전체');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    async function loadRows() {
      setLoading(true);

      const { data, error } = await supabase
        .from('admission_university_resources')
        .select('*')
        .eq('is_active', true)
        .order('region', { ascending: true })
        .order('sort_order', { ascending: true })
        .order('university_name', { ascending: true });

      if (!alive) return;

      if (error) {
        console.error('대입모집요강 조회 실패:', error);
        setRows([]);
      } else {
        setRows(data || []);
      }

      setLoading(false);
    }

    loadRows();

    return () => {
      alive = false;
    };
  }, []);

  const regions = useMemo(() => {
    const unique = Array.from(new Set(rows.map((row) => cleanText(row.region)).filter(Boolean)));
    return ['전체', ...unique.sort((a, b) => getRegionOrder(a) - getRegionOrder(b) || a.localeCompare(b, 'ko'))];
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = keyword.trim().toLowerCase();

    return rows.filter((row) => {
      const regionOk = activeRegion === '전체' || cleanText(row.region) === activeRegion;
      const searchTarget = `${row.university_name || ''} ${row.campus || ''} ${row.region || ''} ${row.ownership || ''}`.toLowerCase();
      const keywordOk = !q || searchTarget.includes(q);
      return regionOk && keywordOk;
    });
  }, [rows, keyword, activeRegion]);

  const groupedRows = useMemo(() => groupByRegion(filteredRows), [filteredRows]);

  return (
    <div className="min-h-screen bg-[#F6F7F9] text-[#0D1B2A]">
      <Header />
      <main className="pt-[84px]">
        <section className="bg-[#0D1B2A]">
          <div className="mx-auto max-w-[1500px] px-6 py-10">
            <div className="rounded-[28px] bg-[#2C2F33] px-10 py-10 text-white shadow-[0_12px_34px_rgba(0,0,0,0.24)]">
              <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-sm font-black text-[#F4C36A]">위닝에듀 입시정보</p>
                  <h1 className="mt-3 text-4xl font-black tracking-[-0.04em] md:text-5xl">
                    2027 및 2028 대학입학전형 시행계획 검색기
                  </h1>
                  <p className="mt-5 max-w-[720px] text-base font-bold leading-7 text-white/70">
                    대학명·지역별로 입학처, 시행계획, 확정 안내서, 학종 안내서, 전공 안내 자료를 한 번에 확인할 수 있습니다.
                  </p>
                </div>

                <div className="w-full max-w-[520px] rounded-2xl bg-white px-5 py-4 text-[#0D1B2A] shadow-lg">
                  <div className="flex h-12 items-center rounded-xl border border-gray-200 bg-white px-4">
                    <Search size={18} className="text-gray-400" />
                    <input
                      value={keyword}
                      onChange={(e) => setKeyword(e.target.value)}
                      placeholder="대학명을 입력하세요 예: 한국대"
                      className="ml-3 h-full flex-1 bg-transparent text-base font-bold outline-none placeholder:text-gray-400"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-[1500px] gap-8 px-6 py-8 lg:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="rounded-3xl bg-white p-6 shadow-[0_8px_28px_rgba(13,27,42,0.08)]">
            <div className="flex aspect-[4/5] items-center justify-center rounded-2xl bg-[#EFF1F4] text-center text-sm font-black leading-7 text-gray-400">
              대한민국<br />지역별 대학 자료
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              {regions.map((region) => (
                <button
                  key={region}
                  type="button"
                  onClick={() => setActiveRegion(region)}
                  className={`rounded-full px-4 py-2 text-sm font-black transition ${
                    activeRegion === region
                      ? 'bg-[#0D1B2A] text-white'
                      : 'border border-gray-200 bg-white text-gray-600 hover:border-[#B88737] hover:text-[#B88737]'
                  }`}
                >
                  {region}
                </button>
              ))}
            </div>
          </aside>

          <section className="rounded-3xl bg-white p-8 shadow-[0_8px_28px_rgba(13,27,42,0.08)]">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b-4 border-[#0078EA] pb-6">
              <div>
                <p className="text-sm font-black text-[#B88737]">검색 결과</p>
                <h2 className="mt-2 flex items-center gap-2 text-3xl font-black tracking-[-0.04em]">
                  <MapPin size={26} className="text-[#E23A64]" />
                  {activeRegion === '전체' ? '전체 지역' : activeRegion}
                  <span className="text-xl text-gray-400">({filteredRows.length}개교)</span>
                </h2>
              </div>
              <p className="text-sm font-bold text-gray-400">URL이 없는 자료 버튼은 비활성화됩니다.</p>
            </div>

            {loading ? (
              <div className="py-24 text-center text-sm font-bold text-gray-500">불러오는 중입니다.</div>
            ) : groupedRows.length === 0 ? (
              <div className="py-24 text-center text-sm font-bold text-gray-400">검색 결과가 없습니다.</div>
            ) : (
              <div className="space-y-10">
                {groupedRows.map((group) => (
                  <div key={group.region}>
                    {activeRegion === '전체' && (
                      <h3 className="mb-4 text-2xl font-black tracking-[-0.04em] text-[#0D1B2A]">
                        {group.region} <span className="text-base text-gray-400">({group.items.length}개교)</span>
                      </h3>
                    )}

                    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2 2xl:grid-cols-3">
                      {group.items.map((row) => (
                        <article
                          key={row.id}
                          className="rounded-2xl border border-[#E3E7EE] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-[0_10px_28px_rgba(13,27,42,0.10)]"
                        >
                          <div className="flex items-start gap-4">
                            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-gray-200 bg-white">
                              {row.logo_url ? (
                                <img src={row.logo_url} alt="" className="h-full w-full object-contain p-1" />
                              ) : (
                                <span className="text-xs font-black text-gray-400">LOGO</span>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <h4 className="break-keep text-xl font-black tracking-[-0.04em] text-[#111827]">
                                  {row.university_name}
                                  {row.campus ? `(${row.campus})` : ''}
                                </h4>
                                {row.ownership && (
                                  <span className="shrink-0 rounded-lg bg-[#7B1FA2] px-2 py-1 text-xs font-black text-white">
                                    {row.ownership}
                                  </span>
                                )}
                              </div>
                              <p className="mt-1 text-xs font-bold text-gray-400">{row.region || '지역 미입력'}</p>
                            </div>
                          </div>

                          <div className="mt-5 grid grid-cols-2 gap-2">
                            {RESOURCE_BUTTONS.map((button) => {
                              const url = cleanText(row[button.key]);
                              const disabled = !url;

                              return (
                                <button
                                  key={button.key}
                                  type="button"
                                  disabled={disabled}
                                  onClick={() => openResource(url)}
                                  className={`inline-flex h-10 items-center justify-center gap-1 rounded-lg text-sm font-black transition ${
                                    disabled
                                      ? 'cursor-not-allowed bg-gray-100 text-gray-300'
                                      : `${button.className} hover:brightness-95`
                                  }`}
                                >
                                  {button.label}
                                  {!disabled && <ExternalLink size={13} />}
                                </button>
                              );
                            })}
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </section>
      </main>
    </div>
  );
}
