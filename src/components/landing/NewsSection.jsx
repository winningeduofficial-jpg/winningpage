import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

/**
 * 뉴스 섹션 (0729 시안 Figma node 2207:13148, 1101×293 재구현) — 독립 풀폭 섹션
 * - 중앙 타이틀 + 2컬럼(좌 회사소식 / 우 공지사항) 각 최대 3행 리스트
 * - 각 행 = 카테고리 배지 pill(선택) + 제목(ellipsis) + 우측 날짜. 썸네일 없음.
 * - 헤더 chevron → 더보기 (회사소식 /company-news, 공지사항 /events)
 * - 행 클릭 → 상세 (?id= 쿼리 파라미터 기반 기존 상세 라우트)
 *
 * 컨테이너 폭: 프로젝트 공통 max-w-content(72.75rem, lg 내부 1100px) 토큰 사용.
 * 치수는 0729 시안 문자값(px) ÷16 rem 환산을 그대로 사용(반올림 없이 시안 실측 소수점 유지).
 *
 * 수직 리듬: 상단(멘토→뉴스) 120px→md:pt-[7.5rem], 하단(뉴스→푸터) 120px→md:pb-[7.5rem]
 * (이 섹션이 다음 푸터와의 갭을 소유하는 예외 케이스). 모바일은 서비스 섹션 선례 비율
 * 0.4(=40/100, ServicesSection pt-10/lg:pt-[6.25rem] 참고)로 축소한 pt-12/pb-12(3rem/48px).
 * 타이틀→그리드 61px→md:mt-[3.8125rem], 컬럼 헤더→리스트 15.65px→md:mt-[0.978rem]
 * (모바일 gap은 기존 유지, 시안에 모바일 분기 값 없음).
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
// 공지는 시안 원값(#FFC4C4/#FF7373)이 대비 1.75:1로 WCAG 미달이라 타 칩과 같은 패턴
// (연한 동계열 틴트 배경 + 진한 동계열 텍스트, 7.88:1)으로 보정.
// 0803 시안(2207:12336)의 '중요' 카테고리도 동일 조정 팔레트('공지'와 동색)를 적용한다.
const CATEGORY_BADGE_STYLES = {
  보도자료: { bg: '#E9F4FF', text: '#013262' },
  파트너십: { bg: '#EEFFE9', text: '#016215' },
  공지: { bg: '#FFE9E9', text: '#8F1616' },
  중요: { bg: '#FFE9E9', text: '#8F1616' }
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

  return new Date(date.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10).replace(/-/g, '.');
}

// 배지 폭은 0803 시안 기준 4rem(64px) 고정 — 모든 행 제목 정렬용, 카테고리 없으면 동일 폭 스페이서.
function CategoryBadge({ category }) {
  const style = category ? CATEGORY_BADGE_STYLES[category] : null;

  if (!category) return <span aria-hidden="true" className="w-[4rem] shrink-0" />;

  return (
    <span
      className="inline-flex w-[4rem] shrink-0 items-center justify-center rounded-[0.5rem] px-[0.5rem] py-[0.196rem] text-[0.875rem] font-medium leading-[1.4] tracking-[-0.0175rem] whitespace-nowrap"
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
    <div className="flex items-center gap-[0.489rem]">
      <h3 className="text-[1.174rem] font-semibold leading-[1.4] tracking-[-0.0235rem] text-[#525252]">
        <Link to={moreLink}>{title}</Link>
      </h3>
      <Link
        to={moreLink}
        aria-label={moreLabel}
        className="relative flex h-6 w-6 items-center justify-center text-[#525252] transition-colors duration-150 hover:text-[#013262] max-lg:after:absolute max-lg:after:-inset-2.5 max-lg:after:content-['']"
      >
        <ChevronRight size={19} aria-hidden="true" />
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
        className="flex flex-col gap-1 px-[0.489rem] py-4 transition-colors duration-150 hover:bg-[#F1F5F9] sm:h-[2.641rem] sm:flex-row sm:items-center sm:justify-between sm:gap-10 sm:py-0"
      >
        <div className="flex min-w-0 items-center gap-[1.956rem] sm:contents">
          <CategoryBadge category={item.category} />
          <p className="min-w-0 flex-1 truncate text-[1rem] font-medium leading-[1.4] tracking-[-0.02rem] text-[#525252]">
            {item.title}
          </p>
        </div>
        <span className="shrink-0 text-[0.7825rem] leading-[1.4] tracking-[-0.0157rem] text-[#D7D7D7]">
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
    <section
      aria-label="위닝에듀 소식"
      className="w-full bg-white pt-12 pb-12 md:pt-[7.5rem] md:pb-[7.5rem]"
    >
      <div className="mx-auto w-full max-w-content px-5 sm:px-8">
        <h2 className="text-center text-[1.75rem] font-semibold leading-[1.4] tracking-[-0.04rem] text-[#525252] sm:text-[2rem]">
          위닝에듀의 새로운 소식
        </h2>

        <div className="mt-[3.75rem] grid grid-cols-1 gap-[3.75rem] md:mt-[3.8125rem] md:grid-cols-2 md:gap-[1.3125rem]">
          {/* 좌: 회사소식 */}
          <div>
            <ColumnHeader title="회사소식" moreLink="/company-news" moreLabel="회사소식 더보기" />
            {newsRows.length > 0 ? (
              <ul className="mt-10 space-y-[1.5rem] md:mt-[0.978rem]">
                {newsRows.map((item) => (
                  <NewsRow key={item.id} item={item} basePath="/company-news" />
                ))}
              </ul>
            ) : (
              <EmptyRows
                message="등록된 회사소식이 없습니다."
                className="mt-6 h-16 md:mt-[0.978rem] md:h-[2.641rem]"
              />
            )}
          </div>

          {/* 우: 공지사항 */}
          <div>
            <ColumnHeader title="공지사항" moreLink="/events" moreLabel="공지사항 더보기" />
            {noticeRows.length > 0 ? (
              <ul className="mt-10 space-y-[1.5rem] md:mt-[0.978rem]">
                {noticeRows.map((item) => (
                  <NewsRow key={item.id} item={item} basePath="/events" />
                ))}
              </ul>
            ) : (
              <EmptyRows
                message="등록된 공지사항이 없습니다."
                className="mt-6 h-16 md:mt-[0.978rem] md:h-[2.641rem]"
              />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
