// 약관 8종 공통 문서 템플릿 — docs/login-signup-renewal-spec.md §3.3[F]/§5.1/§5.2.
// 헤더/푸터는 SiteLayout이 담당한다고 가정(AuthLayout과 동일 관례) — 이 컴포넌트는 본문만
// 책임진다. AuthLayout(400px 중앙 정렬)과 달리 약관 페이지는 1100px(68.75rem) 좌측 정렬
// 컬럼이므로(§3.0 "본문 1100px 좌측 정렬 컬럼(py 100, gap 40)") 별도 컴포넌트로 분리했다.
// 반응형(adapt.md): 인라인 style은 브레이크포인트를 못 태우므로 클래스로 이전 — 1100px은
// w-full 위 상한(max-w)일 뿐이라 유동폭 자체는 원래도 성립했고, 여백만 모바일 우선으로 램프.
export default function TermsPageLayout({
  title,
  pageTitle, // 페이지 대제목(예: "이용약관"). 지정 시 32px H1은 이 값으로, title은 그 아래
  // 14px SemiBold 문서 제목 서브헤딩으로 배치된다(시안 §3.3 F: 대제목 + 문서 제목 2단 구성
  // 화면 전용 — 예: StudentService). 지정하지 않으면(기본) title이 그대로 32px H1로 렌더되는
  // 기존 동작을 유지해 이 prop을 쓰지 않는 나머지 약관 페이지는 영향받지 않는다.
  effectiveDate, // 부칙 시행일(있는 문서만). 없으면 미노출 — 없다고 임의로 만들지 않는다.
  children,
  className = "",
}) {
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

// 섹션(조문 그룹) 제목 — 20px SemiBold(§3.0: "서브타이틀·섹션 20px Medium(약관 페이지는 SemiBold)").
export function TermsSection({ title, children, className = "" }) {
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

// 법무 검수 대기 안내 — 시안/추출 데이터에 원문이 없는 조항에 사용한다(작성 원칙: 데이터에
// 없는 사항은 "확인 필요"로 표기). 화면에도 노출해 다음 단계(법무 검수)에서 놓치지 않도록 한다.
export function TermsPendingNotice({ children, className = "" }) {
  return (
    <div
      className={`rounded-lg border border-error/30 bg-surface-card p-4 text-xs leading-6 text-error ${className}`}
    >
      {children}
    </div>
  );
}

// 외부 도메인 문자열을 새 탭 링크로 변환(§3.3 F: "외부 링크 3개 … target _blank").
// 특정 URL을 하드코딩하지 않고 일반적인 도메인 패턴을 인식해, 어느 조항에 도메인이 등장하든
// 동일하게 동작하도록 한다.
const DOMAIN_PATTERN =
  /((?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:go\.kr|or\.kr|kr|com))/gi;

function linkify(text) {
  const parts = text.split(DOMAIN_PATTERN);
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      const href = part.startsWith("http") ? part : `https://${part}`;
      return (
        <a
          // biome-ignore lint/suspicious/noArrayIndexKey: 정적 약관 텍스트를 정규식으로 매 렌더 분할한 파생 배열 — id 없고 재정렬 없음.
          key={i}
          href={href}
          target="_blank"
          rel="noreferrer"
          className="text-accent underline underline-offset-2"
        >
          {part}
        </a>
      );
    }
    // biome-ignore lint/suspicious/noArrayIndexKey: 위와 동일 — 정적 텍스트 분할 파생 배열.
    return <span key={i}>{part}</span>;
  });
}

// 제N조/부칙/번호 목차를 제목으로, '·'·'-' 불릿을 들여쓰기로 표시 — AS-IS Legal.jsx의 조/항
// 판별 관례를 계승(기준 12px, 약관 원문 전문을 그대로 줄 단위 렌더링).
function isHeading(line) {
  const t = line.trim();
  if (/^제\d+조/.test(t)) return true;
  if (/^제\d+장/.test(t)) return true;
  if (/^부칙$/.test(t)) return true;
  if (/^\d+\.\s/.test(t)) return true;
  return false;
}

export function TermsArticleBody({ text, className = "" }) {
  const lines = text ? text.split("\n") : [];

  return (
    <div className={`flex flex-col ${className}`}>
      {lines.map((line, i) => {
        const t = line.trim();
        // biome-ignore lint/suspicious/noArrayIndexKey: 정적 약관 텍스트를 줄바꿈으로 매 렌더 분할한 파생 배열 — id 없고 재정렬 없음.
        if (t === "") return <div key={i} className="h-2" />;

        if (isHeading(t)) {
          return (
            <p
              // biome-ignore lint/suspicious/noArrayIndexKey: 위와 동일.
              key={i}
              className="mb-1 mt-4 text-sm font-semibold text-ink-title first:mt-0"
            >
              {linkify(t)}
            </p>
          );
        }

        const indented = /^[·\-①-⑳]/.test(t);
        return (
          <p
            // biome-ignore lint/suspicious/noArrayIndexKey: 위와 동일.
            key={i}
            className={`break-keep text-xs leading-[1.85] text-ink ${indented ? "pl-3.5" : ""}`}
          >
            {linkify(t)}
          </p>
        );
      })}
    </div>
  );
}
