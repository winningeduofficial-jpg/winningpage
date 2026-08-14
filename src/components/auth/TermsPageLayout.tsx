// 약관 8종 공통 문서 템플릿 — docs/login-signup-renewal-spec.md §3.3[F]/§5.1/§5.2.
// 헤더/푸터는 SiteLayout이 담당한다고 가정(AuthLayout과 동일 관례) — 이 컴포넌트는 본문만
// 책임진다. AuthLayout(400px 중앙 정렬)과 달리 약관 페이지는 1100px(68.75rem) 좌측 정렬
// 컬럼이므로(§3.0 "본문 1100px 좌측 정렬 컬럼(py 100, gap 40)") 별도 컴포넌트로 분리했다.
// 반응형(adapt.md): 인라인 style은 브레이크포인트를 못 태우므로 클래스로 이전 — 1100px은
// w-full 위 상한(max-w)일 뿐이라 유동폭 자체는 원래도 성립했고, 여백만 모바일 우선으로 램프.
import type { ReactNode } from "react";
import { withDedupedKeys } from "../../lib/reactKeys";

interface TermsPageLayoutProps {
  title?: ReactNode;
  pageTitle?: ReactNode;
  effectiveDate?: string;
  children?: ReactNode;
  className?: string;
}

export default function TermsPageLayout({
  title,
  pageTitle, // 페이지 대제목(예: "이용약관"). 지정 시 32px H1은 이 값으로, title은 그 아래
  // 14px SemiBold 문서 제목 서브헤딩으로 배치된다(시안 §3.3 F: 대제목 + 문서 제목 2단 구성
  // 화면 전용 — 예: StudentService). 지정하지 않으면(기본) title이 그대로 32px H1로 렌더되는
  // 기존 동작을 유지해 이 prop을 쓰지 않는 나머지 약관 페이지는 영향받지 않는다.
  effectiveDate, // 부칙 시행일(있는 문서만). 없으면 미노출 — 없다고 임의로 만들지 않는다.
  children,
  className = "",
}: TermsPageLayoutProps) {
  return (
    <main className="min-h-screen w-full bg-white pt-16">
      <div
        className={`auth-step-enter mx-auto flex w-full max-w-[68.75rem] flex-col items-start gap-8 px-6 py-12 md:gap-10 md:py-[6.25rem] lg:px-0 ${className}`}
      >
        <header
          className={`flex flex-col ${pageTitle ? "gap-8 md:gap-10" : "gap-2"}`}
        >
          {/* 타이틀 32px SemiBold — §3.3 F 공통 템플릿. tracking -0.64px(-0.04rem)은 AuthTitle과 동일 값. */}
          <h1 className="break-keep text-2xl font-semibold leading-[1.4] tracking-[-0.04rem] text-ink-title sm:text-[2rem]">
            {pageTitle || title}
          </h1>
          {/* pageTitle이 있을 때만 문서 제목을 14px SemiBold 서브헤딩으로 추가 렌더(§3.3 F). */}
          {pageTitle && (
            <p className="text-sm font-semibold text-ink-title">{title}</p>
          )}
          {effectiveDate && (
            <p className="text-sm text-ink-sub">시행일 {effectiveDate}</p>
          )}
        </header>

        <div className="flex w-full flex-col gap-10">{children}</div>
      </div>
    </main>
  );
}

interface TermsSectionProps {
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}

// 섹션(조문 그룹) 제목 — 20px SemiBold(§3.0: "서브타이틀·섹션 20px Medium(약관 페이지는 SemiBold)").
export function TermsSection({
  title,
  children,
  className = "",
}: TermsSectionProps) {
  return (
    <section className={`flex flex-col gap-3 ${className}`}>
      {title && (
        <h2 className="text-xl font-semibold leading-[1.4] tracking-[-0.025rem] text-ink-title">
          {title}
        </h2>
      )}
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

// 외부 도메인 문자열을 새 탭 링크로 변환(§3.3 F: "외부 링크 3개 … target _blank").
// 특정 URL을 하드코딩하지 않고 일반적인 도메인 패턴을 인식해, 어느 조항에 도메인이 등장하든
// 동일하게 동작하도록 한다.
const DOMAIN_PATTERN =
  /((?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:go\.kr|or\.kr|kr|com))/gi;

function linkify(text: string) {
  const parts = text.split(DOMAIN_PATTERN);
  return withDedupedKeys(parts).map(({ item: part, key }, i) => {
    if (i % 2 === 1) {
      const href = part.startsWith("http") ? part : `https://${part}`;
      return (
        <a
          key={key}
          href={href}
          target="_blank"
          rel="noreferrer"
          className="text-accent underline underline-offset-2"
        >
          {part}
        </a>
      );
    }
    return <span key={key}>{part}</span>;
  });
}

// 제N조/부칙/번호 목차를 제목으로, '·'·'-' 불릿을 들여쓰기로 표시 — AS-IS Legal.jsx의 조/항
// 판별 관례를 계승(기준 12px, 약관 원문 전문을 그대로 줄 단위 렌더링).
function isHeading(line: string) {
  const t = line.trim();
  if (/^제\d+조/.test(t)) return true;
  if (/^제\d+장/.test(t)) return true;
  if (/^부칙$/.test(t)) return true;
  if (/^\d+\.\s/.test(t)) return true;
  return false;
}

interface TermsArticleBodyProps {
  text?: string | null;
  className?: string;
}

export function TermsArticleBody({
  text,
  className = "",
}: TermsArticleBodyProps) {
  const lines = text ? text.split("\n") : [];

  return (
    <div className={`flex flex-col ${className}`}>
      {withDedupedKeys(lines).map(({ item: line, key }) => {
        const t = line.trim();
        if (t === "") return <div key={key} className="h-2" />;

        if (isHeading(t)) {
          return (
            <p
              key={key}
              className="mb-1 mt-4 text-sm font-semibold text-ink-title first:mt-0"
            >
              {linkify(t)}
            </p>
          );
        }

        const indented = /^[·\-①-⑳]/.test(t);
        return (
          <p
            key={key}
            className={`break-keep text-xs leading-[1.85] text-ink ${indented ? "pl-3.5" : ""}`}
          >
            {linkify(t)}
          </p>
        );
      })}
    </div>
  );
}
