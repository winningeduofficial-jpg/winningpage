import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  CalendarDays,
  ChevronRight,
  ExternalLink,
  FileText,
  GraduationCap,
  Search,
  Sparkles,
  Star
} from 'lucide-react';
import Header from '../components/Header';
import { supabase } from '../lib/supabase';

const PRIMARY_RESOURCES = [
  {
    label: '수시모집요강',
    keys: ['susi_guideline_url', 'susi_url', 'rolling_guideline_url'],
    icon: FileText
  },
  {
    label: '정시모집요강',
    keys: ['jungsi_guideline_url', 'jungsi_url', 'regular_guideline_url'],
    icon: GraduationCap
  },
  {
    label: '학생부종합가이드북',
    keys: ['hakjong_guide_url', 'student_record_guide_url'],
    icon: BookOpen
  }
];

const SECONDARY_RESOURCES = [
  {
    label: '선행학습영향평가',
    keys: ['prior_learning_assessment_url', 'pre_learning_url', 'influence_assessment_url'],
    icon: Sparkles
  },
  {
    label: '대입전형시행계획',
    keys: ['admission_plan_url', 'plan_url', 'plan_2028_url', 'plan_2027_url'],
    icon: CalendarDays
  },
  {
    label: '확정 안내서',
    keys: ['final_guideline_url', 'final_guide_url'],
    icon: GraduationCap
  }
];

function clean(value) {
  return String(value || '').trim();
}

function getFirstUrl(row, keys) {
  for (const key of keys) {
    const value = clean(row?.[key]);
    if (value) return value;
  }
  return '';
}

function getUniversityTitle(row) {
  const name = clean(row.university_name) || '대학명 미입력';
  const campus = clean(row.campus);

  if (!campus) return name;
  if (name.includes(campus) || name.includes('(')) return name;

  return `${name}(${campus})`;
}

