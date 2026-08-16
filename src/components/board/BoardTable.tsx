import { Link } from "react-router";

import Chip from "../Chip";

/**
 * 게시판(회사소식·공지사항) 공통 표 — 번호 / 제목 / 조회수 / 작성일 4컬럼.
 *
 * **순수 프레젠테이션 컴포넌트다. supabase 를 직접 부르지 않는다.**
 * 데이터·번호 채번·날짜 포맷·조회수 판독은 전부 `src/pages/board/boardData.js` 가 소유하고,
 * 이 컴포넌트는 부모(BoardListPage)가 바인딩해 넘겨준 함수만 호출한다.
 *
 * 빈 배열(rows=[])이 오면 **헤더만 렌더한다.** "등록된 글이 없습니다" 같은 빈 상태 문구는
 * 상위(BoardListPage)의 책임이다 — 이 컴포넌트는 표 골격만 그린다.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 시안 근거 (Figma 회사소식 2235:3536 / 공지사항 1882:20932, 1920 기준 ×0.766 환산)
 *
 *   표 그룹 실폭 1440 × 0.766 = 1103 ≈ max-w-content 안쪽 실폭 1100px → 컨테이너 토큰과 일치.
 *   따라서 표는 고정폭을 갖지 않고 `width: 100%` 로 컨테이너를 채운다.
 *
 *   컬럼 경계(패딩 포함, 1440 기준): 번호 0–154 / 제목 154–1039 / 조회수 1039–1267 / 작성일 1267–1440
 *   → 백분율 10.7 / 61.5 / 15.8 / 12 (`.board-col-*` 의 74rem 이상 값).
 *   헤더 밴드 64 × 0.766 = 49 → 3.0625rem, 데이터 행 61 × 0.766 = 46.7 → 2.9375rem.
 *   시안의 11번째 행만 57px 인 것은 시안 오차로 판정하고 전 행 균일 처리한다.
 *
 *   선: 표 최상단만 #000 1px, 헤더 하단과 행 사이는 전부 #D7D7D7.
 *   (#D9D9D9 는 serviceTokens.js:11-15 에서 폐기 선언된 값이라 쓰지 않는다.)
 *
 *   중요 칩 48×28 / radius 10 / Pretendard Medium 14px / line-height 1.4 /
 *   bg Indicator/Red-Light #FFD9D9 / text Indicator/Red #991E1E (Figma 2235:3741·2235:3742).
 *   이 실측값은 공통 칩 컴포넌트의 `tone="red"` / `size="md-fixed"` 토큰으로 이관했다
 *   (src/components/Chip.jsx). 색 hex 와 치수의 정의처는 이제 그 파일 한 곳뿐이다.
 *   Tailwind JIT 가 템플릿 리터럴 클래스를 조용히 날리는 함정(serviceTokens.js:6-9)을 피해
 *   색은 여전히 `style={{}}` 인라인이다(Chip 내부).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 반응형 — 시안이 없어 전량 설계다 (설계 결정 D9)
 *
 *   Figma 페이지 1479:4673 에 375/390/768/1024 폭의 게시판 변형 프레임이 0개이고,
 *   저장소의 표 반응형 선례 2건(AdmissionGuidelines `.admission-directory-*`,
 *   admissionResults/DetailView `.ar-table-*`)은 둘 다 "가로 스크롤 + sticky 1열" 이다.
 *   그 패턴은 8컬럼 자료표용이다. 게시판은 4컬럼뿐이고 최소 폭이 충분히 좁아,
 *   **가로 스크롤 없이 컬럼 우선순위 드롭**으로 접는 편이 낫다.
 *
 *   컬럼 우선순위: 제목 > 작성일 > 번호 > 조회수.
 *     - 제목은 유일한 필수 정보이자 클릭 대상.
 *     - 작성일은 행마다 값이 다른 유일한 메타(스캔 기준점).
 *     - 번호는 위치 표시일 뿐 영구 식별자가 아니다(영구 식별은 상세 링크의 `?id=`).
 *     - 조회수는 정보 가치가 가장 낮아 가장 먼저 접힌다. 단 **접히는 기준은 뷰포트뿐이다** —
 *       값의 유무로는 절대 접지 않는다(아래 "조회수 컬럼은 무조건 렌더한다" 항 참조).
 *
 *   | 뷰포트                | 컬럼                          | 비고                          |
 *   |----------------------|-------------------------------|-------------------------------|
 *   | < 40rem (640)        | 제목 + 작성일                  | 중요 칩은 제목 앞 inline 으로 이동 |
 *   | 40rem ~ 47.99rem     | 번호 + 제목 + 작성일            | 칩이 번호 자리로 복귀           |
 *   | >= 48rem (768)       | 4컬럼 전부                     | 폭 배분은 여유 기준             |
 *   | >= 74rem (wide)      | 4컬럼, 시안 실측 비율 그대로     | max-w-content 가 온전히 확보됨   |
 *
 *   ★ 기본안(`wide`부터 4컬럼)에서 조회수 노출을 48rem 으로 앞당긴 이유:
 *     tailwind.config.js:32-37 의 `wide`(74rem) 경고는 "내부가 1100px 를 **고정으로** 요구하는
 *     데스크톱 그리드"에 대한 것이다. 이 표는 `width:100%` + `table-layout:fixed` + % 컬럼이라
 *     컨테이너를 따라 유동하므로 그 함정에 해당하지 않는다. 조회수를 74rem 까지 미루면
 *     1024~1183px 구간(아이패드 가로·13인치 노트북 다수)에서 960px 를 쓰고도 컬럼 하나가
 *     비어 보인다. 대신 **시안 실측 비율은 그대로 74rem 에 게이트**해 1100px 가 실제로
 *     확보되는 구간에서만 시안과 픽셀이 맞도록 했다.
 *
 *   지킨 제약:
 *     - 페이지 body 에 가로 스크롤을 만들지 않는다. `table-layout:fixed` + % 폭이라 구조적으로
 *       넘칠 수 없고, `.board-table-shell` 의 overflow-x:auto 는 예상 밖 콘텐츠에 대한 안전망이다.
 *     - 컬럼을 감출 때 `<th>` 와 `<td>` 를 **같은 클래스로 쌍으로** 감춘다(`display:none`).
 *       한쪽만 감추면 열 개수가 어긋나 스크린리더의 열 연관이 깨진다.
 *     - 터치 타깃: 행 높이가 < 48rem 에서 3.25rem(52px), 이상에서 2.9375rem(47px) — 둘 다 44px 초과.
 *     - truncate 는 flex 가 아니라 table-cell 위에서 동작시킨다. 제목 셀 안쪽 flex 래퍼에는
 *       `min-width:0` 을 명시했다(CompanyNews.jsx:676-679 의 전역 가로스크롤 사고 재발 방지).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 행 전체 클릭 — a 중첩 없이
 *
 *   제목 `<Link>` 하나만 두고 그 `::after` 를 `position:absolute; inset:0` 으로 펼쳐
 *   행 전체를 덮는다. 담는 블록은 `.board-row`(= `<tr>`)의 `position: relative` 다.
 *   앵커가 문서에 하나뿐이므로 a-in-a 가 원천적으로 불가능하고, 탭 스톱도 행당 1개로 유지된다.
 *   ⚠ `<tr>` 의 relative 는 CSS 2.1 에서 "undefined" 였다가 CSS Position 3 에서 정의된
 *     동작이다. 현행 Chrome/Firefox/Safari 는 모두 지원하지만, 표 클릭 영역은 실제 브라우저
 *     QA 항목으로 남긴다(구형 엔진에서 오작동하면 담는 블록이 shell 로 올라가 마지막 행
 *     링크가 표 전체를 덮는 형태로 깨진다).
 *
 * 클래스 프리픽스는 `.board-*` 로 새로 잡아 `.admission-*` / `.ar-*` 와의 특이도 충돌을 피한다.
 * 페이지 전용 CSS 를 JSX 끝 `<style>` 블록에 두는 것은 저장소 관례(AdmissionResults.jsx:268).
 * 블록 내부 값도 전부 rem 이다(구 `.admission-table-wrap` 계열의 px 는 따라하지 않는다).
 */

