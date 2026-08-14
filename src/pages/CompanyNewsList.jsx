import BoardListPage from "../components/board/BoardListPage";
import { BOARD_SOURCES } from "./board/boardData";

/**
 * 회사소식 목록 페이지 (`/company-news/list`).
 *
 * 이 파일은 배선만 한다 — 레이아웃·상태·표·검색·페이지네이션은 전부 `BoardListPage` 가 소유한다.
 * `BoardListPage` 가 `<main>` 과 `<h1>` 을 직접 렌더하므로 여기서 다시 감싸면 main/h1 이
 * 2개가 된다. 따라서 이 컴포넌트의 반환값은 `<BoardListPage />` 단독이어야 한다.
 *
 * 상세는 별도 라우트를 만들지 않고 기존 `/company-news` 의 `?id=` 상세뷰를 그대로 재사용한다
 * (CompanyNews.jsx:797-798 의 useSearchParams 기반 분기).
 */
export default function CompanyNewsList() {
  return (
    <BoardListPage
      title="회사소식"
      source={BOARD_SOURCES.companyNews}
      searchAriaLabel="회사소식 검색"
      getDetailHref={(row) => `/company-news?id=${encodeURIComponent(row.id)}`}
      emptyMessage="등록된 회사소식이 없습니다."
    />
  );
}
