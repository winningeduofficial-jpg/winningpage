import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";

/**
 * 게시판 공통 페이지네이션.
 *
 * 마크업·클래스·실측 주석은 src/pages/AdmissionGuidelines.jsx 의 페이지네이션
 * <nav> 블록에서 그대로 추출한 것이다(윈도우 계산 로직 포함). 시안 값은 그쪽이 정본이며
 * 여기서는 재사용을 위해 컴포넌트로 옮겼을 뿐이다.
 *
 * 원본 대비 추가된 개선점: 활성 번호 버튼에 aria-current="page" 부여
 * (AdmissionGuidelines 원본에는 누락되어 있었다).
 */
type BoardPaginationProps = {
  /** 현재 페이지(1-base) */
  currentPage: number;
  /** 전체 페이지 수 */
  totalPages: number;
  /** 페이지 이동 콜백(1..totalPages 로 클램프되어 전달) */
  onPageChange: (page: number) => void;
  /** 한 번에 노출할 번호 버튼 개수 */
  windowSize?: number;
  /** nav 에 덧붙일 클래스 */
  className?: string;
};

export default function BoardPagination({
  currentPage,
  totalPages,
  onPageChange,
  windowSize = 10,
  className = "",
}: BoardPaginationProps) {
  const safeTotalPages = Math.max(1, Math.floor(totalPages) || 1);
  const safeCurrentPage = Math.min(
    Math.max(1, Math.floor(currentPage) || 1),
    safeTotalPages,
  );

  if (safeTotalPages <= 1) return null;

  // AdmissionGuidelines.jsx 원본 윈도우 계산: 현재 페이지가 속한 블록의 시작 번호를 구하고
  // 남은 페이지 수로 클램프해 마지막 블록에서 빈 버튼이 생기지 않게 한다.
  const windowStart =
    Math.floor((safeCurrentPage - 1) / windowSize) * windowSize + 1;
  const paginationNumbers = Array.from(
    { length: Math.min(windowSize, safeTotalPages - windowStart + 1) },
    (_, idx) => windowStart + idx,
  );

  const goToPage = (pageNumber) => {
    const next = Math.min(Math.max(1, pageNumber), safeTotalPages);
    if (next === safeCurrentPage) return;
    onPageChange?.(next);
  };

  // 1882:1291(1882:1833) 실측: 화살표쌍 gap 9px, 블록간 gap 20px,
  // 번호 버튼은 32x32 정사각·간격 0(딱 붙음), 활성만 남색 필채움 원형.
  return (
    <nav
      className={`mt-8 flex flex-wrap items-center justify-center gap-5 ${className}`.trim()}
      aria-label="페이지네이션"
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => goToPage(1)}
          disabled={safeCurrentPage === 1}
          className="flex h-4 w-4 items-center justify-center text-[#525252] transition hover:text-[#013262] disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="처음 페이지"
        >
          <ChevronsLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => goToPage(safeCurrentPage - 1)}
          disabled={safeCurrentPage === 1}
          className="flex h-4 w-4 items-center justify-center text-[#525252] transition hover:text-[#013262] disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="이전 페이지"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>

      <div className="flex items-center">
        {paginationNumbers.map((pageNumber) => {
          const isActive = pageNumber === safeCurrentPage;
          return (
            <button
              key={pageNumber}
              type="button"
              onClick={() => goToPage(pageNumber)}
              aria-current={isActive ? "page" : undefined}
              className={`flex h-8 w-8 items-center justify-center rounded-full text-base tracking-[-0.02em] transition ${
                isActive
                  ? "bg-[#013262] font-medium text-white"
                  : "font-normal text-[#525252] hover:text-[#013262]"
              }`}
            >
              {pageNumber}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => goToPage(safeCurrentPage + 1)}
          disabled={safeCurrentPage === safeTotalPages}
          className="flex h-4 w-4 items-center justify-center text-[#525252] transition hover:text-[#013262] disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="다음 페이지"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => goToPage(safeTotalPages)}
          disabled={safeCurrentPage === safeTotalPages}
          className="flex h-4 w-4 items-center justify-center text-[#525252] transition hover:text-[#013262] disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="마지막 페이지"
        >
          <ChevronsRight className="h-4 w-4" />
        </button>
      </div>
    </nav>
  );
}
