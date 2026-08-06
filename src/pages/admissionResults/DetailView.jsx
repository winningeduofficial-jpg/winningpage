// 입결정보 상세 화면 (Figma 1882:2958).
//
// docs/admission-results-renewal-spec.md §2 기준으로 /admission/results?u=&d= 상태에서
// 셸(src/pages/AdmissionResults.jsx)이 렌더하는 뷰다. 셸 파일은 다른 작업자가 잡고 있어
// 이 파일은 셸에 의존하지 않고 단독으로 동작하도록 만들었다.
//
// 사용자 지시: "대강 반영, 아직 확정 아님" — 구조와 UX는 시안대로 잡되 픽셀 정합은 하지 않는다.
// 그래서 시안의 1920 아트보드 절대 px(1440 컨텐츠 / 120px 대형 수치 / 카드 폭 672·466.67)는
// 저장소 정본 토큰(max-w-content 1100px, Pretendard, Tailwind 스케일)으로 환산해 적용했다.
//
// 데이터 계약:
//   - 집계·포맷은 전부 src/lib/admissionResults.js (순수 함수). 이 파일은 그리기만 한다.
//   - Q3(admission_results 통합 테이블 원본 행, recruitment_period='수시')는 조회 1회.
//     탭 전환은 클라이언트 필터이며 재요청하지 않는다(buildDetailModel 결과를 useMemo로 잡아 둔다).
//   - dev DB의 admission_results는 더미 시드 434행이 들어가 있다. 데이터가 전혀 없는
//     모집단위를 조회하면 빈 상태(DetailEmptyBlock)로 떨어진다.

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import Sparkline from '../../components/charts/Sparkline';
import { buildDetailModel, EMPTY_CELL, RESULT_YEARS } from '../../lib/admissionResults';
import { fetchSusiResultRows } from '../../lib/admissionResultsQueries';
import { CONTAINER } from './constants';
import { ErrorBlock, LoadingBlock } from './StateBlocks';

// 섹션 세로 리듬. SelfAssessment.jsx의 랜딩/서비스형 관례.
const SECTION_RHYTHM = 'pt-16 sm:pt-20 lg:pt-[6.25rem]';

// ---------------------------------------------------------------------------
// 요약 카드
// ---------------------------------------------------------------------------

