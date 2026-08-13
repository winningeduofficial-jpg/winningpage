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
//   - Q3(admission_results 원본 행)는 조회 1회. admission_results는 수시 전용 테이블이라
//     모집시기 축(recruitment_period)이 없다(§10.1 Q1 확정 — 컬럼째 삭제).
//     탭 전환은 클라이언트 필터이며 재요청하지 않는다(buildDetailModel 결과를 useMemo로 잡아 둔다).
//   - 연도 축은 2025·2026 2개년이다. 2점은 추세(trend)가 아니라 변화(change)이므로
//     "평균" 열/스파크라인 대신 Δ 전년대비 열과 GradeDelta 슬로프를 쓴다(명세 §8.3).

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import GradeDelta from "../../components/charts/GradeDelta";
import Sparkline from "../../components/charts/Sparkline";
import {
  buildDetailModel,
  CELL_STATE,
  DELTA_STATE,
  EMPTY_CELL,
  formatGradeValue,
  RESULT_YEARS,
  UNDISCLOSED_CELL,
} from "../../lib/admissionResults";
import { fetchSusiResultRows } from "../../lib/admissionResultsQueries";
import { CONTAINER } from "./constants";
import { ErrorBlock, LoadingBlock } from "./StateBlocks";

// 섹션 세로 리듬. SelfAssessment.jsx의 랜딩/서비스형 관례.
const SECTION_RHYTHM = "pt-16 sm:pt-20 lg:pt-[6.25rem]";

// 연도 축이 3개 이상으로 복원되면 슬로프 대신 Sparkline으로 되돌린다(명세 §8.3 마지막 줄).
// 이 상수 하나만 보고 분기하므로 축이 늘어나도 카드 코드는 손대지 않는다.
const SPARKLINE_MIN_YEARS = 3;

// Δ 톤 → 색. GradeDelta.jsx의 TONE 맵과 같은 값이지만, 그쪽은 배지 배경까지 함께 갖는
// 컴포넌트 로컬 토큰이고 여기는 표 셀 글자색만 필요해서 중복 선언하지 않고 따로 둔다.
// 두 번째·세 번째 사용처가 더 생기면 chartTheme.js 옆 공용 토큰으로 올린다.
const DELTA_TONE_COLOR = {
  up: "#013262",
  down: "#e5484d",
  flat: "#8f8f8f",
  muted: "#8f8f8f",
};

// ---------------------------------------------------------------------------
// 공용 셀 표기
// ---------------------------------------------------------------------------

// 등급 셀 한 칸. 결측은 2종으로 갈린다 — 그해 행 자체가 없으면 '-', 행은 있는데
// 대학이 등급을 안 냈으면 '미공개'(lib이 cell.state로 구분해 내려준다).
// 컷 라벨(50·70·85·90)은 값과 같은 덩어리가 아니라 작은 첨자로 떼어 놓는다 —
// 85/90은 2025 전용이라 두 연도의 컷이 다른 행이 눈에 띄어야 한다(§8.4).
function GradeCellValue({ cell }) {
  if (!cell || cell.state !== CELL_STATE.VALUE) {
    return (
      <span
        className={
          cell?.state === CELL_STATE.UNDISCLOSED
            ? "ar-undisclosed"
            : "ar-absent"
        }
      >
        {cell?.display ?? EMPTY_CELL}
      </span>
    );
  }

  return (
    <span className="ar-grade">
      {formatGradeValue(cell.value)}
      {cell.cut != null && <span className="ar-cut">{`(${cell.cut})`}</span>}
    </span>
  );
}

// ---------------------------------------------------------------------------
// 요약 카드
// ---------------------------------------------------------------------------

// 카드 부제 — 기준 연도 모집인원 / 경쟁률. 둘 다 없으면 줄 자체를 그리지 않는다.
function cardMetaText(card, activeYear) {
  const parts = [];
  if (card.activeQuotaDisplay !== EMPTY_CELL)
    parts.push(`${activeYear} ${card.activeQuotaDisplay}명 모집`);
  if (card.activeCompetitionRateDisplay !== EMPTY_CELL) {
    parts.push(`경쟁률 ${card.activeCompetitionRateDisplay}`);
  }
  return parts.join(" · ");
}

