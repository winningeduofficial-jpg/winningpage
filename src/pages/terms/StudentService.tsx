// 학생회원 위닝에듀 이용약관 — docs/login-signup-renewal-spec.md §3.3[F](노드 2393-9255)/§6.1/§6.2.
// 전문(제1조~제42조 + 부칙)은 학부모 버전(2393:9385, docs/terms-fulltext.md)과 동일한 하나의
// "위닝에듀 이용약관"이다(제6조·제7조가 학생회원/학부모회원을 함께 규정) — 학생 페이지 전용
// 별도 추출 원문이 terms-fulltext.md에 없어(§6.2: 별도 확보가 명시된 노드는 학부모 버전
// 2393:9385/2393:9483뿐) 학부모 버전 전문을 그대로 재사용하되, 학부모 전제를 설명하는 도입부
// 문장(만 19세 이상 성인 전제 등)만 학생 페이지에 부적합하므로 제외했다.
// 학생 전용 도입부 4문단(노드 2393:9287)은 Figma 3차 추출로 원문 확보됨(docs/terms-fulltext-3.md
// § 2393-9255) — 기존 TermsPendingNotice placeholder를 원문으로 교체했다.
// 전문(구 ARTICLES 상수)은 sql/89로 DB(public.terms, code='service_fulltext')에
// 단일 원본화됐다 — useServiceTerms 훅으로 조회해 INTRO 뒤에 붙인다.
import TermsPageLayout, {
  TermsArticleBody,
} from "@/components/auth/TermsPageLayout";
import { useServiceTerms } from "@/hooks/useServiceTerms";

const INTRO = `본 약관은 위닝에듀 학생회원가입 시 회원의 연령(만 14세 이상 / 만 14세 미만)에 따라 회원 본인 또는 법정대리인이 확인·동의하는 사항을 정합니다. 본 약관은 위닝에듀 서비스 이용약관, 개인정보처리방침과 함께 적용됩니다.
연령 확인은 회원가입 시 입력하는 생년월일을 기준으로 하며, 생일이 지나지 않은 경우 만 14세 미만으로 처리합니다.

만 14세 이상 학생은 본인이 직접 가입 절차를 진행하며, 본인인증을 통해 연령 및 실명을 확인합니다.
만 14세 미만 학생회원의 가입은 개인정보 보호법 및 위닝에듀 서비스 이용약관 제7조에 따라 법정대리인의 동의를 얻어야 하며, 아래 절차는 법정대리인이 대리하여 진행합니다.`;

export default function StudentService() {
  const { terms, loading, error } = useServiceTerms();
  const body = terms ? `${INTRO}\n\n${terms.content}` : null;

  return (
    // 시안(2393-9255)은 페이지 대제목 "이용약관"(32px) 아래 문서 제목 "학생회원 위닝에듀
    // 이용약관"(14px SemiBold)의 2단 구성이고, 시안에 없는 "시행일" 캡션 라인은 제거한다
    // (본문 내 부칙 조항의 시행일 문구는 body 자체에 남아 있으므로 별개).
    <TermsPageLayout pageTitle="이용약관" title="학생회원 위닝에듀 이용약관">
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
