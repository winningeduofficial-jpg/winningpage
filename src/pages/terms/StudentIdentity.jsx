// 학생회원 본인 인증을 위한 정보 수집 — docs/login-signup-renewal-spec.md §3.3[F](노드 2393-9745).
// terms-fulltext.md에 이 문서의 전문 추출본은 없다("없으면 명세 문구 + placeholder TODO 법무검수"
// 원칙 적용). 아래 항목/목적/처리위탁/보유기간은 (1) §3.3 F 표에 명시된 항목("목적/항목(CI·DI
// 포함)/처리위탁(토스페이먼츠, NICE)/보유기간")과 (2) docs/terms-fulltext.md(2393:9483 개인정보
// 처리방침) 중 본인인증·법정대리인 동의 관련 실제 추출 문구(제7조, "본인인증 및 보호자-학생
// 연동" 항목, 3장 "만 14세 미만 아동의 개인정보 처리")를 그대로 조합한 것이며, 조문 형태의
// 정식 법무 문안은 아직 확보되지 않아 TermsPendingNotice로 표시했다.
// 시안 원본은 본문 18px(다른 약관 페이지 12px과 불일치, §6.3 이슈)이나, 이 구현은 §5.4 공통
// 토큰(12px)을 그대로 따르고 불일치는 주석으로만 남긴다 — 임의로 새 폰트 크기를 만들지 않음.
import TermsPageLayout, { TermsSection, TermsPendingNotice } from '../../components/auth/TermsPageLayout';

export default function StudentIdentity() {
  return (
    <TermsPageLayout title="학생회원 본인 인증을 위한 정보 수집">
      <TermsSection title="1. 수집 목적">
        <p className="text-xs leading-[1.85] text-ink">
          회사는 회원 식별, 부정이용 방지, 만 14세 미만 회원가입 시 법정대리인 동의 확인, 학부모-학생
          보호자 관계 확인(연동)을 위하여 본인인증정보를 수집·이용합니다.
        </p>
      </TermsSection>

      <TermsSection title="2. 수집 항목">
        <ul className="list-inside list-disc text-xs leading-[1.85] text-ink">
          <li>공통: 이름, 생년월일, 본인인증정보(휴대전화번호 또는 이메일)</li>
          <li>본인확인 처리 과정에서 생성되는 연계정보(CI)·중복가입확인정보(DI)</li>
          <li>만 14세 미만 회원가입 시: 법정대리인 성명·연락처·중복가입확인정보(DI)</li>
        </ul>
      </TermsSection>

      <TermsSection title="3. 처리위탁">
        <p className="text-xs leading-[1.85] text-ink">
          회사는 본인확인 업무를 아래 수탁업체에 위탁하여 처리합니다.
        </p>
        <ul className="list-inside list-disc text-xs leading-[1.85] text-ink">
          <li>NICE평가정보 등: 본인확인 서비스</li>
          <li>토스페이먼츠 PG사: 결제·정기결제(빌링) 처리 과정의 본인확인 연동</li>
        </ul>
      </TermsSection>

      <TermsSection title="4. 보유기간">
        <p className="text-xs leading-[1.85] text-ink">
          본인인증정보는 회원 탈퇴 시까지 보유하며, 법정대리인 동의 확인 목적으로만 수집한 정보는
          동의 확인 목적 달성 시까지 보유 후 지체 없이 파기합니다.
        </p>
      </TermsSection>

      <TermsPendingNotice>
        TODO(법무검수): 본 페이지는 Figma 시안 원문(노드 2393-9745) 전문이 추출되지 않아, §3.3
        F 표의 요약 항목과 개인정보처리방침(2393:9483) 중 관련 문구를 조합해 구성했습니다. 정식
        조항 문안·CI/DI 처리에 관한 세부 고지 문구는 법무 검수 후 확정이 필요합니다.
      </TermsPendingNotice>
    </TermsPageLayout>
  );
}
