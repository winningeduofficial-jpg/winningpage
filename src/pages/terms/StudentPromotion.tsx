// 학생회원 합격사례·후기 홍보 활용 동의 — docs/login-signup-renewal-spec.md §3.3[F](노드
// 2393:9941). 시안 소제목이 2393-9843("학생회원 마케팅 목적의 개인정보 수진 및 이용")과 동일하게
// 표기되어 있으나 내용은 "합격사례·후기 홍보 활용 동의"로 서로 다른 별개 문서다(§3.3 F: "9843과
// 제목이 같으나 내용 상이 — 확인 필요"). 혼동을 피하기 위해 이 페이지의 타이틀은 시안의 중복
// 제목 대신 개인정보처리방침(terms-fulltext.md 2393:9483)에 실제 등장하는 항목명
// "합격사례·학습후기 홍보 활용"과 본문 첫 문장("합격 사례, 성적 향상 사례 및 서비스 이용후기")을
// 조합해 그대로 유지한다(§6.3 R5 유형의 시안 불일치를 임의로 통일하지 않고, 이미 확정된 실제
// 페이지 제목을 유지).
// 전문(도입부 + 1~8항 + 부칙/사업자정보, 표는 별도 프레임 2393:9974)은
// docs/terms-fulltext-2.md(Figma MCP 2차 추출, 노드 2393-9941 / 소제목 2393:9972 / 본문
// 2393:9973)에서 확보됨 — 기존 §3.3 F 표 요약 기반 재구성 문안(TermsPendingNotice)을 실제 원문
// 전문으로 교체했다. "2. 수집 및 활용 항목 -> 여기는 표" 디자이너 메모(§6.3)에 따라 표를
// TermsSection으로 렌더링한다.
// 표 셀 원문의 "학격 학교・학과"는 시안 원문 자체의 오타로 추정된다(문서 주석: "'합격'의 오타로
// 추정 — 본문 텍스트에는 '합격 학교·학과'로 표기"). 표와 본문 표기를 일치시키기 위해 본문과
// 동일한 "합격 학교·학과"로 표기한다(임의 재구성이 아니라 동일 문서 내 이미 확정된 정본 표기를
// 따른 것).
import TermsPageLayout, {
  TermsSection,
} from "@/components/auth/TermsPageLayout";

