// 멘토신청(/mentor-apply) §1 히어로 — docs/mentor-apply-spec.md §1.
//
// 구조: 풀블리드 배경 사진(1920×816) 위에 딤 1장 + 좌측 정렬 텍스트 컬럼(아이브로 / H1 2줄 / CTA).
//
// 왜 새로 만들었는가 —
//   기존 서비스 4종 히어로(InDepthResearch 등)는 그라디언트 배경 + 브라우저 프레임 목업 구조라
//   사진 풀블리드와 공유할 골격이 없다. CTA 도 `callmentor/CmButton.jsx` 는 radius 가 다르고
//   (시안 20px vs CmButton 고정값) 시안 padding(24·32)과도 어긋나 명세에서 "확장 필요" 판정을
//   받았다 — CmButton 을 고치면 콜멘토 페이지가 회귀하므로 히어로 CTA 는 이 파일에서 앵커로 만든다.
//
// 카피는 src/data/mentorApply.js(HERO_COPY), 이미지 경로는 src/data/mentorApplyAssets.js 만
// 참조한다. 리터럴을 박지 마라.
import type { CSSProperties } from "react";
import { HERO_COPY } from "../../data/mentorApply";
import { MENTOR_ASSETS } from "../../data/mentorApplyAssets";

// CTA 앵커 타깃 id.
//
// ⚠ 시안에 CTA 목적지가 정의돼 있지 않다(명세 §1 인터랙션 / 확인 항목 ①). 같은 페이지 하단
//   y=3638~9868 에 지원서 폼이 있으므로 **폼으로 인페이지 스크롤**로 추정 구현한다.
//   폼 영역(FormSectionCard 의 `id` 규약, 명세 §6-3 사이드바 앵커와 같은 계열)이 이 id 를 달아야
//   동작한다 — 폼 담당이 폼 래퍼에 `id={MENTOR_FORM_ANCHOR_ID}` + `scroll-mt-24`(fixed 헤더 h-16
//   보정, BoardListPage.jsx:198 선례)를 붙이는 것을 전제로 한다. 목적지가 외부 페이지로 확정되면
//   아래 상수 대신 <Link to> 로 바꾸면 된다.
export const MENTOR_FORM_ANCHOR_ID = "mentor-apply-form";