function SummaryCard({ card, axisYears, activeYear }) {
  // length===1일 때 en dash 범위로 그리면 "2025–2025학년도"가 된다 — 같은 파일의
  // ReadingGuide(아래)는 이 분기를 이미 제대로 처리하고 있어 여기만 맞춘다.
  const yearsText =
    card.years.length === 0
      ? ""
      : card.years.length === 1
        ? `${card.years[0]}학년도`
        : `${card.years[0]}–${card.years[card.years.length - 1]}학년도`;

  const meta = cardMetaText(card, activeYear);
  const soloYear = card.years.length === 1;

  // 축이 3개년 이상으로 복원되면 Sparkline. buildTrackSeries의 셀은 display 필드를 쓰는데
  // Sparkline 계약은 displayValue라서 그 경계에서만 이름을 맞춰 준다.
  const sparklineSeries = useMemo(
    () => card.series.map((cell) => ({ ...cell, displayValue: cell.display })),
    [card.series],
  );

  return (
    <div
      className={`flex h-full flex-col rounded-xl p-6 md:p-8 ${
        card.hasValue
          ? "border border-[#d7d7d7] bg-[#fcfcfc]"
          : "border border-dashed border-[#d7d7d7] bg-transparent"
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <p className="break-keep text-base font-semibold leading-[1.4] tracking-[-0.02em] text-[#013262]">
          {card.hasValue ? card.label : card.track}
        </p>
        {/* 산정 기준(basis) 표기. 중심전형 카드의 대표 등급은 전형유형을 전부 섞은 값이
            아니라 '일반' 행만(없으면 최다 유형만) 쓴 값이다 — 어느 기준인지 밝히지 않으면
            지역인재 평균을 일반 지원자 기준으로 오독한다(§5.3(f)). */}
        {card.basis && (
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold leading-[1.4] tracking-[-0.02em] ${
              card.isGeneralBasis
                ? "bg-[#eef2f8] text-[#013262]"
                : "bg-[#fdf3e4] text-[#8a6a1f]"
            }`}
          >
            {`${card.basis} 기준`}
          </span>
        )}
      </div>

      {card.hasValue ? (
        <>
          <p className="mt-5 flex items-end gap-2">
            {/* 시안 대형 수치는 FreesentationVF 7 Bold 120px이지만 저장소에 그 폰트가 없다(명세 §4.2).
                Pretendard SemiBold로 대체하고 크기도 1100px 컨텐츠 폭에 맞춰 낮췄다. */}
            <span className="text-[3.5rem] font-semibold leading-none tracking-[-0.04em] text-[#013262] sm:text-[4.5rem]">
              {card.displayValue}
            </span>
            <span className="pb-1 text-xl font-medium tracking-[-0.02em] text-[#000000] sm:pb-2">
              등급
            </span>
            {/* 대표 등급이 어느 컷에서 왔는지. cuts가 2종 이상 섞이면 그대로 병기한다. */}
            {card.cuts.length > 0 && (
              <span className="pb-2 text-sm font-medium tracking-[-0.02em] text-[#8f8f8f] sm:pb-3">
                {`${card.cuts.join("·")}%컷`}
              </span>
            )}
          </p>

          {/* 표본 규모를 반드시 함께 노출한다 — 1건짜리 값을 평균처럼 읽는 사고를 막는다. */}
          <p className="mt-2 text-sm font-medium tracking-[-0.02em] text-[#8f8f8f]">
            {`표본 ${card.sampleN}건${yearsText ? ` · ${yearsText}` : ""}`}
          </p>

          {/* 1개년 표본은 예외가 아니라 카드 grain 기준 38.1%다(§8.2) — 읽는 법 하단이 아니라
              카드 안 인라인 경고로 올린다. */}
          {soloYear && (
            <p className="mt-2 inline-flex w-fit items-center rounded-md bg-[#fdf3e4] px-2 py-1 text-xs font-semibold tracking-[-0.02em] text-[#8a6a1f]">
              표본 1개년 — 평균이 아니라 단일 관측값입니다
            </p>
          )}
        </>
      ) : (
        <>
          <p className="mt-5 text-[2rem] font-semibold leading-none tracking-[-0.03em] text-[#8f8f8f]">
            등급 미제공
          </p>
          {/* 카드를 통째로 지우면 "그 중심전형으로 모집은 하는데 등급만 없다"는 사실이
              화면에서 사라진다(HTML .card.void 403·407). 사유를 적어 남긴다. */}
          <p className="mt-3 break-keep text-sm font-medium leading-[1.6] tracking-[-0.02em] text-[#8f8f8f]">
            대학이 이 중심전형의 등급을 공개하지 않았습니다.
            {card.activeCompetitionRateDisplay !== EMPTY_CELL &&
              ` ${activeYear} 경쟁률 ${card.activeCompetitionRateDisplay}은 확인됩니다.`}
          </p>
        </>
      )}

      {meta && (
        <p className="mt-2 text-sm font-medium tracking-[-0.02em] text-[#8f8f8f]">
          {meta}
        </p>
      )}

      <div className="mt-6">
        {axisYears.length >= SPARKLINE_MIN_YEARS ? (
          <Sparkline series={sparklineSeries} label={card.track} />
        ) : (
          <GradeDelta
            series={card.series}
            delta={card.delta}
            label={card.track}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 전형 카테고리 탭 (AcceptanceSection.jsx:69-113 패턴)
// ---------------------------------------------------------------------------

// 축이 6종 → 11종이 되면서 구 레이아웃(1.5rem 텍스트 + 세로 구분선 + 가로 스크롤)은
// 모바일에서 화면 폭의 3~4배가 됐다(§5.3(e) R3). 칩 랩으로 바꿔 넘침 자체를 없앤다 —
// 가로 스크롤 탭은 뒤쪽 탭이 존재한다는 사실 자체가 보이지 않아 11종에서는 못 쓴다.
//
// 꼬리 4종(논술/실기/성인학습자/재외국민)을 `기타`로 접지 않는 이유: 접기 임계는 전체
// 분포 기준인데 이 화면은 모집단위 1개분 행만 받아 어느 유형이든 count가 한 자릿수다.
// 여기서 임계를 적용하면 논술·실기 탭이 항상 접힌다. 칩 랩이 이미 넘침을 해결하므로
// 접기의 원래 동기(레이아웃 압박)도 사라졌다.
function CategoryTabs({ categories, activeKey, onSelect }) {
  return (
    <div
      role="tablist"
      aria-label="전형 카테고리 선택"
      className="flex flex-wrap gap-2 sm:gap-3"
    >
      {categories.map((category) => {
        const isActive = category.key === activeKey;

        return (
          <button
            key={category.key}
            type="button"
            role="tab"
            id={`admission-results-tab-${category.key}`}
            aria-selected={isActive}
            aria-controls="admission-results-panel"
            onClick={() => onSelect(category.key)}
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-2 text-sm font-semibold leading-[1.3] tracking-[-0.02em] transition-colors duration-200 [transition-timing-function:var(--ease-out-quart)] sm:px-4 sm:text-base ${
              isActive
                ? "border-[#013262] bg-[#013262] text-white"
                : "border-[#d7d7d7] bg-white text-[#8f8f8f] hover:border-[#8a8a8a] hover:text-[#525252] focus-visible:border-[#8a8a8a] focus-visible:text-[#525252]"
            }`}
          >
            {category.label}
            <span className={isActive ? "text-white/70" : "text-[#b5b5b5]"}>
              {category.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 연도별 표 (6열: 전형명 | 2025 | 2026 | Δ 전년대비 | 2026 모집 | 2026 경쟁률)
// ---------------------------------------------------------------------------

// 배지는 중심전형(main_track)을 줄여 쓴다 — 시안의 "교과" / "통합" 표기와 같은 자리.
// main_track 저장값은 원문 4종(교과·종합·논술·실기, Q8)이라 strip은 사실상 no-op이지만
// 구 표기(`학생부교과`)가 섞여 들어와도 시안 표기로 수렴하도록 남긴다.
function trackBadge(mainTrack) {
  const text = String(mainTrack ?? "").trim();
  if (!text) return "";
  return text.replace(/^학생부/, "");
}

function ResultTable({ tableRows, years, activeYear }) {
  const shellRef = useRef(null);
  const [overflowing, setOverflowing] = useState(false);

  // 열이 8 → 6으로 줄면서 375px에서도 스크롤이 안 생기는 경우가 생겼다. 안내 문구를
  // 폭 미디어쿼리(wide:hidden)로 걸면 스크롤이 없는데도 "좌우로 미세요"라 말하는
  // 거짓 안내가 된다(§5.3(d) T5) → 실제 overflow를 재서 조건부로 그린다.
  // biome-ignore lint/correctness/useExhaustiveDependencies: tableRows/years는 effect 안에서 읽지 않는 트리거 전용 값 — 표 내용이 바뀌어 폭이 달라질 때마다 overflow를 다시 재기 위한 재실행 신호다.
  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return undefined;

    const measure = () =>
      setOverflowing(shell.scrollWidth > shell.clientWidth + 1);
    measure();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }

    const observer = new ResizeObserver(measure);
    observer.observe(shell);
    return () => observer.disconnect();
  }, [tableRows, years]);

  // 전형명 + 연도 N개 + Δ + 모집 + 경쟁률. 축이 바뀌어도 빈 상태 colspan이 따라간다
  // (HTML 원본은 6열인데 colspan="8"로 굳어 있다 — 재현하지 않는다).
  const columnCount = years.length + 4;

  return (
    <>
      {overflowing && (
        <p className="mb-2 flex items-center gap-1 text-xs font-semibold text-[#8f8f8f]">
          좌우로 밀어 표를 확인하세요
          <ChevronRight className="h-3 w-3" />
        </p>
      )}

      <div ref={shellRef} className="ar-table-shell">
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
                  className={year === activeYear ? "ar-head-accent" : undefined}
                >
                  {year}
                </th>
              ))}
              <th scope="col" className="ar-delta-head">
                Δ 전년대비
              </th>
              <th
                scope="col"
                className="ar-quota-head"
              >{`${activeYear} 모집`}</th>
              <th
                scope="col"
                className="ar-rate-head"
              >{`${activeYear} 경쟁률`}</th>
            </tr>
          </thead>
          <tbody>
            {tableRows.length === 0 ? (
              <tr>
                <td className="ar-empty-cell" colSpan={columnCount}>
                  해당 전형 데이터가 없습니다.
                </td>
              </tr>
            ) : (
              tableRows.map((row, index) => {
                const badge = trackBadge(row.mainTrack);
                const { delta } = row;

                return (
                  <tr key={`${row.key || "unnamed"}-${index}`}>
                    <th scope="row" className="ar-name-cell">
                      <span className="ar-name-group">
                        <span className="ar-name">{row.admissionType}</span>
                        {badge && <span className="ar-badge">{badge}</span>}
                      </span>
                    </th>
                    {row.cells.map((cell) => (
                      <td key={cell.year}>
                        <GradeCellValue cell={cell} />
                      </td>
                    ))}
                    {/* Δ는 구 "평균" 열 자리다. 2개년에서 평균은 옆 두 칸의 재계산이라
                        정보량이 0이고 컷 혼합이라 의미도 불명이었다(§8.3). */}
                    <td
                      className="ar-delta-cell"
                      style={{
                        color: DELTA_TONE_COLOR[delta.tone] ?? "#525252",
                      }}
                    >
                      {delta.display}
                      {delta.state === DELTA_STATE.CUT_MISMATCH && (
                        <>
                          <span aria-hidden="true" className="ar-cut">
                            *
                          </span>
                          <span className="sr-only">{delta.note}</span>
                        </>
                      )}
                    </td>
                    <td>{row.activeQuotaDisplay}</td>
                    <td>{row.activeCompetitionRateDisplay}</td>
                  </tr>
                );
              })
            )}
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
      ? ""
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
          <span className="font-semibold text-[#013262]">
            등급은 수치가 낮을수록 상위
          </span>
          입니다. 그래서 2026 등급이 2025보다 작아지면 &ldquo;성적
          상승&rdquo;입니다.
        </li>
        <li>
          <span className="font-semibold text-[#013262]">Δ 전년대비</span>는
          2026 등급에서 2025 등급을 뺀 변화량입니다.{" "}
          <span className="font-semibold text-[#013262]">▼</span>는 등급이
          낮아진 것(성적 상승),{" "}
          <span className="font-semibold text-[#e5484d]">▲</span>는 높아진
          것(성적 하락), <span className="font-semibold text-[#8f8f8f]">—</span>
          는 변동 없음입니다.
        </li>
        <li>
          Δ 칸의 <span className="font-semibold text-[#af9364]">신규</span>는
          2026에만 수록된 전형이고,{" "}
          <span className="font-semibold text-[#af9364]">{EMPTY_CELL}</span>는
          두 해를 맞대어 볼 수 없는 경우(비교 불가)입니다.
        </li>
        <li>
          Δ 옆의 <span className="font-semibold text-[#af9364]">*</span>는 두
          해의 컷 기준이 서로 다르다는 표시입니다(예: 2025는 70%컷, 2026은
          50%컷). 변화량은 계산했지만 그대로 비교하기 어렵습니다.
        </li>
        <li>
          등급 칸의{" "}
          <span className="font-semibold text-[#af9364]">{EMPTY_CELL}</span>는
          그해 해당 전형이 없었던 경우이고,{" "}
          <span className="font-semibold text-[#af9364]">
            {UNDISCLOSED_CELL}
          </span>
          는 전형은 있었으나 대학이 등급을 공개하지 않은 경우입니다.
        </li>
        <li>
          괄호 안 숫자(50 · 70 · 85 · 90)는 대학이 발표한 컷 기준(%컷)입니다.
          일부 대학은 최종등록자가 아닌 합격자·최초합격자 기준 등급만 공개하며,
          그 값은 이 화면에 섞지 않습니다.
        </li>
        <li>
          중심전형 카드의 대표 등급은{" "}
          <span className="font-semibold text-[#013262]">일반 전형</span>{" "}
          행만으로 계산합니다. 일반 전형이 없으면 모집인원이 가장 많은
          전형유형으로 계산하고, 카드에 그 기준을 함께 적습니다.
        </li>
      </ul>

      <hr className="my-6 border-0 border-t border-[#bfbfbf]" />

      <p className="break-keep text-base font-normal leading-[1.6] tracking-[-0.02em] text-[#808080]">
        {yearsText &&
          `데이터: ${yearsText} 수시 입시결과 (대학 공표자료 재가공, 이 모집단위 ${rowCount}행). `}
        표시값은 최종등록자 교과등급으로, 50%컷을 우선 사용하고 없을 때 70 · 85
        · 90%컷 순으로 사용합니다. 모집인원은 분할모집 행의 합계, 경쟁률은 해당
        연도 행의 평균이며 경쟁률 0은 미보고로 보아 표기하지 않습니다. 본 자료는
        참고용이며 지원 결과를 보장하지 않습니다.
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
  onBack,
}) {
  const controlled = rows !== undefined;

  const [ownRows, setOwnRows] = useState([]);
  const [ownLoading, setOwnLoading] = useState(false);
  const [ownError, setOwnError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadToken은 effect 안에서 읽지 않는 재조회 트리거 전용 카운터다.
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

      const { data, error: fetchError } = await fetchSusiResultRows(
        universityKey,
        departmentKey,
      );
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
  const handleRetry = controlled
    ? onRetry
    : () => setReloadToken((token) => token + 1);

  // 탭 전환은 이 모델을 클라이언트 필터하는 것뿐이다 — 재요청하지 않는다.
  const model = useMemo(() => buildDetailModel(effectiveRows), [effectiveRows]);

  const [activeKey, setActiveKey] = useState(null);

  useEffect(() => {
    setActiveKey((prev) =>
      model.categories.some((category) => category.key === prev)
        ? prev
        : model.initialCategoryKey,
    );
  }, [model]);

  const activeCategory =
    model.categories.find((category) => category.key === activeKey) ??
    model.categories[0] ??
    null;

  const title =
    [
      model.universityName || universityName,
      model.departmentName || departmentName,
    ]
      .filter(Boolean)
      .join(" ") || "입결 상세";

  // 중심전형 요약 한 줄 — 시안 문구를 그대로 쓰지 않고 실제 데이터에서 뽑는다.
  // (시안의 "정규화키 경찰행정"은 내부 매칭 키라 사용자에게 노출하지 않는다.)
  const heroSummary = useMemo(() => {
    if (model.isEmpty) return "";

    const tracks = [];
    const types = new Set();

    for (const row of effectiveRows ?? []) {
      const track = String(row.main_track ?? "").trim();
      if (track && !tracks.includes(track)) tracks.push(track);
      const type = String(row.admission_track ?? "").trim();
      if (type) types.add(type);
    }

    const parts = [];
    if (tracks.length > 0) parts.push(`중심전형 ${tracks.join(" · ")}`);
    if (types.size > 0) parts.push(`수록 전형 ${types.size}종`);
    if (model.observedYears.length > 0) {
      parts.push(
        model.observedYears.length === 1
          ? `수록 연도 ${model.observedYears[0]}학년도`
          : `수록 연도 ${model.observedYears[0]}–${model.observedYears[model.observedYears.length - 1]}학년도`,
      );
    }

    return parts.join(" · ");
  }, [effectiveRows, model.isEmpty, model.observedYears]);

  const activeYear =
    model.years[model.years.length - 1] ??
    RESULT_YEARS[RESULT_YEARS.length - 1];

  // "N개년"은 축 상수(model.years)가 아니라 실제로 행이 있는 연도(observedYears)로 센다 —
  // 2025뿐인 모집단위에서 "2개년"이라 쓰면 거짓이다(§5.3(b) C3).
  const observedYears = model.observedYears;

  return (
    <div>
      {/* 히어로 */}
      <section
        className={SECTION_RHYTHM}
        aria-labelledby="admission-results-detail-title"
      >
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
            최종등록자 교과등급 · {observedYears.length}개년
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
            {!isLoading && !isError && model.isEmpty && (
              <DetailEmptyBlock onBack={onBack} />
            )}
          </div>
        </section>
      ) : (
        <>
          {/* 요약 카드 — 등급이 없는 중심전형도 사유와 함께 그린다(hasValue=false) */}
          {model.trackSummaries.length > 0 && (
            <section className={SECTION_RHYTHM} aria-label="중심전형 요약">
              <div className={CONTAINER}>
                {/* limit 4(Q7)라 2×2 그리드. 카드 높이가 슬로프 전환으로 낮아져(§8.5 M6)
                    sm부터 2열로 올려도 세로가 길어지지 않는다. */}
                <div className="grid gap-6 sm:grid-cols-2 lg:gap-8">
                  {model.trackSummaries.map((card) => (
                    <SummaryCard
                      key={card.track}
                      card={card}
                      axisYears={model.years}
                      activeYear={activeYear}
                    />
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
                  className="mt-10"
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
              <ReadingGuide
                rowCount={model.rowCount}
                dataYears={observedYears}
              />
            </div>
          </section>
        </>
      )}

      {/* 페이지 전용 CSS — AdmissionGuidelines.jsx의 표 반응형 이원화 구조를 이식.
          wide(74rem) 미만: 카드형 + 가로 스크롤 + sticky 헤더/1열.
          wide 이상: 시안대로 flat 표(상·하단 검정 1px, 행 구분 #dfdfdf, 헤더 #f9fafb).
          lg(1024px)에서 전환하지 않는 이유는 tailwind.config.js screens.wide 주석 참고.
          열 폭은 6열(전형명 · 2025 · 2026 · Δ · 모집 · 경쟁률) 기준 재배분이다 —
          Δ 셀은 "▼0.43*" 7자라 좁게, 대신 연도 열을 넓혔다(§8.5 M2). */}
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
        /* 등급 수치는 자릿수가 흔들리지 않게 tabular-nums. 컷 라벨은 값과 같은 덩어리로
           읽히지 않도록 한 단계 작고 흐리게 뗀다. */
        .ar-grade { font-variant-numeric: tabular-nums; }
        .ar-cut { margin-left: 0.1875rem; font-size: 0.6875rem; font-weight: 500; color: #8f8f8f; }
        .ar-undisclosed { color: #af9364; }
        .ar-absent { color: #b5b5b5; }
        .ar-delta-cell { font-weight: 600; font-variant-numeric: tabular-nums; }
        .ar-empty-cell { padding: 2.5rem 0.5rem; color: #8f8f8f; }

        @media (min-width: 74rem) {
          .ar-table-shell { overflow-x: visible; border: none; border-radius: 0; background: transparent; box-shadow: none; }
          .ar-table { width: 100%; min-width: 0; table-layout: fixed; border-collapse: collapse; font-size: 0.875rem; line-height: 1.4; border-bottom: 1px solid #000; }
          .ar-table th,
          .ar-table td { border-right: 0; border-bottom: 0; padding: 0 0.5rem; white-space: normal; }
          .ar-table thead th { position: static; top: auto; background: #f9fafb; color: #525252; font-weight: 500; border-top: 1px solid #000; height: 3.75rem; }
          .ar-table thead th.ar-name-head { background: #f9fafb !important; color: #525252 !important; width: 30%; }
          .ar-table thead th.ar-head-accent { color: #013262; }
          .ar-table thead th.ar-delta-head { width: 13%; color: #013262; }
          .ar-table thead th.ar-quota-head { width: 12%; }
          .ar-table thead th.ar-rate-head { width: 13%; }
          .ar-table tbody tr { border-top: 1px solid #dfdfdf; }
          .ar-table tbody td,
          .ar-table tbody th { height: 3.9375rem; }
          .ar-name-cell { position: static; min-width: 0; max-width: none; background: transparent; }
        }
      `}</style>
    </div>
  );
}
