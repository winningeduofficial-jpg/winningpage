import { supabase } from "../../lib/supabase";

/**
 * 게시판(회사소식/공지사항) 공통 데이터 레이어.
 * `src/pages/column/columnData.js` 계보 — 페이지/컴포넌트는 supabase를 직접 부르지 않는다.
 *
 * 공통 규약
 * - 정렬: is_pinned desc → sort_order asc → created_at desc
 *   (Events.jsx:74-76, CompanyNews.jsx:832-834, Home.jsx:339-341 3종 게시판 관용 그대로)
 * - 페이지네이션은 클라이언트 방식(전량 로드 후 slice). 저장소에 .range()/count:'exact'
 *   사용처가 0건이고, 서버 페이징으로 가면 "이미 로드된 rows에서 find"하는 기존 `?id=`
 *   상세 구조(CompanyNews.jsx:863, Events.jsx:119)가 깨진다.
 * - 단 fetchBoardRows 반환은 `{ rows, total }` 로 고정 — 나중에 서버 페이징으로 이행해도
 *   소비자 코드를 건드리지 않는다.
 * - 검색은 제목 대상, 클라이언트 필터, 대소문자 무시.
 */

/**
 * 소비자가 임의 테이블명을 넘기는 것을 막는 화이트리스트.
 * 값은 실제 Supabase 테이블명이며 RPC 화이트리스트와도 동일한 문자열이어야 한다.
 */
export const BOARD_SOURCES = Object.freeze({
  companyNews: "company_news",
  notices: "notices",
});

const BOARD_TABLE_NAMES = Object.freeze(Object.values(BOARD_SOURCES));

/** 페이지당 행 수 (설계 결정 D5). */
export const BOARD_PAGE_SIZE = 10;

// KST(UTC+9) 기준 날짜 표기 — NewsSection.jsx:46-60 / Home.jsx:50-54 todayKstYmd 와 동일한
// +9h 시프트 방식. toISOString() 단독 사용 시 KST 00:00~08:59 생성 글이 전날로 표시된다.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * BOARD_SOURCES 값(=테이블명)만 통과시킨다. key('companyNews')로 넘어와도 받아준다.
 * 허용되지 않으면 null.
 */
function resolveBoardTable(source) {
  if (BOARD_TABLE_NAMES.includes(source)) return source;
  if (Object.hasOwn(BOARD_SOURCES, source)) return BOARD_SOURCES[source];
  return null;
}

/**
 * 활성 게시글 전량 로드.
 *
 * select('*') 고정 — view_count 를 명시 나열하면 마이그레이션 미적용 환경에서
 * PGRST204 로 목록 전체가 죽는다. 부재 컬럼은 getViewCount 가 null 로 폴백한다
 * (columnData.js:74-91 과 동일한 이유·동일한 에러 처리: throw 하지 않고 빈 결과 반환).
 *
 * @param {string} source BOARD_SOURCES 의 값 또는 키
 * @returns {Promise<{ rows: object[], total: number }>}
 */
export async function fetchBoardRows(source) {
  const table = resolveBoardTable(source);

  if (!table) {
    console.error("게시판 조회 실패: 허용되지 않은 source", source);
    return { rows: [], total: 0 };
  }

  const { data, error } = await supabase
    .from(table)
    .select("*")
    .eq("is_active", true)
    .order("is_pinned", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("게시판 조회 실패:", error);
    return { rows: [], total: 0 };
  }

  const rows = data || [];

  return { rows, total: rows.length };
}

/**
 * view_count 컬럼이 아직 없는 환경(마이그레이션 미적용)에서는 null.
 * 표에서는 null 이면 '-' 를 표시하고, 전 행이 null 이면 컬럼 자체를 숨긴다
 * (ColumnList.jsx:39 hasViewCounts 계약과 동일한 취급).
 */
export function getViewCount(row) {
  return Number.isFinite(row?.view_count) ? row.view_count : null;
}

/**
 * KST 기준 'YYYY-MM-DD'.
 * 파싱 불가 값은 원문 앞 10자 반환(기존 formatDate 7벌의 공통 폴백 관행 유지).
 */
