import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

/**
 * 공지사항 섹션 (명세 3.6) — 독립 풀폭 섹션
 * - 중앙 타이틀 + 2컬럼(좌 회사소식 / 우 공지사항) 각 최대 3행 리스트
 * - 좌: 썸네일(image_urls[0], 없으면 placeholder) + 제목 + "보도자료" 뱃지(is_pinned) + 날짜
 * - 우: "중요" 뱃지(is_pinned) + 제목(ellipsis) + 우측 날짜
 * - 헤더 chevron → 더보기 (회사소식 /company-news, 공지사항 /events)
 * - 행 클릭 → 상세 (?id= 쿼리 파라미터 기반 기존 상세 라우트)
 *
 * @param {object} props
 * @param {Array<{id: string, title: string, created_at: string, is_pinned?: boolean,
 *   image_urls?: string[]|string, sort_order?: number}>} props.companyNews
 *   company_news 활성 rows (is_pinned desc → sort_order asc → created_at desc)
 * @param {Array<{id: string, title: string, created_at: string, is_pinned?: boolean,
 *   sort_order?: number}>} props.notices
 *   notices 활성 rows (동일 정렬)
 */

const MAX_ROWS = 3;

function normalizeArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return value ? [value] : [];
    }
  }

  return [];
}

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

function ColumnHeader({ title, moreLink, moreLabel }) {
  return (
    <div className="flex items-center gap-1">
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

function CompanyNewsRow({ item }) {
  const thumbnail = normalizeArray(item.image_urls)[0];

  return (
    <li className="border-b border-[#D7D7D7]">
      <Link
        to={`/company-news?id=${item.id}`}
        className="flex h-[5.875rem] items-center gap-6 pl-4 pr-2 transition-colors duration-150 hover:bg-[#F1F5F9] sm:gap-10 sm:pl-10"
      >
        {thumbnail ? (
          <img
            src={thumbnail}
            alt=""
            width="100"
            height="55"
            loading="lazy"
            className="h-[3.4375rem] w-[6.25rem] shrink-0 rounded-xl bg-[#D9D9D9] object-cover"
          />
        ) : (
          <div
            className="h-[3.4375rem] w-[6.25rem] shrink-0 rounded-xl bg-[#D9D9D9]"
            aria-hidden="true"
          />
        )}

        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate text-base font-medium leading-[1.4] tracking-[-0.02rem] text-[#525252]">
              {item.title}
            </p>
            {item.is_pinned && (
              <span className="shrink-0 rounded-lg bg-[#E9F4FF] px-2 py-1 text-[0.625rem] font-medium leading-[1.4] tracking-[-0.0125rem] text-[#013262]">
                보도자료
              </span>
            )}
          </div>
          <p className="text-base leading-[1.4] tracking-[-0.02rem] text-[#D7D7D7]">
            {formatDate(item.created_at)}
          </p>
        </div>
      </Link>
    </li>
  );
}

function NoticeRow({ item }) {
  return (
    <li className="border-b border-[#D7D7D7]">
      {/* 모바일(<sm): 뱃지+제목 한 줄 + 날짜 둘째 줄로 분리 — shrink-0 뱃지·날짜가 제목을
          100~120px까지 압착하던 문제 해결. sm+에서는 안쪽 div를 sm:contents로 평탄화해
          뱃지·제목·날짜가 다시 Link의 직계 flex 형제로 합쳐지므로 원래 한 줄 레이아웃과
          gap-10 간격이 그대로 복원된다(데스크톱 렌더 불변). */}
      <Link
        to={`/events?id=${item.id}`}
        className="flex flex-col gap-1 px-[0.625rem] py-2 transition-colors duration-150 hover:bg-[#F1F5F9] sm:h-[3.375rem] sm:flex-row sm:items-center sm:gap-10 sm:py-0"
      >
        <div className="flex min-w-0 items-center gap-4 sm:contents">
          {item.is_pinned && (
            <span className="shrink-0 rounded-lg bg-[#FFC4C4] px-2 py-1 text-[0.625rem] font-medium leading-[1.4] tracking-[-0.0125rem] text-[#FF7373]">
              중요
            </span>
          )}
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

        <div className="mt-[6.875rem] grid grid-cols-1 gap-[3.75rem] md:grid-cols-2">
          {/* 좌: 회사소식 */}
          <div>
            <ColumnHeader
              title="회사소식"
              moreLink="/company-news"
              moreLabel="회사소식 더보기"
            />
            {newsRows.length > 0 ? (
              <ul className="mt-10 max-w-[38.75rem]">
                {newsRows.map((item) => (
                  <CompanyNewsRow key={item.id} item={item} />
                ))}
              </ul>
            ) : (
              <EmptyRows
                message="등록된 회사소식이 없습니다."
                className="mt-6 h-16 md:mt-10 md:h-[5.875rem]"
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
              <ul className="mt-10">
                {noticeRows.map((item) => (
                  <NoticeRow key={item.id} item={item} />
                ))}
              </ul>
            ) : (
              <EmptyRows
                message="등록된 공지사항이 없습니다."
                className="mt-6 h-16 md:mt-10 md:h-[5.875rem]"
              />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