/**
 * 게시판 중요 칩 = 공통 Chip 의 `tone="red"`(Indicator/Red-Light 배경 + Indicator/Red 텍스트,
 * Figma 2235:3741 / 2235:3742, 대비 약 5.9:1 로 **WCAG AA 통과**).
 *
 * ⚠ 한때 이 칩에 #FFC4C4 / #FF7373 이 들어가 있었는데, 그것은 랜딩 소식 섹션의 **카테고리 배지**
 *   색(NewsSection.jsx, Figma 1907:14893 → Chip tone="coral")을 잘못 가져온 것이다.
 *   "대비 1.75:1 이지만 사용자 지시로 원값 확정" 이라는 이력도 그 랜딩 배지에 한정된 것이고
 *   이 칩과는 무관하다. 두 tone 은 별개 물건이니 한쪽 값을 다른 쪽에 복사하지 말 것.
 *   (경고 원문과 실제 hex 는 src/components/Chip.jsx 에 있다.)
 */
const PINNED_CHIP_TONE = "red";

const PINNED_CHIP_LABEL = "중요";

/** 조회수 없음 표시. 값이 0 인 것과 값 자체가 없는 것을 구분한다.
 *  sql/50_board_renewal.sql 미적용 구간(view_count 컬럼 부재)에서만 보인다. */