export function formatBoardDate(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value).slice(0, 10);
  }

  return new Date(date.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * 제목 대상 클라이언트 필터. 공백 trim, 대소문자 무시. 빈 키워드면 원본 배열 그대로 반환.
 */
export function filterBoardRows(rows, keyword) {
  const list = Array.isArray(rows) ? rows : [];
  const query = String(keyword ?? "")
    .trim()
    .toLowerCase();

  if (!query) return list;

  return list.filter((row) =>
    String(row?.title ?? "")
      .toLowerCase()
      .includes(query),
  );
}

/**
 * 전량 로드 후 slice. AdmissionGuidelines.jsx:1245-1249 관행 이식 + 하한 클램프 추가.
 * 빈 목록에서도 totalPages 는 1 (페이지네이션 컴포넌트가 totalPages <= 1 이면 null 렌더).
 *
 * @returns {{ pageRows: object[], totalPages: number, safePage: number }}
 */
export function paginate(rows, page, pageSize = BOARD_PAGE_SIZE) {
  const list = Array.isArray(rows) ? rows : [];
  const size =
    Number.isFinite(pageSize) && pageSize > 0
      ? Math.floor(pageSize)
      : BOARD_PAGE_SIZE;

  const totalPages = Math.max(1, Math.ceil(list.length / size));
  const requested = Number.isFinite(page) ? Math.floor(page) : 1;
  const safePage = Math.min(Math.max(requested, 1), totalPages);

  const start = (safePage - 1) * size;

  return { pageRows: list.slice(start, start + size), totalPages, safePage };
}

/**
 * 전체 역순 일련번호 — 가장 위 행이 total, 아래로 갈수록 1씩 감소 (설계 결정 D4).
 * id 가 uuid PK 라 id 를 그대로 노출할 수 없어 위치 기반으로 매긴다.
 *
 * 기준 배열 = **필터(검색) 결과**다. total 에는 filterBoardRows 결과 길이를 넘긴다.
 *   근거: 전체 배열 기준으로 매기면 검색 시 번호가 47 → 23 → 8 처럼 불연속으로 튀고,
 *   "12개 중 3번째"라는 위치 감각이 사라진다. 한국형 게시판 관행도 검색 시 재번호다.
 *   번호는 글의 영구 식별자가 아니라 "현재 보고 있는 목록에서의 위치"이며, 영구 식별은
 *   상세 링크의 `?id=` 가 담당한다.
 *   페이지가 바뀌어도 indexInFiltered 는 필터 배열 전체 기준 인덱스이므로
 *   (= (safePage - 1) * pageSize + 페이지 내 인덱스) 페이지 간 번호는 연속한다.
 *
 * 중요(is_pinned) 행은 번호 대신 '중요' 칩을 노출하므로 null 을 반환한다.
 * 단 인덱스 자리는 그대로 소비하므로 나머지 행의 번호는 중복 없이 단조 감소한다.
 *
 * @param {object} row 대상 행
 * @param {number} indexInFiltered 필터 결과 배열에서의 0-based 인덱스
 * @param {number} total 필터 결과 배열의 길이
 * @returns {number|null} 표시 번호. 중요 행 또는 계산 불가 시 null
 */
export function getDisplayNumber(row, indexInFiltered, total) {
  if (row?.is_pinned === true) return null;

  if (!Number.isFinite(total) || !Number.isFinite(indexInFiltered)) return null;

  const displayNumber = total - indexInFiltered;

  return displayNumber > 0 ? displayNumber : null;
}

/**
 * 조회수 +1 (1일 1회 IP 기반 중복 방지는 RPC 내부 책임 — 설계 결정 D3).
 *
 * 조회수는 부가 기능이므로 **절대 throw 하지 않는다.** RPC 미배포(함수 없음),
 * 권한 부족, 네트워크 실패 어느 경우에도 상세 화면 렌더를 막으면 안 된다.
 * 조용히 삼키되 console.warn 은 남긴다.
 */
export async function incrementBoardView(source, id) {
  const table = resolveBoardTable(source);

  if (!table || !id) {
    console.warn("조회수 증가 건너뜀: 잘못된 인자", { source, id });
    return;
  }

  try {
    const { error } = await supabase.rpc("increment_board_view", {
      p_source: table,
      p_id: id,
    });

    if (error) {
      console.warn("조회수 증가 실패(무시):", error);
    }
  } catch (err) {
    console.warn("조회수 증가 실패(무시):", err);
  }
}
