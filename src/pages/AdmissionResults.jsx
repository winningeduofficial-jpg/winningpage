import { useEffect, useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import Header from '../components/Header';
import { supabase } from '../lib/supabase';

const YEAR_OPTIONS = ['전체', '2025', '2024', '2023', '2022'];
const REGION_OPTIONS = ['전체', '서울', '경기', '인천', '강원', '충북', '충남', '대전', '세종', '전북', '전남', '광주', '경북', '경남', '대구', '부산', '울산', '제주'];
const PERIOD_OPTIONS = ['전체', '수시', '정시'];
const SCREENING_OPTIONS = ['전체', '학생부교과', '학생부종합', '정시', '실기', '기타'];

function cleanText(value) {
  return String(value || '').trim();
}

function formatNumber(value) {
  if (value === null || value === undefined || value === '') return '-';
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  return Number.isInteger(number) ? String(number) : String(number).replace(/\.0+$/, '');
}

function scoreText(row) {
  if (row.score_label) return row.score_label;
  if (row.score_value === null || row.score_value === undefined || row.score_value === '') return '-';
  return `${formatNumber(row.score_value)}${row.score_basis ? ` ${row.score_basis}` : ''}`;
}

function groupKey(row) {
  return [
    cleanText(row.university_name),
    cleanText(row.campus),
    cleanText(row.department),
    cleanText(row.recruitment_period),
    cleanText(row.screening_category),
    cleanText(row.admission_track),
    cleanText(row.selection_name)
  ].join('||');
}

function groupResults(rows) {
  const map = new Map();

  rows.forEach((row) => {
    const key = groupKey(row);
    if (!map.has(key)) {
      map.set(key, {
        key,
        university_name: row.university_name,
        campus: row.campus,
        region: row.region,
        college: row.college,
        department: row.department,
        recruitment_period: row.recruitment_period,
        screening_category: row.screening_category,
        admission_track: row.admission_track,
        selection_name: row.selection_name,
        rows: []
      });
    }
    map.get(key).rows.push(row);
  });

  return Array.from(map.values())
    .map((group) => ({
      ...group,
      rows: group.rows.sort((a, b) => Number(b.result_year || 0) - Number(a.result_year || 0))
    }))
    .sort((a, b) => {
      const universityCompare = cleanText(a.university_name).localeCompare(cleanText(b.university_name), 'ko');
      if (universityCompare !== 0) return universityCompare;
      return cleanText(a.department).localeCompare(cleanText(b.department), 'ko');
    });
}

export default function AdmissionResults() {
  const [universityKeyword, setUniversityKeyword] = useState('');
  const [departmentKeyword, setDepartmentKeyword] = useState('');
  const [region, setRegion] = useState('전체');
  const [period, setPeriod] = useState('전체');
  const [screening, setScreening] = useState('전체');
  const [year, setYear] = useState('전체');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const regions = REGION_OPTIONS;

  const groupedRows = useMemo(() => groupResults(rows), [rows]);

  async function searchRows() {
    setLoading(true);
    setSearched(true);

    let query = supabase
      .from('admission_results')
      .select('*')
      .eq('is_active', true)
      .order('university_name', { ascending: true })
      .order('department', { ascending: true })
      .order('result_year', { ascending: false })
      .limit(500);

    if (universityKeyword.trim()) {
      query = query.ilike('university_name', `%${universityKeyword.trim()}%`);
    }

    if (departmentKeyword.trim()) {
      query = query.ilike('department', `%${departmentKeyword.trim()}%`);
    }

    if (region !== '전체') {
      query = query.eq('region', region);
    }

    if (period !== '전체') {
      query = query.eq('recruitment_period', period);
    }

    if (screening !== '전체') {
      query = query.eq('screening_category', screening);
    }

    if (year !== '전체') {
      query = query.eq('result_year', Number(year));
    }

    const { data, error } = await query;

    if (error) {
      console.error('입결정보 조회 실패:', error);
      alert(`입결정보 조회 실패: ${error.message}`);
      setRows([]);
    } else {
      setRows(data || []);
    }

    setLoading(false);
  }

  function resetSearch() {
    setUniversityKeyword('');
    setDepartmentKeyword('');
    setRegion('전체');
    setPeriod('전체');
    setScreening('전체');
    setYear('전체');
    setRows([]);
    setSearched(false);
  }

  useEffect(() => {
    searchRows();
    // 최초 진입 시 전체 데이터 일부를 보여주기 위한 1회 실행
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-white text-[#0D1B2A]">
      <Header />
      <main className="pt-[84px]">
        <section className="border-b border-[#E8EDF3] bg-[#F8FAFC]">
          <div className="mx-auto max-w-[1280px] px-6 py-14 text-center">
            <p className="text-sm font-black text-[#7B2FF7]">위닝에듀 입시정보</p>
            <h1 className="mt-3 text-4xl font-black tracking-[-0.04em] md:text-5xl">대학 입결정보 검색</h1>
            <p className="mt-5 text-base font-bold leading-7 text-gray-500">
              대학명과 모집단위를 기준으로 2022~2025학년도 입결을 검색합니다.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-[1280px] px-6 py-10">
          <div className="rounded-[34px] border border-[#E3E7EE] bg-white p-6 shadow-[0_12px_34px_rgba(13,27,42,0.08)]">
            <div className="grid gap-4 md:grid-cols-[1fr_1fr_160px]">
              <label className="block">
                <span className="mb-2 block text-sm font-black text-[#111827]">대학교</span>
                <div className="flex h-14 items-center rounded-2xl border border-gray-200 px-4">
                  <input
                    value={universityKeyword}
                    onChange={(e) => setUniversityKeyword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && searchRows()}
                    placeholder="부산대학교"
                    className="h-full flex-1 bg-transparent text-base font-bold outline-none placeholder:text-gray-300"
                  />
                  {universityKeyword && (
                    <button type="button" onClick={() => setUniversityKeyword('')} className="text-gray-400">
                      <X size={16} />
                    </button>
                  )}
                </div>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-black text-[#111827]">모집단위</span>
                <div className="flex h-14 items-center rounded-2xl border border-gray-200 px-4">
                  <input
                    value={departmentKeyword}
                    onChange={(e) => setDepartmentKeyword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && searchRows()}
                    placeholder="기계공학부"
                    className="h-full flex-1 bg-transparent text-base font-bold outline-none placeholder:text-gray-300"
                  />
                  {departmentKeyword && (
                    <button type="button" onClick={() => setDepartmentKeyword('')} className="text-gray-400">
                      <X size={16} />
                    </button>
                  )}
                </div>
              </label>

              <button
                type="button"
                onClick={searchRows}
                className="mt-7 inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-[#7B2FF7] px-8 text-lg font-black text-white shadow-[0_12px_28px_rgba(123,47,247,0.28)] transition hover:bg-[#6422D6]"
              >
                검색 <Search size={22} />
              </button>
            </div>

            <div className="mt-7 grid gap-4 border-t border-[#111827] bg-[#F3F0FF] p-5 md:grid-cols-4">
              <label>
                <span className="mb-2 block text-sm font-black">지역</span>
                <select value={region} onChange={(e) => setRegion(e.target.value)} className="h-12 w-full rounded-xl border border-gray-200 bg-white px-4 text-sm font-bold outline-none">
                  {regions.map((option) => <option key={option}>{option}</option>)}
                </select>
              </label>

              <label>
                <span className="mb-2 block text-sm font-black">모집시기</span>
                <select value={period} onChange={(e) => setPeriod(e.target.value)} className="h-12 w-full rounded-xl border border-gray-200 bg-white px-4 text-sm font-bold outline-none">
                  {PERIOD_OPTIONS.map((option) => <option key={option}>{option}</option>)}
                </select>
              </label>

              <label>
                <span className="mb-2 block text-sm font-black">전형유형</span>
                <select value={screening} onChange={(e) => setScreening(e.target.value)} className="h-12 w-full rounded-xl border border-gray-200 bg-white px-4 text-sm font-bold outline-none">
                  {SCREENING_OPTIONS.map((option) => <option key={option}>{option}</option>)}
                </select>
              </label>

              <label>
                <span className="mb-2 block text-sm font-black">연도</span>
                <select value={year} onChange={(e) => setYear(e.target.value)} className="h-12 w-full rounded-xl border border-gray-200 bg-white px-4 text-sm font-bold outline-none">
                  {YEAR_OPTIONS.map((option) => <option key={option}>{option}</option>)}
                </select>
              </label>
            </div>

            <div className="mt-4 flex justify-end">
              <button type="button" onClick={resetSearch} className="text-sm font-black text-gray-400 hover:text-[#0D1B2A]">
                검색조건 초기화
              </button>
            </div>
          </div>

          <div className="mt-10 flex items-center justify-between">
            <p className="text-sm font-bold text-gray-500">
              검색 결과 <span className="font-black text-[#7B2FF7]">{groupedRows.length}</span>개 묶음 / 원자료 <span className="font-black text-[#7B2FF7]">{rows.length}</span>건
            </p>
            <p className="text-xs font-bold text-gray-400">최대 500건까지 표시됩니다. 자료가 많으면 대학명·모집단위를 함께 검색하세요.</p>
          </div>

          {loading ? (
            <div className="mt-8 rounded-2xl border border-gray-200 py-24 text-center text-sm font-bold text-gray-500">
              입결정보를 불러오는 중입니다.
            </div>
          ) : searched && groupedRows.length === 0 ? (
            <div className="mt-8 rounded-2xl border border-gray-200 py-24 text-center text-sm font-bold text-gray-400">
              검색 결과가 없습니다.
            </div>
          ) : (
            <div className="mt-8 space-y-6">
              {groupedRows.map((group) => (
                <article key={group.key} className="overflow-hidden rounded-2xl border border-[#D9DDF0] bg-white shadow-sm">
                  <div className="bg-[#F7F5FF] px-6 py-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-2xl font-black tracking-[-0.04em] text-[#111827]">
                            {group.university_name}{group.campus ? `(${group.campus})` : ''}
                          </h2>
                          {group.region && <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-[#7B2FF7]">{group.region}</span>}
                          {group.recruitment_period && <span className="rounded-full bg-[#0D1B2A] px-3 py-1 text-xs font-black text-white">{group.recruitment_period}</span>}
                        </div>
                        <p className="mt-2 text-lg font-black text-[#111827]">{group.department}</p>
                        <p className="mt-1 text-sm font-bold text-gray-500">
                          {[group.screening_category, group.admission_track, group.selection_name].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[980px] border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-y border-[#E4E7EF] bg-white text-[#111827]">
                          <th className="w-[90px] px-5 py-4 font-black">연도</th>
                          <th className="px-5 py-4 font-black">전형명</th>
                          <th className="px-5 py-4 font-black">발표 기준</th>
                          <th className="px-5 py-4 font-black">성적</th>
                          <th className="px-5 py-4 font-black">반영교과/영역</th>
                          <th className="px-5 py-4 font-black">경쟁률</th>
                          <th className="px-5 py-4 font-black">충원</th>
                          <th className="px-5 py-4 font-black">최저</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.rows.map((row) => (
                          <tr key={row.id} className="border-b border-[#EEF1F6] last:border-b-0">
                            <td className="px-5 py-4 font-black text-[#7B2FF7]">{row.result_year}</td>
                            <td className="px-5 py-4 font-bold text-[#111827]">{row.admission_track || row.selection_name || '-'}</td>
                            <td className="px-5 py-4 font-bold text-gray-600">{row.score_basis || '-'}</td>
                            <td className="px-5 py-4 font-black text-[#111827]">{scoreText(row)}</td>
                            <td className="px-5 py-4 font-bold text-gray-600">{row.subject_reflection || row.score_unit || '-'}</td>
                            <td className="px-5 py-4 font-bold text-gray-600">{row.competition_rate ? `${formatNumber(row.competition_rate)}:1` : '-'}</td>
                            <td className="px-5 py-4 font-bold text-gray-600">{formatNumber(row.additional_pass_count)}</td>
                            <td className="px-5 py-4 font-bold text-gray-600">{row.min_csats || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
