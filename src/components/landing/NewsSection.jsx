import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

/**
 * 공지사항 섹션 (Figma 1907:14893 재구현) — 독립 풀폭 섹션
 * - 중앙 타이틀 + 2컬럼(좌 회사소식 / 우 공지사항) 각 최대 3행 리스트
 * - 각 행 = 카테고리 배지 pill(선택) + 제목(ellipsis) + 우측 날짜. 썸네일 없음.
 * - 헤더 chevron → 더보기 (회사소식 /company-news, 공지사항 /events)
 * - 행 클릭 → 상세 (?id= 쿼리 파라미터 기반 기존 상세 라우트)
 *
 * 컨테이너 폭: 프로젝트 공통 max-w-content(75rem/1200px) 토큰 사용. 시안은 1920 캔버스
 * 기준 컨텐츠 실폭 1440px(좌우 240px 마진, node 1907:22199)이므로, 두 컬럼 사이 가로 간격은
 * 1200/1440(=5/6) 비율로 60px→50px 환산해 컨테이너가 좁아져도 컬럼 폭 비율이 시안과
 * 동일하게 유지되도록 했다(50% - 25px씩 = 시안의 690/1440 비율과 일치). 반면 배지 패딩·
 * 행 높이·타이포그래피 등 폭 축(1440↔1200)과 무관한 값은 시안 px를 그대로 rem 환산했다
 * (기계적 전체 축소 금지 — 폭 비율에만 스케일 적용).
 *
 * @param {object} props
 * @param {Array<{id: string, title: string, created_at: string, category?: string|null,
 *   sort_order?: number}>} props.companyNews
 *   company_news 활성 rows (is_pinned desc → sort_order asc → created_at desc)
 * @param {Array<{id: string, title: string, created_at: string, category?: string|null,
 *   sort_order?: number}>} props.notices
 *   notices 활성 rows (동일 정렬)
 */

const MAX_ROWS = 3;

// 시안(Figma 1907:14893) 배지 3색 — 값이 없거나 매핑에 없는 카테고리는 배지를 렌더하지 않는다.
const CATEGORY_BADGE_STYLES = {
  보도자료: { bg: '#E9F4FF', text: '#013262' },
  파트너십: { bg: '#EEFFE9', text: '#016215' },
  공지: { bg: '#FFC4C4', text: '#FF7373' }
};

// KST(UTC+9) 기준 날짜 표기 — Home.jsx todayKstYmd와 동일한 +9h 시프트 방식.
// toISOString() 단독 사용 시 KST 00:00~08:59 생성 글이 전날로 표시되는 문제 방지.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function formatDate(value) {
  if (!value) return '';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value).slice(0, 10).replace(/-/g, '.');
  }

  return new Date(date.getTime() + KST_OFFSET_MS)
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, '.');
}

function CategoryBadge({ category }) {
  const style = category ? CATEGORY_BADGE_STYLES[category] : null;

  if (!category) return null;

  return (
    <span
      className="shrink-0 rounded-lg px-2 py-1 text-[0.625rem] font-medium leading-[1.4] tracking-[-0.0125rem] whitespace-nowrap"
      style={{
        backgroundColor: style?.bg ?? '#F1F5F9',
        color: style?.text ?? '#525252'
      }}
    >
      {category}
    </span>
  );
}

function ColumnHeader({ title, moreLink, moreLabel }) {
  return (
    <div className="flex items-center gap-2.5">
      <h3 className="text-2xl font-bold leading-[1.4] tracking-[-0.03rem] text-[#525252]">
        {title}
      </h3>
      <Link
        to={moreLink}
        aria-label={moreLabel}
        className="relative flex h-6 w-6 items-center justify-center text-[#525252] transition-colors duration-150 hover:text-[#013262] max-lg:after:absolute max-lg:after:-inset-2.5 max-lg:after:content-['']"
      >
        <ChevronRight size={24} aria-hidden="true" />
      </Link>
    </div>
  );
}

function EmptyRows({ message, className }) {
  return (
    <p
      className={`flex items-center justify-center text-center text-[0.9375rem] text-[#8b95a1] ${className}`}
    >
      {message}
    </p>
  );
}

function NewsRow({ item, basePath }) {
  return (
    <li>
      {/* 모바일(<sm): 뱃지+제목 한 줄 + 날짜 둘째 줄로 분리 — shrink-0 뱃지·날짜가 제목을
          100~120px까지 압착하던 문제 해결. sm+에서는 안쪽 div를 sm:contents로 평탄화해
          뱃지·제목·날짜가 다시 Link의 직계 flex 형제로 합쳐지므로 시안의 한 줄 레이아웃과
          간격이 그대로 복원된다(데스크톱 렌더 불변). */}
      <Link
        to={`${basePath}?id=${item.id}`}
        className="flex flex-col gap-1 px-[0.625rem] py-4 transition-colors duration-150 hover:bg-[#F1F5F9] sm:h-[3.375rem] sm:flex-row sm:items-center sm:justify-between sm:gap-10 sm:py-0"
      >
        <div className="flex min-w-0 items-center gap-4 sm:contents">
          <CategoryBadge category={item.category} />
          <p className="min-w-0 flex-1 truncate text-base font-medium leading-[1.4] tracking-[-0.02rem] text-[#525252]">
            {item.title}
          </p>
        </div>
        <span className="shrink-0 text-base leading-[1.4] tracking-[-0.02rem] text-[#D7D7D7]">
          {formatDate(item.created_at)}
        </span>
      </Link>
    </li>
  );
}

export default function NewsSection({ companyNews = [], notices = [] }) {
  const newsRows = companyNews.slice(0, MAX_ROWS);
  const noticeRows = notices.slice(0, MAX_ROWS);

  return (
    <section aria-label="위닝에듀 소식" className="w-full bg-white pt-[7.5rem] pb-24">
      <div className="mx-auto w-full max-w-content px-5 sm:px-8">
        <h2 className="text-center text-[1.75rem] font-bold leading-[1.4] tracking-[-0.055rem] text-[#525252] sm:text-[2.75rem]">
          위닝에듀의 새로운 소식
        </h2>

        <div className="mt-[3.75rem] grid grid-cols-1 gap-[3.75rem] md:mt-[5.0625rem] md:grid-cols-2 md:gap-[3.125rem]">
          {/* 좌: 회사소식 */}
          <div>
            <ColumnHeader
              title="회사소식"
              moreLink="/company-news"
              moreLabel="회사소식 더보기"
            />
            {newsRows.length > 0 ? (
              <ul className="mt-10 divide-y divide-[#D7D7D7]">
                {newsRows.map((item) => (
                  <NewsRow key={item.id} item={item} basePath="/company-news" />
                ))}
              </ul>
            ) : (
              <EmptyRows
                message="등록된 회사소식이 없습니다."
                className="mt-6 h-16 md:mt-10 md:h-[3.375rem]"
              />
            )}
          </div>

          {/* 우: 공지사항 */}
          <div>
            <ColumnHeader
              title="공지사항"
              moreLink="/events"
              moreLabel="공지사항 더보기"
            />
            {noticeRows.length > 0 ? (
              <ul className="mt-10 divide-y divide-[#D7D7D7]">
                {noticeRows.map((item) => (
                  <NewsRow key={item.id} item={item} basePath="/events" />
                ))}
              </ul>
            ) : (
              <EmptyRows
                message="등록된 공지사항이 없습니다."
                className="mt-6 h-16 md:mt-10 md:h-[3.375rem]"
              />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
