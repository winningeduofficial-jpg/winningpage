// 학부모회원 위닝에듀 이용약관 — docs/login-signup-renewal-spec.md §3.3[F](노드 2393:9353,
// 전문은 하위 노드 2393:9385)/§6.1/§6.2. 전문(도입부 + 제1조~제42조 + 부칙)은
// docs/terms-fulltext.md에 그대로 있음(학부모 버전이 정본으로 별도 추출된 노드).
// 학생 버전(StudentService.jsx)과 조문 본문은 동일하나(제6조·제7조가 학생/학부모를 함께
// 규정하는 하나의 약관), 학부모 전제를 설명하는 도입부 문장은 이 페이지에만 유지한다.
// 전문(구 ARTICLES 상수)은 sql/89로 DB(public.terms, code='service_fulltext')에
// 단일 원본화됐다 — useServiceTerms 훅으로 조회해 INTRO 뒤에 붙인다.
import TermsPageLayout, {
  TermsArticleBody,
} from "@/components/auth/TermsPageLayout";
import { useServiceTerms } from "@/hooks/useServiceTerms";

const INTRO =
  "학부모회원은 만 19세 이상 성인을 전제로 하며, 자녀(학생회원)와는 별도의 독립 계정으로 가입합니다. 연동 없이도 학부모회원 계정 자체는 이용할 수 있습니다.";

export default function ParentService() {
  const { terms, loading, error } = useServiceTerms();
  const body = terms ? `${INTRO}\n\n${terms.content}` : null;

  return (
    <TermsPageLayout
      pageTitle="이용약관"
      title="학부모회원 위닝에듀 이용약관"
      {...(terms?.effectiveFrom ? { effectiveDate: terms.effectiveFrom } : {})}
    >
      {error ? (
        <p className="text-xs text-ink-sub">{error}</p>
      ) : loading || !body ? (
        <p className="text-xs text-ink-sub">문서를 불러오는 중…</p>
      ) : (
        <TermsArticleBody text={body} />
      )}
    </TermsPageLayout>
  );
}