function SummaryCard({ card }) {
  // length===1일 때 en dash 범위로 그리면 "2025–2025학년도"가 된다 — 같은 파일의
  // ReadingGuide(아래)는 이 분기를 이미 제대로 처리하고 있어 여기만 맞춘다.
  const yearsText =
    card.years.length === 0
      ? ''
      : card.years.length === 1
        ? `${card.years[0]}학년도`
        : `${card.years[0]}–${card.years[card.years.length - 1]}학년도`;

  return (
    <div className="flex h-full flex-col rounded-xl border border-[#d7d7d7] bg-[#fcfcfc] p-6 md:p-8">
      <p className="break-keep text-base font-semibold leading-[1.4] tracking-[-0.02em] text-[#013262]">
        {card.label}
      </p>

      <p className="mt-5 flex items-end gap-2">
        {/* 시안 대형 수치는 FreesentationVF 7 Bold 120px이지만 저장소에 그 폰트가 없다(명세 §4.2).
            Pretendard SemiBold로 대체하고 크기도 1100px 컨텐츠 폭에 맞춰 낮췄다. */}
        <span className="text-[3.5rem] font-semibold leading-none tracking-[-0.04em] text-[#013262] sm:text-[4.5rem]">
          {card.displayValue}
        </span>
        <span className="pb-1 text-xl font-medium tracking-[-0.02em] text-[#000000] sm:pb-2">
          등급
        </span>
      </p>

      {/* 표본 규모를 반드시 함께 노출한다 — 1건짜리 값을 평균처럼 읽는 사고를 막는다. */}
      <p className="mt-2 text-sm font-medium tracking-[-0.02em] text-[#8f8f8f]">
        {`표본 ${card.sampleN}건${yearsText ? ` · ${yearsText}` : ''}`}
      </p>

      <div className="mt-6">
        <Sparkline series={card.series} label={card.track} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 전형 카테고리 탭 (AcceptanceSection.jsx:69-113 패턴)
// ---------------------------------------------------------------------------

function CategoryTabs({ categories, activeKey, onSelect }) {
  return (
    // 전 구간 overflow-x-auto를 유지한다. sm에서 overflow-visible로 풀면 카테고리가 5종
    // (일반/추천형/농어촌/기회균형/논술)일 때 whitespace-nowrap 탭 행이 max-w-content 컨테이너를
    // 뚫고 나가 document 자체에 가로 스크롤이 생긴다(640~717px 구간, scrollWidth 718 > clientWidth).
    // 음수 마진/패딩 보정은 CONTAINER의 px-5 / sm:px-8과 짝을 맞춰 탭이 컨테이너 시각적 끝까지
    // 스크롤되게 한다 — 보정폭이 컨테이너 border box를 넘지 않으므로 문서 폭에는 영향이 없다.
    <div className="-mx-5 overflow-x-auto px-5 sm:-mx-8 sm:px-8 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div
        role="tablist"
        aria-label="전형 카테고리 선택"
        className="flex w-max items-center gap-6 sm:gap-10"
      >
        {categories.map((category, index) => {
          const isActive = category.key === activeKey;

          return (
            <div key={category.key} className="flex items-center gap-6 sm:gap-10">
              {index > 0 && <span aria-hidden="true" className="h-[1.875rem] w-px bg-[#d7d7d7]" />}
              <button
                type="button"
                role="tab"
                id={`admission-results-tab-${category.key}`}
                aria-selected={isActive}
                aria-controls="admission-results-panel"
                onClick={() => onSelect(category.key)}
                className={`relative whitespace-nowrap text-[1.5rem] leading-[1.3] tracking-[-0.03rem] transition-colors duration-200 [transition-timing-function:var(--ease-out-quart)] ${
                  isActive
                    ? 'font-semibold text-[#525252]'
                    : 'font-medium text-[#d7d7d7] hover:text-[#8a8a8a] focus-visible:text-[#8a8a8a]'
                }`}
              >
                {category.label}{' '}
                <span className={isActive ? 'text-[#013262]' : undefined}>{category.count}</span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 연도별 표
// ---------------------------------------------------------------------------

// 배지는 중심전형(main_track)을 줄여 쓴다 — 시안의 "교과" / "통합" 표기와 같은 자리.
function trackBadge(mainTrack) {
  const text = String(mainTrack ?? '').trim();
  if (!text) return '';
  return text.replace(/^학생부/, '');
}

function ResultTable({ tableRows, years, activeYear }) {
  return (
    <>
      <p className="mb-2 flex items-center gap-1 text-xs font-semibold text-[#8f8f8f] wide:hidden">
        좌우로 밀어 표를 확인하세요
        <ChevronRight className="h-3 w-3" />
      </p>

      <div className="ar-table-shell">
        <table className="ar-table">
          <thead>
            <tr>
              <th scope="col" className="ar-name-head">
                전형명
              </th>
              {years.map((year) => (
                <th
                  key={year}
                  scope="col"
                  className={year === activeYear ? 'ar-head-accent' : undefined}
                >
                  {year}
                </th>
              ))}
              <th scope="col" className="ar-head-accent">
                평균
              </th>
              <th scope="col" className="ar-quota-head">{`${activeYear} 모집`}</th>
              <th scope="col">{`${activeYear} 경쟁률`}</th>
            </tr>
          </thead>
          <tbody>
            {tableRows.map((row, index) => {
              const badge = trackBadge(row.mainTrack);

              return (
                <tr key={`${row.key || 'unnamed'}-${index}`}>
                  <th scope="row" className="ar-name-cell">
                    <span className="ar-name-group">
                      <span className="ar-name">{row.admissionType}</span>
                      {badge && <span className="ar-badge">{badge}</span>}
                    </span>
                  </th>
                  {row.cells.map((cell) => (
                    <td key={cell.year}>{cell.display}</td>
                  ))}
                  <td className="ar-cell-accent">{row.averageDisplay}</td>
                  <td>{row.activeQuotaDisplay}</td>
                  <td>{row.activeCompetitionRateDisplay}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// 읽는 법 + 출처 캡션
// ---------------------------------------------------------------------------

function ReadingGuide({ rowCount, dataYears }) {
  // 시안 캡션의 "총 84,067행" 같은 수치는 하드코딩하지 않는다(명세 §7.2).
  // 실제로 조회된 행 수와 실제로 존재하는 연도 범위만 적는다.
  const yearsText =
    dataYears.length === 0
      ? ''
      : dataYears.length === 1
        ? `${dataYears[0]}학년도`
        : `${dataYears[0]}–${dataYears[dataYears.length - 1]}학년도`;

  return (
    <div className="rounded-xl bg-[#f9f9f9] p-6 md:p-9">
      <h2 className="text-xl font-medium leading-[1.4] tracking-[-0.02em] text-[#000000]">
        👀 읽는 법
      </h2>

      <ul className="mt-6 space-y-2 break-keep text-base font-medium leading-[1.6] tracking-[-0.02em] text-[#525252]">
        <li>
          값이 비어 있는 칸(<span className="font-semibold text-[#af9364]">{EMPTY_CELL}</span>)은
          대학이 그해 등급을 공개하지 않았거나, 그해 해당 전형이 없었던 경우입니다.
        </li>
        <li>괄호 안 숫자(50 · 70)는 대학이 발표한 컷 기준(50%컷 / 70%컷)입니다.</li>
        <li>평균은 모집인원 가중평균입니다. 표본이 1개년뿐이면 평균으로 보지 마십시오.</li>
      </ul>

      <hr className="my-6 border-0 border-t border-[#bfbfbf]" />

      <p className="break-keep text-base font-normal leading-[1.6] tracking-[-0.02em] text-[#808080]">
        {yearsText &&
          `데이터: ${yearsText} 수시 입시결과 (대학 공표자료 재가공, 이 모집단위 ${rowCount}행). `}
        표시값은 최종등록자 교과등급으로, 50%컷을 우선 사용하고 없을 때 70%컷을 사용합니다. 본
        자료는 참고용이며 지원 결과를 보장하지 않습니다.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 빈 상태 (로딩/에러는 ./StateBlocks 공용 블록을 그대로 쓴다)
// ---------------------------------------------------------------------------

// StateBlocks.EmptyBlock을 쓰지 않는 이유: 상세 빈 상태만 "다른 모집단위 선택하기"
// 복귀 액션을 함께 그려야 하는데 공용 블록에는 액션 슬롯이 없다. 껍데기 클래스는 동일하다.
function DetailEmptyBlock({ onBack }) {
  return (
    <div className="rounded-2xl border border-[#e5e7eb] bg-[#f9fafb] py-16 text-center">
      <p className="break-keep text-lg font-semibold text-[#525252]">
        해당 모집단위의 입결 데이터가 없습니다.
      </p>
      <p className="mt-2 break-keep text-sm font-medium text-[#8f8f8f]">
        대학별 최종등록자 교과등급을 준비하고 있습니다.
      </p>
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="mt-4 rounded-full border border-[#d7d7d7] bg-white px-4 py-2 text-sm font-semibold text-[#525252] transition hover:border-[#0b84fd] hover:text-[#0b84fd]"
        >
          다른 모집단위 선택하기
        </button>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 상세 뷰
// ---------------------------------------------------------------------------

// props 계약:
//   universityKey / departmentKey : Q3 조회 키 (쿼리스트링 ?u=&d=)
//   rows        : 셸이 이미 Q3 결과를 갖고 있으면 넘긴다. undefined면 이 컴포넌트가 직접 조회한다
//                 (셸이 어떤 방식이든 붙을 수 있게 controlled / uncontrolled 양쪽을 지원).
//   loading / error / onRetry : rows를 넘길 때만 의미가 있다(controlled 모드).
//   universityName / departmentName : 로딩 중 히어로 h1에 쓸 폴백 라벨(선택).
//   onBack      : 빈 상태의 "다른 모집단위 선택하기" 핸들러(선택). 없으면 버튼을 그리지 않는다.
export default function DetailView({
  universityKey,
  departmentKey,
  rows,
  loading,
  error,
  onRetry,
  universityName,
  departmentName,
  onBack
}) {
  const controlled = rows !== undefined;

  const [ownRows, setOwnRows] = useState([]);
  const [ownLoading, setOwnLoading] = useState(false);
  const [ownError, setOwnError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (controlled) return undefined;

    let alive = true;

    async function loadRows() {
      if (!universityKey || !departmentKey) {
        setOwnRows([]);
        setOwnLoading(false);
        setOwnError(false);
        return;
      }

      setOwnLoading(true);
      setOwnError(false);

      const { data, error: fetchError } = await fetchSusiResultRows(universityKey, departmentKey);
      if (!alive) return;

      if (fetchError) {
        setOwnRows([]);
        setOwnError(true);
        setOwnLoading(false);
        return;
      }

      setOwnRows(data);
      setOwnLoading(false);
    }

    loadRows();

    return () => {
      alive = false;
    };
  }, [controlled, universityKey, departmentKey, reloadToken]);

  const effectiveRows = controlled ? rows : ownRows;
  const isLoading = controlled ? Boolean(loading) : ownLoading;
  const isError = controlled ? Boolean(error) : ownError;
  const handleRetry = controlled ? onRetry : () => setReloadToken((token) => token + 1);

  // 탭 전환은 이 모델을 클라이언트 필터하는 것뿐이다 — 재요청하지 않는다.
  const model = useMemo(() => buildDetailModel(effectiveRows), [effectiveRows]);

  const [activeKey, setActiveKey] = useState(null);

  useEffect(() => {
    setActiveKey((prev) =>
      model.categories.some((category) => category.key === prev) ? prev : model.initialCategoryKey
    );
  }, [model]);

  const activeCategory =
    model.categories.find((category) => category.key === activeKey) ?? model.categories[0] ?? null;

  const title =
    [model.universityName || universityName, model.departmentName || departmentName]
      .filter(Boolean)
      .join(' ') || '입결 상세';

  // 중심전형 요약 한 줄 — 시안 문구를 그대로 쓰지 않고 실제 데이터에서 뽑는다.
  // (시안의 "정규화키 경찰행정"은 내부 매칭 키라 사용자에게 노출하지 않는다.)
  const heroSummary = useMemo(() => {
    if (model.isEmpty) return '';

    const tracks = [];
    const types = new Set();
    const years = new Set();

    for (const row of effectiveRows ?? []) {
      const track = String(row.main_track ?? '').trim();
      if (track && !tracks.includes(track)) tracks.push(track);
      const type = String(row.admission_track ?? '').trim();
      if (type) types.add(type);
      if (row.result_year != null) years.add(Number(row.result_year));
    }

    const sortedYears = [...years].sort((a, b) => a - b);
    const parts = [];
    if (tracks.length > 0) parts.push(`중심전형 ${tracks.join(' · ')}`);
    if (types.size > 0) parts.push(`수록 전형 ${types.size}종`);
    if (sortedYears.length > 0) {
      parts.push(
        sortedYears.length === 1
          ? `수록 연도 ${sortedYears[0]}학년도`
          : `수록 연도 ${sortedYears[0]}–${sortedYears[sortedYears.length - 1]}학년도`
      );
    }

    return parts.join(' · ');
  }, [effectiveRows, model.isEmpty]);

  const dataYears = useMemo(() => {
    const years = new Set();
    for (const row of effectiveRows ?? []) {
      if (row.result_year != null) years.add(Number(row.result_year));
    }
    return [...years].sort((a, b) => a - b);
  }, [effectiveRows]);

  const activeYear = model.years[model.years.length - 1] ?? RESULT_YEARS[RESULT_YEARS.length - 1];

  return (
    <div>
      {/* 히어로 */}
      <section className={SECTION_RHYTHM} aria-labelledby="admission-results-detail-title">
        <div className={CONTAINER}>
          {/* 검색으로 돌아갈 수단을 히어로에 상시 노출한다(QA 결함 c) — 기존에는 데이터가
              없는 빈 상태(DetailEmptyBlock)에만 onBack이 연결돼 있어, 정상적으로 표가
              그려지는 화면에서는 브라우저 뒤로가기 말고는 인앱 복귀 수단이 없었다. */}
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-[#8f8f8f] transition hover:text-[#013262]"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              다른 모집단위 선택하기
            </button>
          ) : null}

          <p className="text-base font-medium leading-[1.3] tracking-[-0.02em] text-[#013262]">
            최종등록자 교과등급 · {model.years.length}개년
          </p>

          <h1
            id="admission-results-detail-title"
            className="mt-3 break-keep text-[2rem] font-semibold leading-tight tracking-[-0.03em] text-[#525252] md:text-[2.75rem]"
          >
            {title}
          </h1>

          {heroSummary && (
            <p className="mt-6 break-keep text-base font-medium leading-[1.6] text-[#7a7a7a]">
              {heroSummary}
            </p>
          )}
        </div>
      </section>

      {/* 본문 — 로딩 / 에러 / 빈 상태 / 정상 */}
      {isLoading || isError || model.isEmpty ? (
        <section className="pb-20 pt-10 sm:pb-24 sm:pt-12">
          <div className={CONTAINER}>
            {isLoading && <LoadingBlock />}
            {!isLoading && isError && <ErrorBlock onRetry={handleRetry} />}
            {!isLoading && !isError && model.isEmpty && <DetailEmptyBlock onBack={onBack} />}
          </div>
        </section>
      ) : (
        <>
          {/* 요약 카드 — 가중평균이 null인 track은 카드를 만들지 않는다(명세 §7.2) */}
          {model.trackSummaries.length > 0 && (
            <section className={SECTION_RHYTHM} aria-label="중심전형 요약">
              <div className={CONTAINER}>
                <div className="grid gap-6 lg:grid-cols-2 lg:gap-8">
                  {model.trackSummaries.map((card) => (
                    <SummaryCard key={card.track} card={card} />
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* 탭 + 표 */}
          {activeCategory && (
            <section className={SECTION_RHYTHM} aria-label="전형별 연도 등급">
              <div className={CONTAINER}>
                <CategoryTabs
                  categories={model.categories}
                  activeKey={activeCategory.key}
                  onSelect={setActiveKey}
                />

                <div
                  id="admission-results-panel"
                  role="tabpanel"
                  aria-labelledby={`admission-results-tab-${activeCategory.key}`}
                  className="mt-12"
                >
                  <ResultTable
                    tableRows={activeCategory.tableRows}
                    years={model.years}
                    activeYear={activeYear}
                  />
                </div>
              </div>
            </section>
          )}

          {/* 읽는 법 */}
          <section className="pb-20 pt-14 sm:pb-24">
            <div className={CONTAINER}>
              <ReadingGuide rowCount={model.rowCount} dataYears={dataYears} />
            </div>
          </section>
        </>
      )}

      {/* 페이지 전용 CSS — AdmissionGuidelines.jsx의 표 반응형 이원화 구조를 이식.
          wide(74rem) 미만: 카드형 + 가로 스크롤 + sticky 헤더/1열.
          wide 이상: 시안대로 flat 표(상·하단 검정 1px, 행 구분 #dfdfdf, 헤더 #f9fafb).
          lg(1024px)에서 전환하지 않는 이유는 tailwind.config.js screens.wide 주석 참고. */}
      <style>{`
        .ar-table-shell { width: 100%; overflow-x: auto; overflow-y: hidden; border: 1px solid #d7d7d7; border-radius: 1rem; background: #fff; box-shadow: 0 1.125rem 2.625rem rgba(16, 36, 62, 0.07); }
        .ar-table { width: max-content; min-width: 100%; border-collapse: separate; border-spacing: 0; background: #fff; font-size: 0.78125rem; line-height: 1.3; }
        .ar-table th,
        .ar-table td { border-right: 1px solid #d7d7d7; border-bottom: 1px solid #d7d7d7; padding: 0.5rem; vertical-align: middle; text-align: center; color: #525252; font-weight: 500; letter-spacing: -0.02em; white-space: nowrap; }
        .ar-table thead th { position: sticky; top: 0; z-index: 3; background: #013262; color: #fff; font-weight: 600; }
        .ar-name-head,
        .ar-name-cell { position: sticky; left: 0; z-index: 4; min-width: 9.5rem; max-width: 11rem; background: #ffffff; text-align: left; }
        /* .ar-table th,td (0,1,1)가 .ar-name-head/.ar-name-cell 단독(0,1,0)의 text-align:left를
           특이도로 이긴다. .ar-table을 붙여 특이도를 (0,2,0)으로 올려 별도 줄로 강제한다. */
        .ar-table .ar-name-head,
        .ar-table .ar-name-cell { text-align: left; }
        .ar-name-head { background: #013262 !important; color: #fff !important; }
        .ar-name-group { display: flex; flex-wrap: wrap; align-items: center; gap: 0.625rem; }
        .ar-name { color: #525252; word-break: keep-all; white-space: normal; }
        .ar-badge { display: inline-flex; flex-shrink: 0; align-items: center; justify-content: center; min-width: 2.625rem; height: 1.5rem; padding: 0 0.625rem; border-radius: 999px; background: #013262; color: #fff; font-size: 0.75rem; line-height: 1.3; font-weight: 500; white-space: nowrap; }

        @media (min-width: 74rem) {
          .ar-table-shell { overflow-x: visible; border: none; border-radius: 0; background: transparent; box-shadow: none; }
          .ar-table { width: 100%; min-width: 0; table-layout: fixed; border-collapse: collapse; font-size: 0.875rem; line-height: 1.4; border-bottom: 1px solid #000; }
          .ar-table th,
          .ar-table td { border-right: 0; border-bottom: 0; padding: 0 0.5rem; white-space: normal; }
          .ar-table thead th { position: static; top: auto; background: #f9fafb; color: #525252; font-weight: 500; border-top: 1px solid #000; height: 3.75rem; }
          .ar-table thead th.ar-name-head { background: #f9fafb !important; color: #525252 !important; width: 22%; }
          .ar-table thead th.ar-head-accent { color: #013262; }
          .ar-table thead th.ar-quota-head { width: 12.5%; }
          .ar-table tbody tr { border-top: 1px solid #dfdfdf; }
          .ar-table tbody td,
          .ar-table tbody th { height: 3.9375rem; }
          .ar-name-cell { position: static; min-width: 0; max-width: none; background: transparent; }
          .ar-cell-accent { color: #013262; }
        }
      `}</style>
    </div>
  );
}
