// 학생회원 합격사례·후기 홍보 활용 동의 — docs/login-signup-renewal-spec.md §3.3[F](노드
// 2393:9941). 시안 제목이 9843("마케팅 목적의 개인정보 수집 및 이용")과 동일하게 표기되어 있으나
// 내용은 "합격사례·후기 홍보 활용 동의"로 서로 다른 별개 문서다(§3.3 F: "9843과 제목이 같으나
// 내용 상이 — 확인 필요"). 혼동을 피하기 위해 이 페이지의 타이틀은 시안의 중복 제목 대신
// 개인정보처리방침(2393:9483)에 실제 등장하는 항목명 "합격사례·학습후기 홍보 활용"을 그대로
// 사용했다(§6.3 R5 유형의 시안 불일치를 임의로 통일하지 않고, 이미 추출된 실제 문구로 대체).
// "2. 수집 및 활용 항목 -> 여기는 표" 디자이너 메모(§6.3)에 따라 표를 렌더링하되, 8개 항목·
// 체크박스 3개의 정확한 문구는 원문 추출본이 없어 TermsPendingNotice로 표시했다.
import TermsPageLayout, { TermsSection, TermsPendingNotice } from '../../components/auth/TermsPageLayout';

export default function StudentPromotion() {
  return (
    <TermsPageLayout title="학생회원 합격사례·후기 홍보 활용 동의">
      <TermsSection title="1. 활용 목적">
        <p className="text-xs leading-[1.85] text-ink">
          회사는 서비스 홍보를 위하여 회원의 합격사례·학습후기를 서비스 화면, 홈페이지, 광고 등에
          게시·활용할 수 있습니다. 본 동의는 선택 사항이며, 동의하지 않아도 서비스 이용에 제한이
          없습니다.
        </p>
      </TermsSection>

      <TermsSection title="2. 수집 및 활용 항목">
        <table className="w-full border-collapse text-xs text-ink">
          <thead>
            <tr className="border-b border-line text-left">
              <th className="py-2 pr-4 font-semibold">수집 항목</th>
              <th className="py-2 pr-4 font-semibold">활용 목적</th>
              <th className="py-2 font-semibold">보유기간</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-line align-top">
              <td className="py-2 pr-4">이름(또는 이니셜), 합격 대학·학과</td>
              <td className="py-2 pr-4">합격사례 게시</td>
              <td className="py-2">동의 철회 또는 게시 중단 요청 시까지</td>
            </tr>
            <tr className="border-b border-line align-top">
              <td className="py-2 pr-4">학습·합격 후기</td>
              <td className="py-2 pr-4">학습후기 게시</td>
              <td className="py-2">동의 철회 또는 게시 중단 요청 시까지</td>
            </tr>
            <tr className="align-top">
              <td className="py-2 pr-4">사진(제공 동의 시)</td>
              <td className="py-2 pr-4">합격사례·학습후기 게시(사진 첨부)</td>
              <td className="py-2">동의 철회 또는 게시 중단 요청 시까지</td>
            </tr>
          </tbody>
        </table>
      </TermsSection>

      <TermsSection title="3. 개별 동의">
        <div className="flex flex-col gap-2 text-xs leading-[1.85] text-ink">
          <label className="flex items-center gap-2">
            <span aria-hidden="true">☐</span>
            이름(또는 이니셜)·합격 대학·학과 게시에 동의합니다.
          </label>
          <label className="flex items-center gap-2">
            <span aria-hidden="true">☐</span>
            학습·합격 후기 게시에 동의합니다.
          </label>
          <label className="flex items-center gap-2">
            <span aria-hidden="true">☐</span>
            사진 제공 및 게시에 동의합니다.
          </label>
        </div>
      </TermsSection>

      <TermsSection title="4. 법적 근거 및 철회">
        <p className="text-xs leading-[1.85] text-ink">
          법적 근거: 정보주체의 동의. 회원은 마이페이지 또는 고객센터를 통해 언제든지 동의를
          철회하거나 게시 중단을 요청할 수 있으며, 요청 접수 후 지체 없이 삭제합니다.
        </p>
      </TermsSection>

      <TermsPendingNotice>
        TODO(법무검수): 시안(노드 2393:9941)의 정식 1~8항 조문과 체크박스 3개의 정확한 문구는
        원문 추출본이 없어("확인 필요"), 개인정보처리방침(2393:9483) "합격사례·학습후기 홍보
        활용" 항목을 기준으로 구성했습니다. 표 구성·체크박스 그룹핑은 디자이너·법무 검수 후
        확정이 필요합니다.
      </TermsPendingNotice>
    </TermsPageLayout>
  );
}
