// 학생회원 본인 인증을 위한 정보 수집 — docs/login-signup-renewal-spec.md §3.3[F](노드 2393-9745).
// 전문은 docs/terms-fulltext-2.md(Figma MCP `get_design_context` 2차 추출, 노드 2393-9745 /
// 소제목 2393:9776 / 본문 2393:9777)에 원문 그대로 확보됨 — 기존에 있던 §3.3 F 표 요약 기반
// placeholder 재구성 문안(TermsPendingNotice)을 실제 원문 전문으로 교체했다.
// 조/항 번호가 없는 라벨형(목적/항목/처리위탁/보유기간/부칙/사업자정보) 문서라 ParentPrivacy.jsx·
// StudentPrivacy.jsx와 동일하게 TermsArticleBody로 줄 단위 렌더링한다.
// 시안 원본은 본문 18px(다른 약관 페이지 12px과 불일치, §6.3 이슈)이나, 이 구현은 §5.4 공통
// 토큰(12px)을 그대로 따르고 불일치는 주석으로만 남긴다 — 임의로 새 폰트 크기를 만들지 않음.
import TermsPageLayout, {
  TermsArticleBody,
} from "../../components/auth/TermsPageLayout";

const BODY = `본 약관은 위닝에듀 학생회원가입 시 회원의 연령(만 14세 이상 / 만 14세 미만)에 따라 회원 본인 또는 법정대리인이 확인·동의하는 사항을 정합니다. 본 약관은 위닝에듀 서비스 이용약관, 개인정보처리방침과 함께 적용됩니다.
연령 확인은 회원가입 시 입력하는 생년월일을 기준으로 하며, 생일이 지나지 않은 경우 만 14세 미만으로 처리합니다.

만 14세 이상 학생은 본인이 직접 가입 절차를 진행하며, 본인인증을 통해 연령 및 실명을 확인합니다.
만 14세 미만 학생회원의 가입은 개인정보 보호법 및 위닝에듀 서비스 이용약관 제7조에 따라 법정대리인의 동의를 얻어야 하며, 아래 절차는 법정대리인이 대리하여 진행합니다.

목적 : 실명확인·본인확인, 만 14세 이상 여부 확인, 부정이용 방지
항목 : 이름, 생년월일, 성별, 내·외국인 구분, 휴대폰번호, 통신사, 연계정보(CI), 중복가입확인정보(DI)
처리위탁 : 토스페이먼츠, NICE
보유기간 : 회원 탈퇴 시까지

부칙 : 본 동의서는 2026년 8월 1일부터 적용됩니다.
회사명 : ㈜위닝에듀
대표자 : 강원석
사업자등록번호 : 266-88-03449
주소 : 세종특별자치시 마음안1로61, 404호
개인정보 보호책임자 문의처 : 051-902-0080`;

export default function StudentIdentity() {
  return (
    <TermsPageLayout
      pageTitle="이용약관"
      title="학생회원 본인 인증을 위한 정보 수집"
      effectiveDate="2026-08-01"
    >
      <TermsArticleBody text={BODY} />
    </TermsPageLayout>
  );
}