export default function StudentPromotion() {
  return (
    <TermsPageLayout
      pageTitle="이용약관"
      title="학생회원 합격사례·후기 홍보 활용 동의"
      effectiveDate="2026-08-01"
    >
      <p className="text-xs leading-[1.85] text-ink">
        위닝에듀(이하 "회사")는 회원의 합격 사례, 성적 향상 사례 및 서비스
        이용후기를 다른 회원 및 예비 회원에게 소개하기 위한 홍보 자료로
        활용하고자 합니다. 본 동의는 전적으로 선택 사항이며, 동의하지
        않으시더라도 서비스 이용에 어떠한 불이익도 없습니다.
      </p>

      <TermsSection title="1. 활용 목적">
        <ul className="list-inside list-disc text-xs leading-[1.85] text-ink">
          <li>
            합격사례·성적 향상 사례 및 학습후기의 홈페이지·앱·SNS·광고·설명회
            자료 등 게재
          </li>
          <li>신규 서비스 소개 및 예비 회원 대상 서비스 신뢰도 안내</li>
        </ul>
      </TermsSection>

      <TermsSection title="2. 수집 및 활용 항목">
        <table className="w-full border-collapse text-xs text-ink">
          <thead>
            <tr className="border-b border-line text-left">
              <th className="py-2 pr-4 font-semibold">항목</th>
              <th className="py-2 font-semibold">내용</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-line align-top">
              <td className="py-2 pr-4">기본 표기 정보</td>
              <td className="py-2">
                성명(또는 이니셜·닉네임 중 선택), 출신 학교명(선택 표기)
              </td>
            </tr>
            <tr className="border-b border-line align-top">
              <td className="py-2 pr-4">입시 결과 정보</td>
              <td className="py-2">
                합격 학교·학과, 전형 유형(수시/정시/특목고), 이용 서비스명
              </td>
            </tr>
            <tr className="align-top">
              <td className="py-2 pr-4">후기 콘텐츠</td>
              <td className="py-2">
                이용후기 텍스트, 사진·영상(별도 동의 시에 한하여 수집)
              </td>
            </tr>
          </tbody>
        </table>
      </TermsSection>

      <TermsSection title="3. 표기 방식 선택">
        <p className="text-xs leading-[1.85] text-ink">
          회원은 아래 중 원하는 표기 방식을 선택할 수 있으며, 별도 요청이 없는
          경우 이니셜(익명) 처리를 원칙으로 합니다.
        </p>
        {/* 실제 인터랙션이 없는 약관 문서용 장식 체크박스 문자(☐)라 label이 아니다 —
            체크할 대상 input이 없다. */}
        <div className="flex flex-col gap-2 text-xs leading-[1.85] text-ink">
          <p className="flex items-center gap-2">
            <span aria-hidden="true">☐</span>
            실명 및 출신 학교명 공개에 동의합니다.
          </p>
          <p className="flex items-center gap-2">
            <span aria-hidden="true">☐</span>
            이니셜(익명) 처리를 희망합니다.
          </p>
          <p className="flex items-center gap-2">
            <span aria-hidden="true">☐</span>
            사진·영상 자료 활용에 동의합니다. (해당 시)
          </p>
        </div>
      </TermsSection>

      <TermsSection title="4. 보유 및 이용 기간">
        <p className="text-xs leading-[1.85] text-ink">
          동의 철회 시 또는 회원 탈퇴 시까지 활용하며, 철회 이후 신규 제작되는
          홍보물에는 사용하지 않습니다. 다만 철회 이전에 이미 배포·게재된
          인쇄물, 방송, 온라인 게시물 등은 즉시 회수가 어려울 수 있음을 미리
          안내드립니다.
        </p>
      </TermsSection>

      <TermsSection title="5. 제3자 제공(위탁)">
        <p className="text-xs leading-[1.85] text-ink">
          홍보물 제작·집행을 위하여 광고 대행사, 인쇄·영상 제작업체 등에 필요한
          범위 내에서 제공될 수 있으며, 목적 외 용도로는 사용되지 않습니다.
        </p>
      </TermsSection>

      <TermsSection title="6. 미성년 회원의 경우">
        <p className="text-xs leading-[1.85] text-ink">
          회원이 만 14세 미만이거나 만 19세 미만으로 법정대리인 동의가 필요한
          경우, 본 동의는 법정대리인의 동의를 함께 받은 경우에 한하여
          유효합니다.
        </p>
      </TermsSection>

      <TermsSection title="7. 동의 거부 권리 및 불이익">
        <p className="text-xs leading-[1.85] text-ink">
          본 동의에 응하지 않을 권리가 있으며, 동의하지 않거나 이후 철회하더라도
          서비스 이용 자격, 요금, 혜택 등에 어떠한 불이익도 발생하지 않습니다.
        </p>
      </TermsSection>

      <TermsSection title="8. 동의 철회">
        <p className="text-xs leading-[1.85] text-ink">
          마이페이지 [내 정보 관리] 또는 개인정보 보호책임자를 통해 언제든지
          동의를 철회할 수 있습니다.
        </p>
      </TermsSection>

      <div className="flex flex-col gap-1 text-xs leading-[1.85] text-ink">
        <p>부칙 : 본 동의서는 2026년 8월 1일부터 적용됩니다.</p>
        <p>회사명 : ㈜위닝에듀</p>
        <p>대표자 : 강원석</p>
        <p>사업자등록번호 : 266-88-03449</p>
        <p>주소 : 세종특별자치시 마음안1로61, 404호</p>
        <p>개인정보 보호책임자 문의처 : 051-902-0080</p>
      </div>
    </TermsPageLayout>
  );
}
