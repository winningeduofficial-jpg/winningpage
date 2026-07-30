// 학부모회원 마케팅 목적의 개인정보 수집 및 이용 — docs/login-signup-renewal-spec.md
// §3.3[F](노드 2393:9549). §6.1: "마케팅 동의 1~6항 + 부칙" — 부칙(시행일) 자체 문구는
// terms-fulltext.md/명세 어디에도 원문이 없어("확인 필요" 대상) effectiveDate를 임의로
// 채우지 않고 TermsPendingNotice로만 표시했다. 수집 항목·채널·수신거부 절차는
// 개인정보처리방침(2393:9483)의 "마케팅 및 광고 (선택)" 항목과 이용약관 제36조(정보의 제공 및
// 마케팅 정보 수신거부) 실제 추출 문구를 조합했다(StudentMarketing.jsx와 동일 원천).
import TermsPageLayout, { TermsSection, TermsPendingNotice } from '../../components/auth/TermsPageLayout';

export default function ParentMarketing() {
  return (
    <TermsPageLayout title="학부모회원 마케팅 목적의 개인정보 수집 및 이용">
      <TermsSection title="1. 수집 목적">
        <p className="text-xs leading-[1.85] text-ink">
          회사는 신규 서비스·이벤트·혜택 등 마케팅 정보를 안내하기 위한 목적으로 개인정보를
          수집·이용합니다. 본 동의는 선택 사항이며, 동의하지 않아도 서비스 이용에 제한이 없습니다.
        </p>
      </TermsSection>

      <TermsSection title="2. 수집 항목">
        <ul className="list-inside list-disc text-xs leading-[1.85] text-ink">
          <li>이름, 아이디, 휴대전화번호, 이메일, 카카오정보</li>
        </ul>
      </TermsSection>

      <TermsSection title="3. 발송 채널">
        <p className="text-xs leading-[1.85] text-ink">
          회사는 이메일, 문자메시지(SMS), 카카오톡 등 전자적 방법으로 마케팅 정보를 제공할 수
          있습니다.
        </p>
      </TermsSection>

      <TermsSection title="4. 법적 근거 및 보유기간">
        <p className="text-xs leading-[1.85] text-ink">
          법적 근거: 정보주체의 동의. 보유기간: 동의 철회 시까지이며, 철회 즉시 광고성 정보 전송을
          중단합니다.
        </p>
      </TermsSection>

      <TermsSection title="5. 동의 철회(수신거부)">
        <p className="text-xs leading-[1.85] text-ink">
          회원은 마이페이지 또는 각 채널에서 제공하는 수신거부 절차를 통해 언제든지 마케팅 정보
          수신 동의를 철회할 수 있습니다. 다만 계약내용 변경, 약관 개정, 서비스 중단 등 회원이
          반드시 알아야 하는 공지사항은 수신동의 여부와 관계없이 안내될 수 있습니다.
        </p>
      </TermsSection>

      <TermsPendingNotice>
        TODO(법무검수): 시안(노드 2393:9549)의 "마케팅 동의 1~6항 + 부칙" 원문이 별도 추출되지
        않아, 개인정보처리방침·이용약관 제36조 문구로 대체 구성했습니다. 부칙 시행일과 정식 1~6항
        조문은 법무 검수 후 확정이 필요합니다.
      </TermsPendingNotice>
    </TermsPageLayout>
  );
}
