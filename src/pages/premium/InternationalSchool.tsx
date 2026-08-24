import { PremiumHero } from "@/components/premium";

// 국제학교 학습관리(프리미엄) 랜딩 — /page/premium/international-school.
// 구 CMS(page_contents slug 'premium/international-school')는 title "국제학교 학습관리"뿐이고
// 본문(body)이 비어 있어 이식할 카피가 없다 — 시안 확정 전까지 히어로만 갖춘 러프 스켈레톤
// (premium-db-decouple 범위: 카피 창작 금지, 자리만 확보). 다른 프리미엄 코드 페이지(대학원입학·
// 해외명문대 등)가 시안을 확보한 뒤 섹션을 조합한 것과 달리 이 페이지는 그 전 단계다.
// 헤더/푸터는 SiteLayout이 렌더한다(개별 import 안 함). 대입컨설팅 A/S 전용 탭바
// (PremiumProgramTabs)는 이 프로그램 시안에 없어 렌더하지 않는다.

// 배경은 해외명문대 진학컨설팅(hero-overseas-bg.webp)과 동일 자산을 임시로 재사용한다 —
// "국제학교"에 쓸 전용 히어로 사진이 아직 없다(시안 미확정). 전용 에셋이 확보되면 교체한다.
const HERO_BG = "/images/premium/hero-overseas-bg.webp";
const HERO_GLOW_CLASS =
  "bg-gradient-to-r from-black/75 via-black/45 to-transparent";
const HERO_TITLE_CLASS =
  "break-keep text-[1.75rem] font-bold leading-[1.4] tracking-[-0.02em] text-white sm:text-[2rem]";
const HERO_EYEBROW_CLASS =
  "mb-2 block text-[1rem] font-semibold uppercase tracking-[0.08em] text-gold sm:text-[1.125rem]";

export default function InternationalSchool() {
  return (
    <main className="min-h-screen bg-white pt-16">
      <PremiumHero
        align="left"
        title={
          <>
            <span className={HERO_EYEBROW_CLASS}>프리미엄</span>
            국제학교 학습관리
          </>
        }
        description={null}
        cta={{ label: "상담 신청하기", to: "/premium-apply" }}
        bgSrc={HERO_BG}
        glowClassName={HERO_GLOW_CLASS}
        titleClassName={HERO_TITLE_CLASS}
      />
    </main>
  );
}
