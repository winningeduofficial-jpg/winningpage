// 가입 약관 8종(/terms/student/*, /terms/parent/*) 공통 페이지 — 본문은 전부
// public.terms(useTermsDocs)에서 읽는다. 하드코딩 사본 없음.
// - code: 이 페이지의 문서(행 title이 문서 제목 서브헤딩이 된다).
// - appendCode: 도입부 뒤에 이어 붙는 공통 전문(가입약관 뒤의 service_fulltext,
//   개인정보 도입부 뒤의 privacy_policy). 붙는 전문은 그 행의 title을 섹션 제목으로 쓴다.
// - showEffectiveDate: 시행일 캡션(시안에 있는 페이지만; 기본 미노출).
// 레이아웃은 docs/login-signup-renewal-spec.md §3.3[F](대제목 "이용약관" + 문서 제목 2단).
import TermsPageLayout, {
  TermsArticleBody,
  TermsSection,
} from "@/components/auth/TermsPageLayout";
import { useTermsDocs } from "@/hooks/useTermsDocs";

export interface TermsDocPageProps {
  code: string;
  appendCode?: string;
  showEffectiveDate?: boolean;
}

export default function TermsDocPage({
  code,
  appendCode,
  showEffectiveDate = false,
}: TermsDocPageProps) {
  const codes = appendCode ? [code, appendCode] : [code];
  const { docs, loading, error } = useTermsDocs(codes);
  const doc = docs?.[code] ?? null;
  const appended = appendCode ? (docs?.[appendCode] ?? null) : null;

  return (
    <TermsPageLayout
      pageTitle="이용약관"
      title={doc?.title ?? ""}
      {...(showEffectiveDate && doc
        ? { effectiveDate: doc.effectiveFrom }
        : {})}
    >
      {error ? (
        <p className="text-xs text-ink-sub">{error}</p>
      ) : loading || !doc ? (
        <p className="text-xs text-ink-sub">문서를 불러오는 중…</p>
      ) : (
        <>
          <TermsArticleBody text={doc.content} />
          {appended && (
            <TermsSection title={appended.title}>
              <TermsArticleBody text={appended.content} />
            </TermsSection>
          )}
        </>
      )}
    </TermsPageLayout>
  );
}