function ResourceButton({ label, url, Icon, variant = 'primary' }) {
  const enabled = Boolean(url);

  const baseClass =
    variant === 'primary'
      ? 'inline-flex h-11 min-w-[148px] items-center justify-center gap-2 rounded-xl border px-4 text-sm font-black transition'
      : 'inline-flex items-center gap-2 text-sm font-extrabold transition';

  const enabledClass =
    variant === 'primary'
      ? 'border-[#D6DDE8] bg-white text-[#0D1B2A] shadow-sm hover:border-[#B88737] hover:text-[#B88737] hover:shadow-md'
      : 'text-[#667085] hover:text-[#B88737]';

  const disabledClass =
    variant === 'primary'
      ? 'cursor-not-allowed border-[#EEF1F5] bg-[#F1F3F6] text-[#A8B0BC]'
      : 'cursor-not-allowed text-[#B9C0CA]';

  if (!enabled) {
    return (
      <span className={`${baseClass} ${disabledClass}`} title="등록된 자료가 없습니다.">
        {Icon ? <Icon className="h-4 w-4" /> : null}
        {label}
      </span>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className={`${baseClass} ${enabledClass}`}
      title={`${label} 열기`}
    >
      {Icon ? <Icon className="h-4 w-4" /> : null}
      {label}
      {variant === 'primary' ? <ExternalLink className="h-3.5 w-3.5 opacity-50" /> : null}
    </a>
  );
}

function UniversityCard({ row }) {
  const homeUrl = clean(row.admission_home_url);

  return (
    <article className="overflow-hidden rounded-2xl border border-[#D8DEE8] bg-white shadow-[0_4px_18px_rgba(13,27,42,0.04)] transition hover:-translate-y-0.5 hover:shadow-[0_12px_26px_rgba(13,27,42,0.08)]">
      <div className="flex flex-col gap-5 px-5 py-6 md:flex-row md:items-start md:justify-between md:px-7">
        <div className="flex min-w-0 gap-4">
          <div className="pt-0.5 text-[#D5DAE2]">
            {row.logo_url ? (
              <img
                src={row.logo_url}
                alt=""
                className="h-8 w-8 rounded-full object-contain"
                onError={(event) => {
                  event.currentTarget.style.display = 'none';
                }}
              />
            ) : (
              <Star className="h-8 w-8 fill-current" />
            )}
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-[22px] font-black tracking-[-0.04em] text-[#0D1B2A]">
                {getUniversityTitle(row)}
              </h2>
              {row.ownership ? (
                <span className="rounded-full bg-[#F4F6F9] px-2.5 py-1 text-xs font-black text-[#7B8494]">
                  {row.ownership}
                </span>
              ) : null}
            </div>

            {homeUrl ? (
              <a
                href={homeUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1 border-b border-[#9AA4B2] text-sm font-extrabold text-[#475467] hover:border-[#B88737] hover:text-[#B88737]"
              >
                입학처 바로가기
                <ChevronRight className="h-4 w-4" />
              </a>
            ) : (
              <span className="mt-3 inline-flex cursor-not-allowed items-center gap-1 border-b border-transparent text-sm font-extrabold text-[#B9C0CA]">
                입학처 바로가기
                <ChevronRight className="h-4 w-4" />
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-3 md:justify-end">
          {PRIMARY_RESOURCES.map((resource) => (
            <ResourceButton
              key={resource.label}
              label={resource.label}
              url={getFirstUrl(row, resource.keys)}
              Icon={resource.icon}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-3 border-t border-[#EEF1F5] bg-[#F7F8FA] px-5 py-4 md:px-7">
        {SECONDARY_RESOURCES.map((resource, index) => (
          <div key={resource.label} className="flex items-center gap-5">
            <ResourceButton
              label={resource.label}
              url={getFirstUrl(row, resource.keys)}
              Icon={resource.icon}
              variant="secondary"
            />
            {index < SECONDARY_RESOURCES.length - 1 ? <span className="hidden h-4 w-px bg-[#D7DDE5] sm:block" /> : null}
          </div>
        ))}
      </div>
    </article>
  );
}

export default function AdmissionGuidelines() {
  const [rows, setRows] = useState([]);
  const [keyword, setKeyword] = useState('');
  const [region, setRegion] = useState('전체');
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let alive = true;

    async function loadRows() {
      setLoading(true);
      setErrorMessage('');

      const { data, error } = await supabase
        .from('admission_university_resources')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('region', { ascending: true })
        .order('university_name', { ascending: true });

      if (!alive) return;

      if (error) {
        console.error('대입모집요강 조회 실패:', error);
        setRows([]);
        setErrorMessage('대학 자료를 불러오지 못했습니다. Supabase 테이블과 RLS 정책을 확인하세요.');
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
    const list = rows.map((row) => clean(row.region)).filter(Boolean);
    return ['전체', ...Array.from(new Set(list))];
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = keyword.trim().toLowerCase();

    return rows.filter((row) => {
      const matchesRegion = region === '전체' || clean(row.region) === region;
      if (!matchesRegion) return false;

      if (!q) return true;

      const target = [
        row.region,
        row.university_name,
        row.campus,
        row.ownership,
        row.memo
      ]
        .map((value) => clean(value).toLowerCase())
        .join(' ');

      return target.includes(q);
    });
  }, [keyword, region, rows]);

  return (
    <div className="min-h-screen bg-[#F6F7F9] text-[#0D1B2A]">
      <Header />
      <main className="pt-[84px]">
        <section className="border-b border-[#E8EDF3] bg-white">
          <div className="mx-auto max-w-[1440px] px-5 py-10 md:px-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-sm font-black text-[#7B2FF7]">위닝에듀 입시정보</p>
                <h1 className="mt-2 text-4xl font-black tracking-[-0.05em] md:text-5xl">
                  대입모집요강 검색
                </h1>
                <p className="mt-4 max-w-[760px] text-base font-bold leading-7 text-[#667085]">
                  대학별 입학처, 수시·정시 모집요강, 학생부종합 가이드북, 선행학습영향평가, 대입전형 시행계획을 한 화면에서 확인합니다.
                </p>
              </div>

              <div className="rounded-2xl border border-[#E3E7EE] bg-[#F8FAFC] px-5 py-4 text-sm font-black text-[#475467]">
                입시정보: <span className="text-[#7B2FF7]">{filteredRows.length}</span>건
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1440px] px-5 py-8 md:px-8">
          <div className="sticky top-[84px] z-20 rounded-2xl border border-[#E3E7EE] bg-white/95 p-4 shadow-[0_8px_24px_rgba(13,27,42,0.06)] backdrop-blur">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <label className="relative flex-1">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#98A2B3]" />
                <input
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  placeholder="대학명, 지역, 캠퍼스를 검색하세요"
                  className="h-12 w-full rounded-xl border border-[#D8DEE8] bg-[#F9FAFB] pl-11 pr-4 text-sm font-bold text-[#0D1B2A] outline-none transition placeholder:text-[#98A2B3] focus:border-[#7B2FF7] focus:bg-white focus:ring-4 focus:ring-[#7B2FF7]/10"
                />
              </label>

              <div className="flex gap-2 overflow-x-auto pb-1 lg:max-w-[620px]">
                {regions.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setRegion(item)}
                    className={`h-10 shrink-0 rounded-full px-4 text-sm font-black transition ${
                      region === item
                        ? 'bg-[#0D1B2A] text-white shadow-sm'
                        : 'bg-[#F1F3F6] text-[#667085] hover:bg-[#E8ECF2]'
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            {loading ? (
              <div className="rounded-2xl border border-[#E3E7EE] bg-white py-20 text-center text-sm font-black text-[#667085]">
                대학 자료를 불러오는 중입니다.
              </div>
            ) : errorMessage ? (
              <div className="rounded-2xl border border-[#FEDF89] bg-[#FFFAEB] p-6 text-sm font-bold leading-7 text-[#93370D]">
                {errorMessage}
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="rounded-2xl border border-[#E3E7EE] bg-white py-20 text-center">
                <p className="text-lg font-black text-[#0D1B2A]">검색 결과가 없습니다.</p>
                <p className="mt-2 text-sm font-bold text-[#667085]">검색어 또는 지역 필터를 다시 확인하세요.</p>
              </div>
            ) : (
              filteredRows.map((row) => <UniversityCard key={row.id || `${row.university_name}-${row.campus}`} row={row} />)
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