const EMPTY_VIEW_COUNT = "-";

/**
 * formatDate 미주입 시의 최소 폴백. boardData.formatBoardDate 의 파싱 불가 분기와 같은 모양이다.
 * (boardData 를 여기서 import 하지 않는 이유: 그러면 이 컴포넌트가 supabase 모듈 그래프에
 *  묶여 "순수 프레젠테이션" 계약이 문서상으로만 남는다.)
 */
function defaultFormatDate(value: unknown) {
  return value ? String(value).slice(0, 10) : "";
}

type BoardRow = {
  id?: string | number;
  is_pinned?: boolean;
  title?: string;
  created_at?: string;
  view_count?: number;
  [key: string]: unknown;
};

/** getViewCount 미주입 시의 최소 폴백. boardData.getViewCount 와 동일 판정. */
function defaultGetViewCount(row: BoardRow) {
  return Number.isFinite(row?.view_count) ? (row.view_count as number) : null;
}

function PinnedChip({ className = "" }: { className?: string }) {
  return (
    <Chip tone={PINNED_CHIP_TONE} size="md-fixed" className={className}>
      {PINNED_CHIP_LABEL}
    </Chip>
  );
}

type BoardTableProps = {
  /** **현재 페이지에 표시할 행만** 넘긴다(= paginate() 의 pageRows). raw supabase row 그대로. */
  rows: BoardRow[];
  /** 상세 링크 경로. null 을 반환하면 제목이 클릭 불가 텍스트로 렌더된다. */
  getDetailHref?: (row: BoardRow) => string | null;
  /** 표시 번호. **인자는 이 페이지 안에서의 0-based 인덱스다.**
   * boardData.getDisplayNumber 는 "필터 결과 배열" 기준 인덱스를 받으므로, 부모가
   * `(row, i) => getDisplayNumber(row, (safePage - 1) * BOARD_PAGE_SIZE + i, filtered.length)`
   * 형태로 감싸서 넘겨야 한다. null 이면 번호를 렌더하지 않는다. */
  getDisplayNumber?: (row: BoardRow, indexInPage: number) => number | null;
  /** 기본값은 앞 10자 슬라이스. */
  formatDate?: (value: unknown) => string;
  /** 기본값은 row.view_count 유한수 판정. null 이면 셀에 '-' 가 들어갈 뿐, 컬럼은 유지된다. */
  getViewCount?: (row: BoardRow) => number | null;
  /** 스크린리더용 표 설명. 예: '회사소식 목록'. 시각적으로는 숨겨진다. */
  caption?: string;
  /** shell 에 덧붙일 유틸리티 클래스. */
  className?: string;
};