export default function MentorHero() {
  return (
    // 세로 리듬(명세 §1): 상단 329 + 콘텐츠 334 + 하단 153 = 816(51rem). 고정 높이 대신 패딩으로
    // 쌓아 카피가 길어져도 잘리지 않게 한다. min-h 는 안전망 겸 모바일 최소 높이다.
    // <lg 는 768/375 시안이 없어 구현 재량(확인 항목 ㊺) — 패딩/폰트만 축소하고 구성은 유지한다.
    <section
      className="relative isolate flex min-h-[26rem] items-center overflow-hidden pb-16 pt-16 sm:min-h-[32rem] sm:pb-20 sm:pt-24 lg:min-h-[51rem] lg:pb-[9.5625rem] lg:pt-[20.5625rem]"
      aria-labelledby="mentor-hero-heading"
    >
      {/* 배경 사진(3362:2758). Figma 렌더 파라미터 width:100%/height:156.88%/top:-22.74% 의
          CSS 등가가 cover + center 40% 다(명세 §1 배경 처리).
          장식 이미지라 alt="" + aria-hidden — 의미는 옆의 H1 카피가 전달한다.
          원본 4096×2731 PNG(17.6MB)는 WebP 768/1280/1920 세트로 교체했다(원본은 삭제).
          LCP 리소스라 fetchpriority="high" 유지, loading="lazy" 는 붙이지 않는다.
          width/height 는 srcSet 기본값(1280w) 기준 비율로 둬서 CLS 를 막는다. */}
      <img
        src={MENTOR_ASSETS.heroBg.src}
        srcSet={MENTOR_ASSETS.heroBg.srcSet}
        sizes="100vw"
        alt=""
        aria-hidden="true"
        width={1280}
        height={854}
        fetchPriority="high"
        decoding="async"
        className="absolute inset-0 -z-10 h-full w-full object-cover object-[center_40%]"
      />

      {/* 스크림 2장 — 회사소개 MissionSection(CompanyNews.jsx:393-457) 방식을 값 복붙으로 이식.
          docs/mentor-apply-spec.md §F-2, 사용자가 2026-08-11 선택지 3개 중 이 안을 명시 확정.
          명세 §1(:131 "그라디언트 아님", :137 eyebrow #013262)에 대한 의도적 이탈이다 —
          시안 딤 0.2 단색으로는 아이브로 #013262 min CR 1.00(59.0% 미달), H1 흰색 1.87(64.9%
          미달)로 이미 AA 실패이고, 네이비 아이브로는 배경 휘도 상한(0.80 알파 검정 스크림이어도
          최대 CR 3.04) 때문에 어떤 스크림으로도 회생 불가 — 아이브로 색 변경이 유일한 해법이라
          텍스트 색까지 함께 바꿨다(CTA 배경 #013262 는 유지, 아래 참고).
          분기점은 회사소개의 sm(640)이 아니라 lg(1024)로 올렸다 — 회사소개 그라디언트를 그대로
          이식해 768에서 실측한 결과 H1 흰색이 minCR 2.23(9.7% 미달)로 깨지고, 평면 0.75로 덮으면
          768에서 0% 미달로 통과하기 때문(§F-2 분기점 실측 표). */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 lg:hidden"
        style={{ background: "rgba(0,0,0,0.75)" }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 hidden lg:block"
        style={
          {
            "--c": "min(100%, 72.75rem)",
            "--x0": "calc(50% - var(--c) / 2)",
            background:
              "linear-gradient(to right, rgba(0,0,0,0.80) 0, rgba(0,0,0,0.80) var(--x0), rgba(0,0,0,0.69) calc(var(--x0) + var(--c) * 0.25), rgba(0,0,0,0.54) calc(var(--x0) + var(--c) * 0.50), rgba(0,0,0,0.35) calc(var(--x0) + var(--c) * 0.75), rgba(0,0,0,0.12) calc(var(--x0) + var(--c)), rgba(0,0,0,0.12) 100%)",
          } as CSSProperties
        }
      />

      {/* 시안 좌측 기준선 410px 은 본문 컨테이너(x=402)와 8px 차이나는 제작 오차라, 명세
          § 반응형 전략 컨테이너 매핑대로 본문과 동일한 max-w-content 컨테이너로 스냅한다. */}
      <div className="mx-auto w-full max-w-content px-5 sm:px-8">
        <div className="max-w-[41rem]">
          {/* 아이브로 24px Medium / lh 1.3 / ls -2%. 시안 색은 primary(#013262) 지만 min CR 1.00
              (59.0% 미달)로 회생 불가라 white/70 로 교체했다(§F-2 후보 표, white/60 은 19.0%
              미달이라 불가·white/70 이 전 뷰포트 0% 미달 최소값). textShadow 는 MissionSection
              (CompanyNews.jsx:448)과 동일 값. */}
          <p
            className="break-keep text-[1.125rem] font-medium leading-[1.3] tracking-[-0.02em] text-white/70 sm:text-[1.25rem] lg:text-[1.5rem]"
            style={{ textShadow: "0 0.1875rem 0.9375rem rgba(0,0,0,0.4)" }}
          >
            {HERO_COPY.eyebrow}
          </p>

          {/* H1 44px Bold / lh 1.4 / ls -2% / 흰색. 시안이 하드 개행으로 2줄을 쪼갰고 두 줄 모두
              흰색이라 단일 색이다. 줄 자체는 <span className="block"> 로 유지하되, 좁은 화면에서
              한 줄이 더 접히는 것은 자연 줄바꿈에 맡긴다(break-keep 으로 어절 단위 유지).
              textShadow 추가 — 스크림만으로도 AA 는 통과하나 사진 디테일 위 가장자리 흐림을 막는
              MissionSection 관용을 그대로 이식(§F-2 :4). */}
          <h1
            id="mentor-hero-heading"
            className="mt-3 break-keep text-[1.75rem] font-bold leading-[1.4] tracking-[-0.02em] text-white sm:text-[2.25rem] lg:text-[2.75rem]"
            style={{ textShadow: "0 0.1875rem 0.9375rem rgba(0,0,0,0.4)" }}
          >
            {HERO_COPY.headingLines.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </h1>

          {/* CTA 218×76 / bg #013262 / radius 20 / padding 24·32 / 라벨 20 SemiBold 흰색.
              라벨 원문에 `하기` 와 `→` 사이 공백이 2칸 들어 있다(HERO_COPY.ctaLabel 주석 참고).
              HTML 은 연속 공백을 1칸으로 접으므로 whitespace-pre 로 원문을 보존한다
              (동시에 nowrap 역할도 겸한다 — 시안 white-space: nowrap).
              hover/focus 는 시안 미정의라 저장소 관례(PrimaryButton.jsx: hover:bg-primary/90 +
              active:scale)를 따랐다. */}
          <a
            href={`#${MENTOR_FORM_ANCHOR_ID}`}
            className="mt-8 inline-flex items-center justify-center whitespace-pre rounded-[1.25rem] bg-primary px-6 py-4 text-[1.125rem] font-semibold leading-[1.4] text-white transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary active:scale-[0.97] motion-reduce:active:scale-100 sm:mt-12 sm:px-8 sm:py-6 sm:text-[1.25rem] lg:mt-[5.6875rem]"
          >
            {HERO_COPY.ctaLabel}
          </a>
        </div>
      </div>
    </section>
  );
}
