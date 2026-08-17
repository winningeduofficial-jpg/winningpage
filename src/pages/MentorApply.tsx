// 이용신청 > 멘토신청 (Figma 3362:2755, 1920×10722) 페이지 본체.
// 정본 명세는 docs/mentor-apply-spec.md (읽기 전용 — 커밋 대상 아님).
//
// 러프 구현 목표 — 픽셀 재현이 아니라 섹션 구조·카피·컬러 위계 재현이다.
//
// 셸 구조는 premium-apply / callmentor 선례를 그대로 따른다:
//   - 헤더/푸터는 App.jsx 의 <Route element={<SiteLayout />}> 가 감싼다. 이 페이지가
//     Header/SiteFooter 를 직접 import 하지 않는다.
//   - Header 가 fixed + h-16(4rem) 이므로 루트에 pt-16 보정을 둔다. 시안 헤더는 148px 이지만
//     기존 헤더 높이를 유지하는 것이 확정 방침이다(명세 §0 헤더).
//   - 히어로는 헤더 아래에서 시작한다(오버랩 없음).
//
// 카피는 전부 src/data/mentorApply.js 를 import 해서 쓴다 — 섹션 컴포넌트에 리터럴을 박지 마라.
// (이 파일은 카피를 하나도 갖지 않는다. 각 섹션 컴포넌트가 자기 카피를 직접 import 한다.)
//
// 섹션 간 세로 간격 규약 — ServiceSection 은 pb 를 갖지 않는다(pt 만 있다). 그래서 "경계 갭은
// 뒤 섹션의 pt 가 흡수한다"가 이 저장소 규칙이고, 예외적으로 밴드(배경색이 있는 섹션)만
// 자기 pb 를 직접 진다. 아래 배치도 그 규칙을 따른다:
//   §2(softGray 밴드) 자체 pt/pb 150 → §3 은 잔여분만 → §4 는 자체 기본 pt 140 →
//   §5 는 자체 pt/pb → §6(softGray 밴드) 자체 pt/pb 142 → §7 은 자체 pt 88.
//
// ⚠ 문서 타이틀(document.title) 설정은 넣지 않았다. 이 저장소에는 페이지별 타이틀을 세팅하는
//    공통 처리가 아예 없다(`grep -rn "document.title" src/` 결과 0건, PremiumApply 포함).
//    이 페이지만 넣으면 다른 페이지로 이동했을 때 타이틀이 남아 오히려 어긋난다.
import BenefitSection from "@/components/mentorApply/BenefitSection";
import CounselFieldSection from "@/components/mentorApply/CounselFieldSection";
import MajorCategorySection from "@/components/mentorApply/MajorCategorySection";
import MentorApplyForm from "@/components/mentorApply/MentorApplyForm";
import MentorFaq from "@/components/mentorApply/MentorFaq";
import MentorHero from "@/components/mentorApply/MentorHero";
import SelectionTimeline from "@/components/mentorApply/SelectionTimeline";
import ServiceSection from "@/components/services/ServiceSection";

export default function MentorApply() {
  return (
    <main className="min-h-screen bg-white pt-16">
      {/* §1 히어로 — 자체 <section> + 배경 사진/딤을 전부 소유한다. */}
      <MentorHero />

      {/* §2 모집 대상 계열 — softGray 밴드. 상하 패딩 150 을 자체 소유한다. */}
      <MajorCategorySection />

      {/* §3 활동 혜택 — 흰 배경.
          §2 밴드가 이미 pb 150 을 지고 있으므로 시안의 §2↔§3 간격 173.75 중 잔여분(≈24)만 준다.
          <lg 에서는 ServiceSection 기본 pt-16 sm:pt-20 이 그대로 적용된다. */}
      <BenefitSection className="lg:pt-6" />

      {/* §4 상담 분야 — 풀블리드 가로 스크롤 트랙. §3↔§4 간격 140 을 기본 className 으로 갖고
          있으므로 그대로 둔다(CounselFieldSection 기본값 = 'lg:pt-[8.75rem]'). */}
      <CounselFieldSection />

      {/* §5 선발 절차 — 흰 배경(명세 §5 에 배경색 지정 없음 = 페이지 기본).
          SelectionTimeline 이 h2 를 직접 렌더하므로 ServiceSection 에 heading 을 넘기면
          h2 가 둘이 된다 — 넘기지 않는다. */}
      <ServiceSection className="pb-16 sm:pb-20 lg:pb-[10.625rem] lg:pt-[9.375rem]">
        <SelectionTimeline />
      </ServiceSection>

      {/* §6 지원서 폼 — softGray 밴드. 폼 헤더 + 작성현황 사이드바 + 섹션 5장 + 취소 안내 +
          제출 버튼 + 제출 연동까지 전부 이 컴포넌트가 소유한다(히어로 CTA 앵커 타깃도 여기). */}
      <MentorApplyForm />

      {/* §7 FAQ — 자체 ServiceSection + pt 88 을 소유한다.
          ⚠ 답변 카피 5개가 아직 미확보다. 다만 그 이유로 섹션 자체를 숨기지는 않는다 —
          헤더 + 질문 5개는 답변 유무와 무관하게 항상 렌더하고, 빈 답변만 프로덕션에서
          "답변을 준비 중입니다." 로 대체한다(MentorFaq.jsx 파일 주석). */}
      <MentorFaq />
    </main>
  );
}