export default function BoardTable({
  rows,
  getDetailHref,
  getDisplayNumber,
  formatDate = defaultFormatDate,
  getViewCount = defaultGetViewCount,
  caption,
  className = "",
}: BoardTableProps) {
  const list = Array.isArray(rows) ? rows : [];

  // ★ 조회수 컬럼은 **데이터와 무관하게 무조건 렌더한다.** 시안(Figma 2235:3618)에 조회수
  //   컬럼이 항상 존재하기 때문이고, 조건부 렌더가 만들던 사고를 원인째 없애기 위해서다.
  //
  //   과거에는 ColumnList.jsx:39 의 hasViewCounts 계약(전 행이 null 이면 의미 없는 '-' 열을
  //   보여주는 대신 컬럼째 숨긴다)을 따라 `showViewCount` prop / `board-table--no-views`
  //   클래스로 3컬럼 분기를 뒀었다. 그 결과가 두 건의 실제 결함이었다.
  //     1) 판정 모집단이 rows(= 현재 페이지)라 검색 결과가 0건이 되는 순간 헤더가 3→4컬럼으로
  //        바뀌는 것을 사용자가 목격했다. 판정을 부모로 올려 완화했지만 근본 원인은 남았다.
  //     2) 로딩(rows=[]) → 도착 사이에 컬럼 수가 흔들려 표 폭이 점프했다.
  //   컬럼 유무를 런타임 데이터에 의존시키는 설계 자체가 원인이었으므로 분기를 걷어냈다.
  //   sql/50_board_renewal.sql 미적용 구간처럼 값이 없는 행은 셀에 EMPTY_VIEW_COUNT('-')만
  //   찍힌다 — 컬럼 골격은 어떤 상태에서도 고정이다.
  //   (뷰포트에 따른 접기는 별개다. 그쪽은 아래 미디어쿼리가 담당한다.)

  return (
    <>
      <div className={`board-table-shell ${className}`.trim()}>
        <table className="board-table">
          {caption ? <caption className="sr-only">{caption}</caption> : null}

          <thead>
            <tr>
              <th scope="col" className="board-col-no">
                번호
              </th>
              <th scope="col" className="board-col-title">
                제목
              </th>
              <th scope="col" className="board-col-views">
                조회수
              </th>
              <th scope="col" className="board-col-date">
                작성일
              </th>
            </tr>
          </thead>

          <tbody>
            {list.map((row, index) => {
              const isPinned = row?.is_pinned === true;
              const displayNumber = getDisplayNumber
                ? getDisplayNumber(row, index)
                : null;
              const href = getDetailHref ? getDetailHref(row) : null;
              const title = String(row?.title ?? "");
              const viewCount = getViewCount(row);

              return (
                <tr key={row?.id ?? index} className="board-row">
                  {/* 중요 행은 번호 대신 칩이 자리를 대체한다(설계 결정 D4).
                      번호 컬럼이 사라지는 < 40rem 에서는 아래 제목 셀의 inline 칩이 대신 뜬다. */}
                  <td className="board-col-no">
                    {isPinned ? <PinnedChip /> : displayNumber}
                  </td>

                  {/* 제목이 행의 머리다 — th scope="row" 로 두면 스크린리더가 조회수/작성일 셀을
                      읽을 때 어느 글의 값인지 함께 announce 한다. */}
                  <th scope="row" className="board-col-title">
                    <span className="board-title-line">
                      {isPinned ? (
                        <PinnedChip className="board-chip--inline" />
                      ) : null}
                      {href ? (
                        <Link
                          to={href}
                          title={title}
                          className="board-title-link"
                        >
                          {title}
                        </Link>
                      ) : (
                        <span title={title} className="board-title-text">
                          {title}
                        </span>
                      )}
                    </span>
                  </th>

                  <td className="board-col-views">
                    {viewCount === null
                      ? EMPTY_VIEW_COUNT
                      : viewCount.toLocaleString("ko-KR")}
                  </td>

                  <td className="board-col-date">
                    {formatDate(row?.created_at)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <style>{`
        /* 넘칠 수 없는 구조지만(fixed + % 폭) 예상 밖 콘텐츠에 대한 안전망.
           overflow-y:hidden 을 명시해 auto 가 세로로 전파되며 포커스 링을 자르는 것을 막는다. */
        .board-table-shell { width: 100%; overflow-x: auto; overflow-y: hidden; }

        .board-table {
          width: 100%;
          table-layout: fixed;
          border-collapse: collapse;
          background: #fff;
          color: #525252;
          letter-spacing: -0.02em;
        }

        .board-table th,
        .board-table td { padding: 0; vertical-align: middle; }

        /* 표 최상단 #000 1px 은 시안 그대로. 나머지 가로선은 전부 #D7D7D7. */
        .board-table thead th {
          height: 3.0625rem;
          border-top: 0.0625rem solid #000;
          border-bottom: 0.0625rem solid #D7D7D7;
          font-size: 1rem;
          font-weight: 500;
          line-height: 1.4;
          color: #525252;
        }

        .board-table tbody td,
        .board-table tbody th {
          height: 3.25rem;
          border-bottom: 0.0625rem solid #D7D7D7;
          font-size: 0.9375rem;
          font-weight: 400;
          line-height: 1.4;
        }

        /* ── 컬럼 폭·정렬·노출 ──────────────────────────────────────────────
           th 와 td 가 같은 클래스를 공유하므로 display:none 이 항상 쌍으로 적용된다.
           네 컬럼 모두 항상 마크업에 존재하므로, 아래 미디어쿼리의 폭 합은 각 구간에서
           "그 구간에 보이는 컬럼들"만으로 100% 가 된다. */

        /* 번호는 헤더·번호·중요 칩까지 컬럼 안에서 가로 중앙정렬한다(사용자 지시).
           그래서 좌측 패딩을 두지 않는다 — 남기면 중앙이 그만큼 오른쪽으로 밀린다.
           ★ 이 규칙은 번호 컬럼이 실제로 보이는 >= 40rem 경로에만 영향을 준다. 그 아래에서
             칩은 이 셀이 아니라 제목 셀의 .board-chip--inline 으로 렌더되고, 거기서는
             제목과 함께 좌측에서 흐르는 것이 맞다(.board-col-title 은 left 유지). */
        .board-col-no {
          display: none;
          width: 12%;
          text-align: center;
          white-space: nowrap;
        }
        .board-col-title {
          width: 72%;
          padding-right: 0.75rem;
          text-align: left;
        }
        .board-col-views {
          display: none;
          width: 15%;
          text-align: center;
          white-space: nowrap;
        }
        .board-col-date {
          width: 28%;
          padding: 0 0.25rem;
          text-align: center;
          white-space: nowrap;
        }

        /* 40rem — 번호 등장. 제목이 첫 컬럼 자리를 번호에 넘긴다. */
        @media (min-width: 40rem) {
          .board-col-no { display: table-cell; }
          .board-col-title { width: 60%; padding-right: 1rem; }
          .board-col-date { width: 28%; }
        }

        /* 48rem — 조회수 등장. 시안 비율보다 작성일에 여유를 더 준다(좁은 폭에서 날짜가
           10자 고정이라 먼저 좁아지면 안 된다). */
        @media (min-width: 48rem) {
          .board-col-views { display: table-cell; }
          .board-col-no { width: 10%; }
          .board-col-title { width: 55%; }
          .board-col-date { width: 20%; }

          .board-table tbody td,
          .board-table tbody th { height: 2.9375rem; font-size: 1rem; }
        }

        /* 74rem(wide) — max-w-content 안쪽 1100px 이 온전히 확보되는 구간.
           여기서만 시안 실측 비율(10.7 / 61.5 / 15.8 / 12)을 그대로 쓴다.
           시안의 33px 좌측 패딩은 좌측정렬 전제의 값이라 중앙정렬로 바뀐 지금은 쓰지 않는다. */
        @media (min-width: 74rem) {
          .board-col-no { width: 10.7%; }
          .board-col-title { width: 61.5%; }
          .board-col-views { width: 15.8%; }
          .board-col-date { width: 12%; }
        }

        /* ── 제목 셀 ──────────────────────────────────────────────────────
           truncate 를 flex 위에서 돌릴 때 min-width:0 이 없으면 nowrap 이 min-content 를
           max-content 로 밀어 전역 가로 스크롤을 만든다(CompanyNews.jsx:676-679 사고 이력). */
        .board-title-line {
          display: flex;
          min-width: 0;
          align-items: center;
          gap: 0.5rem;
        }
        .board-title-link,
        .board-title-text {
          display: block;
          min-width: 0;
          flex: 1 1 auto;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-weight: 500;
          color: inherit;
        }

        /* 행 전체 클릭 — 앵커는 행당 1개뿐이고 그 ::after 가 행을 덮는다. */
        .board-row { position: relative; }
        .board-title-link::after {
          content: '';
          position: absolute;
          inset: 0;
        }

        .board-row,
        .board-title-link {
          transition-property: background-color, color;
          transition-duration: 150ms;
          transition-timing-function: var(--ease-out-quart);
        }
        .board-row:hover { background-color: #F1F5F9; }
        .board-row:hover .board-title-link { color: #013262; }

        .board-title-link:focus-visible { outline: none; }
        .board-title-link:focus-visible::after {
          outline: 0.125rem solid #0B84FD;
          outline-offset: -0.125rem;
          border-radius: 0.25rem;
        }
        /* :has() 미지원 엔진에서는 이 규칙만 통째로 무시된다 —
           포커스 표시 자체는 위 outline 이 담당하므로 접근성 하한은 지켜진다. */
        .board-row:has(.board-title-link:focus-visible) { background-color: #F1F5F9; }
        .board-row:has(.board-title-link:focus-visible) .board-title-link { color: #013262; }

        @media (prefers-reduced-motion: reduce) {
          .board-row,
          .board-title-link { transition: none; }
        }

        /* ── 중요 칩 ──────────────────────────────────────────────────────
           칩의 색과 치수(48×28 / radius 10 / Pretendard Medium 14px / line-height 1.4,
           Figma 2235:3741 · 2235:3742)는 이제 공통 Chip 컴포넌트가 소유한다
           — src/components/Chip.jsx 의 tone="red" + size="md-fixed".
           시안의 padding 12·4 는 오토레이아웃이 48×28 을 만들어낸 값이라 그쪽에서도 결과 크기를
           고정하고 중앙정렬로 대체한다(고정폭 + 좌우 패딩을 동시에 주면 넘친다).

           여기 남는 규칙은 "번호 컬럼이 없는 구간에서만 제목 앞에 뜨는 사본" 하나뿐이다. */
        .board-chip--inline { flex: 0 0 auto; }
        /* display:none 이면 접근성 트리에서도 빠지므로 중복 announce 가 생기지 않는다.
           선택자에 태그를 붙여 특이도를 (0,1,1)로 올린 이유: Chip 이 얹는 Tailwind
           inline-flex 유틸리티(0,1,0)와의 순서 의존을 없애기 위해서다. Chip 은 항상
           span 을 렌더하므로 이 선택자는 항상 맞는다. */
        @media (min-width: 40rem) {
          span.board-chip--inline { display: none; }
        }
      `}</style>
    </>
  );
}
