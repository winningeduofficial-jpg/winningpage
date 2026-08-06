import { useEffect, useState } from 'react';
import MentorSection from '../../components/landing/MentorSection';
import ServiceSection from '../../components/services/ServiceSection';
import ServiceAudienceCards from '../../components/services/ServiceAudienceCards';
import ServiceTestimonials from '../../components/services/ServiceTestimonials';
import CmButton from '../../components/callmentor/CmButton';
import { supabase } from '../../lib/supabase';
import { alertServiceNotReady } from '../../lib/paidServiceAccess';
import heroCallMockup from '../../assets/callmentor/hero-call-mockup.webp';
import stepDiagnosis from '../../assets/callmentor/step-diagnosis.jpg';
import stepMentorMatch from '../../assets/callmentor/step-mentor-match.jpg';
import stepCall from '../../assets/callmentor/step-call.jpg';
import stepReview from '../../assets/callmentor/step-review.jpg';
import audienceCareer from '../../assets/callmentor/audience-career.png';
import audienceEntranceExam from '../../assets/callmentor/audience-entrance-exam.png';
import audienceStudyMethod from '../../assets/callmentor/audience-study-method.jpg';
import audienceMotivation from '../../assets/callmentor/audience-motivation.png';
import iconValueCheck from '../../assets/callmentor/icon-value-check.svg';
import iconValuePlan from '../../assets/callmentor/icon-value-plan.svg';
import iconValueCard from '../../assets/callmentor/icon-value-card.svg';

/**
 * 콜멘토 랜딩 — 골드(#AF9364 · #BF923D) 강조색과 검정 하단 CTA 밴드를 사수한 프리미엄
 * 포지셔닝 페이지(사용자 확정). 나머지 5개 서비스 랜딩(무료진단·목표관리·수행평가·
 * 자기평가·심화탐구)의 네이비 #013262 로 갈아엎지 않는다 — 골드/블랙은 실수가 아니라
 * 의도된 차별화다. 섹션 구성도 기존 7섹션(Hero / 상담을 통해 / 4단계 진행 순서 /
 * 이런 학생에게 / 멘토스 소개 / 후기 / 하단 CTA) 그대로 고정한다 — 추가・삭제 없음.
 *
 * 이번 리뉴얼로 마크업・간격은 4페이지(심화탐구・자기평가・수행평가・목표관리) 공통
 * 컴포넌트(components/services/)로 수렴했다.
 *   - ServiceSection: §2·§3·§4·§6 섹션 껍데기. §4 전용으로 surface="gray" 확장을 새로
 *     열었다(회색 밴드 #F4F4F6 유지 목적 — 색은 콜멘토 고유값으로 남긴다).
 *   - ServiceAudienceCards: §4 카드 4장. cardSurface="white" 확장을 새로 열었다 — 밴드
 *     위에서 기본값 muted(#F9FAFB)를 쓰면 카드가 밴드 명도와 구분되지 않기 때문.
 *   - ServiceTestimonials: §6 후기 카드 3장 그대로 대체.
 *   - CmButton 포커스 링: variant 가 색을 소유하도록 정리하고, white variant(§7 검정 밴드
 *     위)의 링만 안 보이던 #013262 → #AF9364 로 교체했다(순수 a11y 수정, 배경/라벨색 불변).
 *   - CmSectionHeading 은 폐기했다(죽은 prop 다수 + subColor 기본값이 흰 배경에 흰 글씨를
 *     만드는 지뢰였다). heading 은 ServiceSection.heading 으로, sub 문구는 각 섹션 children
 *     첫 <p>로 흡수했다.
 *
 * 콜멘토 전용으로 남긴 것(공통화하지 않은 이유는 각 섹션 주석 참고):
 *   - §1 Hero: ServiceHeroBrowserFrame 은 브라우저 크롬이 하드코딩돼 있어 손+아이폰 목업으로
 *     대체할 수 없다. 공통 컴포넌트 변경 없이 로컬 마크업 유지. 히어로 비주얼은 node 2700:1362
 *     기반 WebP(알파 채널 포함)로 교체했다(김형준 멘토 정식 사진 오버레이 반영).
 *   - §2 Value 3장: ServiceProcessCards 로 수렴하면 카드 제목의 골드가 공통 톤(#525252)으로
 *     사라진다. 로컬 카드 그리드 유지.
 *   - §3 4단계: 이미지 배경 + 그라데이션 캡션 카드는 텍스트 전용인 기존 공통 컴포넌트가
 *     표현하지 못한다. 호출부가 영구히 1곳이라 신규 공통 컴포넌트 신설도 기각(YAGNI).
 *   - §5 멘토스 소개: MentorSection variant="callmentor" 로 이미 흡수돼 있다(전폭 마퀴 구조라
 *     max-w-content 컨테이너를 강제하는 ServiceSection 으로 감쌀 수 없다).
 *   - §7 하단 CTA(검정 밴드): 호출부 1곳을 위해 SECTION_SURFACE 에 black 항목 + 흰 헤딩용
 *     prop 을 여는 것보다 로컬 <section> 8줄이 단순하다(KISS).
 *
 * 신청/결제/멘토선택 등 하위 플로우는 이번 범위 제외 — 관련 CTA는 앵커 또는 기존 라우트로
 * 임시 연결한다(자세한 내용은 각 CTA 주석 참고).
 *
 * 헤더/푸터는 SiteLayout이 렌더한다 — 이 페이지는 개별 import하지 않는다.
 *
 * 치수 보정(2026-08-07): 시안은 1920 프레임 / 콘텐츠 1440px 기준이지만 실제 가용 폭은
 * 1100px(max-w-content 72.75rem − px-8 좌우)이라, 박스 치수(radius・padding・gap・고정
 * height・아이콘 크기)에는 배율 0.764(1100/1440)를 곱한다. 신규 규칙이 아니라 기존
 * 규약이며 근거는 ServiceTestimonials.jsx 의 "radius 40 → 30.6px" 주석이다. 반면
 * 폰트 크기에는 이 배율을 적용하지 않는다(1:1) — 시안 헤딩 line-box 45px 은
 * lg:text-[2rem] × leading-[1.4] = 44.8px 로 이미 일치하고, 4개 서비스 랜딩의
 * SECTION_HEADING_CLASS 와도 동일하다. §2 카드 타이포는 시안이 24/20px 이었지만
 * 공통 토큰(CARD_TITLE_CLASS 20px / CARD_DESC_CLASS 16px) 크기로 수렴시켰다 — 색만
 * 골드 #AF9364 를 유지했고, 시안 수치보다 코드 규약(공통 토큰)을 우선한 판단이다.
 * 세로 섹션 패딩(lg:pt-* / lg:pb-*)은 이 0.764 대상이 아니다 — 아래 각주에 적힌 기존
 * 4페이지 리듬(경계 합산 × 0.67, 배경 전환 경계는 미적용)을 계속 따르며 이번에 바꾸지
 * 않았다.
 */

// 콘텐츠 컨테이너 — dev 랜딩 정본 토큰 max-w-content(72.75rem) 그대로 사용(다른 페이지와 폭 통일).
// 좌우 여백은 사이트 공통 관례(px-5 sm:px-8). §2·§3·§4·§6은 ServiceSection이 동일 컨테이너를
// 내장하고 있어 이 상수는 §1 Hero・§7 하단 CTA(둘 다 ServiceSection 미사용) 2곳에서만 쓴다.
const CONTAINER = 'mx-auto w-full max-w-content px-5 sm:px-8';

// home_mentor_strategies row → MentorSection/MentorCard props 정규화 (Home.jsx normalizeMentorRow와 동일 로직)
function normalizeMentorRow(row) {
  let titleLines = row.title_lines;
  if (typeof titleLines === 'string') {
    try {
      titleLines = JSON.parse(titleLines);
    } catch {
      titleLines = null;
    }
  }
  const layout = row.photo_layout;
  const hasValidLayout =
    layout && ['top', 'left', 'width', 'height'].every((key) => Number.isFinite(layout[key]));

  return {
    ...row,
    title_lines: Array.isArray(titleLines) && titleLines.length > 0 ? titleLines : null,
    photo: hasValidLayout ? layout : null
  };
}

const VALUE_CARDS = [
  {
    icon: iconValueCheck,
    title: '핵심 문제 1가지',
    desc: '여러 고민 중 지금 가장 발목 잡는 문제를 정확히 짚어드립니다.'
  },
  {
    icon: iconValuePlan,
    title: '실행 계획 3가지',
    desc: '오늘부터 바로 할 수 있는 구체적인 행동으로 정리해드립니다.'
  },
  {
    icon: iconValueCard,
    title: '액션카드 + 재점검',
    desc: '정리된 카드를 받고, 1주 뒤 실천 여부를 다시 확인합니다.'
  }
];

const STEP_CARDS = [
  { caption: '1. 학습 진단', image: stepDiagnosis, alt: '노트북으로 학습 진단을 진행하는 모습' },
  { caption: '2. 내 상황에 맞는 멘토 매칭', image: stepMentorMatch, alt: '책상에서 노트북을 보며 매칭 결과를 확인하는 학생' },
  { caption: '3. 30분 전화 상담', image: stepCall, alt: '전화로 멘토와 상담하는 학생' },
  { caption: '4. 1주 후 실천 재점검', image: stepReview, alt: '노트에 실천 계획을 적는 모습' }
];

// alt 는 두지 않는다 — ServiceAudienceCards 가 item.title 을 alt 로 고정한다(4페이지 규약).
const AUDIENCE_CARDS = [
  {
    title: '진로가 고민인 학생',
    desc: '희망 학과를 못 정했거나 여러 개를 두고 고민하는 경우',
    image: audienceCareer
  },
  {
    title: '멘탈이 부족한 학생',
    desc: '노력해도 결과가 안 나와 의욕이 떨어진 경우',
    image: audienceEntranceExam
  },
  {
    title: '공부법이 고민인 학생',
    desc: '시간은 쓰는데 성적이 정체된 경우',
    image: audienceStudyMethod
  },
  {
    title: '동기가 필요한 학생',
    desc: '같은 시기를 지나온 사람의 이야기가 필요한 경우',
    image: audienceMotivation
  }
];

// ServiceTestimonials 는 { emoji, quote, name } 키를 쓴다(구 content → quote rename).
// '고2 고3 김O원' 오타는 '고3 김O원'으로 정정.
const REVIEW_CARDS = [
  {
    emoji: '😉',
    name: '고2 이O진',
    quote: '뭘 먼저 해야 할지 몰랐는데, 통화 끝나니 이번 주 할일이 딱 정해졌어요.'
  },
  {
    emoji: '☺️',
    name: '고3 김O식',
    quote: '막막하던 학과 선택을 멘토와 이야기하며 방향을 잡았어요'
  },
  {
    emoji: '😊',
    name: '고3 김O원',
    quote: '공부 시간이 아니라 방법이 문제였다는 걸 알게 됐어요'
  }
];

export default function Callmentor() {
  const [mentors, setMentors] = useState([]);

  useEffect(() => {
    let mounted = true;

    async function fetchMentors() {
      const { data, error } = await supabase
        .from('home_mentor_strategies')
        .select(
          'id, mentor_name, badge, title_lines, photo_url, photo_layout, card_width, sort_order'
        )
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (!mounted) return;

      if (error) {
        console.error('콜멘토 멘토 조회 오류:', error);
        setMentors([]);
        return;
      }

      setMentors((data || []).map(normalizeMentorRow));
    }

    fetchMentors();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <main className="min-h-screen bg-white pt-16 text-[#0F172A]">
      {/* 섹션 1 — Hero. 공통 컴포넌트 변경 0건(ServiceHeroBrowserFrame은 대체 불가 — 위 JSDoc 참고).
          lg:pb-0 으로 낮춰 "경계 갭은 뒤 섹션 pt 가 흡수한다"는 4페이지 규약에 편입한다. */}
      <section
        className="relative overflow-hidden bg-white py-20 lg:pb-0 lg:pt-[8rem]"
        style={{
          backgroundImage:
            'linear-gradient(180deg, rgba(161,147,125,0.8) 0%, rgba(171,158,138,0.8) 10.577%, rgba(185,174,158,0.8) 30.769%, rgba(222,217,209,0.8) 58.173%, #FFFFFF 100%)',
          backgroundRepeat: 'no-repeat',
          // 45rem 고정 대신 섹션 박스 100%에 맞춘다 — lg pb 축소로 생기는 하드 엣지와
          // 모바일에서 콘텐츠 중간에 그라데이션이 끊기던 현행 버그를 동시에 해소한다.
          backgroundSize: '100% 100%'
        }}
      >
        <div className={`${CONTAINER} flex flex-col items-start gap-12 lg:flex-row lg:items-center lg:justify-between`}>
          <div className="flex w-full max-w-[36.5rem] flex-col gap-8">
            <h1 className="break-keep text-[1.75rem] font-semibold leading-[1.3] tracking-[-0.02em] text-[#0F172A] sm:text-[2.25rem] md:text-[2rem]">
              막막한 입시 고민,{' '}
              <br className="hidden sm:inline" />
              30분 통화 한 번으로 끝냅니다
            </h1>
            <p className="max-w-[35.75rem] break-keep text-[1.125rem] font-medium leading-[1.6] text-[#525252] sm:text-[1.25rem] md:text-[1.5rem]">
              내 학습 데이터를 먼저 분석하고, 검증된 대학생 멘토가 전화로{' '}
              <br className="hidden sm:inline" />
              핵심 문제 하나와 실행 계획을 정리해 드립니다.
            </p>
            <div className="flex flex-col gap-4 sm:flex-row">
              {/* 콜멘토는 상세 페이지(PAID_SERVICE_CONFIGS 미등록 — 실제 서비스 앱이 아직 없다)가
                  없어, 클릭 시 이동 대신 "서비스 준비중입니다" alert로 안내한다
                  (alertServiceNotReady, paidServiceAccess.js — 자기평가・심화탐구와 동일 처리,
                  2026-08-05 사용자 확정). 라벨도 학습진단을 명시하던 "학습진단으로 시작하기 →"에서
                  다른 두 페이지와 통일된 "지금 시작하기"로 바꿨다(준비중 alert와 라벨의 모순 방지).
                  to prop을 빼면 CmButton이 자동으로 <button>으로 렌더한다. */}
              <CmButton variant="primary" onClick={alertServiceNotReady}>
                지금 시작하기
              </CmButton>
              {/* 하위 플로우(상담 안내) 미구현 범위 — 우선 4단계 진행 순서 섹션으로 인페이지 스크롤 */}
              <CmButton variant="outline" href="#callmentor-steps">
                상담이 처음이예요
              </CmButton>
            </div>
          </div>

          {/* 히어로 비주얼 — 손+아이폰 합성(시안 Group 4, node 2700:1362 확정 렌더 — 김형준 멘토
              정식 사진 오버레이(2555:7142)까지 합쳐진 완성본으로 교체). 소스 비율 1509:1838(@2x)
              그대로 유지(object-cover 크롭 방지). WebP 전환으로 LCP 용량 1000.7KB → 167.7KB 로
              축소했다(해상도는 903×1100 → 1509×1838 로 오히려 상승) — fetchpriority 는 유지.
              알파 채널 필수: 히어로 섹션 CSS 그라데이션 배경 위에 얹히므로 배경이 투명해야 한다.
              Figma 프레임(2700:1362 / 2555:7136)을 그대로 export 하면 베이지 배경이 구워져
              나와(알파 전부 255) 쓸 수 없다 — 원본 소스(755×920 컷아웃)의 알파 채널을 @2x 로
              복원해 합성했다. 재추출 시 이 점 반드시 유의.
              폭 산출: 시안 텍스트 932px : 이미지 754px ≈ 55:45 비율을, 가용 1100px 에서
              gap-12(48px)를 뺀 1052px 에 동일 비율로 배분 → 이미지 474px. */}
          <img
            src={heroCallMockup}
            alt="콜멘토 전화 상담 통화 화면을 보여주는 손에 든 아이폰"
            fetchpriority="high"
            className="w-full max-w-[29.625rem] shrink-0 aspect-[1509/1838] rounded-[2rem] object-cover"
          />
        </div>
      </section>

      {/* 섹션 2 — 상담을 통해. 카드는 로컬 유지(위 JSDoc 참고 — 골드 제목이 ServiceProcessCards
          공통 톤으로 사라지는 것을 막기 위함). pt 산출: (히어로 lg pb 128 + 현행 pt 120) × 0.67
          ≈ 166px = lg:pt-[10.375rem]. */}
      <ServiceSection
        className="lg:pt-[10.375rem]"
        heading={
          <>
            <span className="block">상담을 통해</span>
            <span className="block text-[#AF9364]">문제를 확인할 수 있어요</span>
          </>
        }
      >
        <div className="mt-10 grid grid-cols-1 gap-8 sm:mt-12 sm:grid-cols-2 lg:mt-[3.75rem] lg:grid-cols-3 lg:gap-[4.75rem]">
          {VALUE_CARDS.map((card) => (
            <div
              key={card.title}
              className="flex flex-col items-center gap-6 rounded-[1.875rem] border border-[#D7D7D7] p-[1.75rem] text-center"
            >
              <img src={card.icon} alt="" aria-hidden="true" className="h-[1.875rem] w-[1.875rem]" />
              {/* 크기・굵기・leading・tracking 은 CARD_TITLE_CLASS 와 동일, 색만 골드로 유지
                  (공통 토큰을 그대로 import 하면 #525252 로 골드가 사라진다 — 위 JSDoc 참고). */}
              <h3 className="text-[1.25rem] font-semibold leading-[1.4] tracking-[-0.02em] text-[#AF9364]">
                {card.title}
              </h3>
              {/* 크기・굵기・leading・break-keep 은 CARD_DESC_CLASS 와 동일, 색만 골드로 유지. */}
              <p className="break-keep text-[1rem] font-medium leading-[1.4] text-[#AF9364]">
                {card.desc}
              </p>
            </div>
          ))}
        </div>
      </ServiceSection>

      {/* 섹션 3 — 4단계 진행 순서. 이미지 배경 + 그라데이션 캡션 카드는 로컬 유지(위 JSDoc 참고).
          id="callmentor-steps" 는 히어로 "상담이 처음이예요" CTA 의 인페이지 앵커 타깃이다.
          pt 160.8px = (120+120)×0.67(이 페이지군 최빈 리듬). pb 는 뒤가 §4 배경 전환(밴드
          시작)이라 ×0.67 미적용 — §3 pb 120 + §4 pt 120 = 240px 를 절반씩 나눠 갖는다. */}
      <ServiceSection
        id="callmentor-steps"
        className="pb-16 sm:pb-20 lg:pb-[7.5rem] lg:pt-[10rem]"
        heading="무엇을 물어야 할지 몰라도 괜찮아요"
      >
        <p className="mt-3 break-keep text-[1.25rem] font-semibold leading-[1.3] text-[#525252]">
          위닝의 4단계의 꼼꼼한 상담 진행 순서
        </p>
        <div className="mt-10 grid grid-cols-1 gap-6 sm:mt-12 sm:grid-cols-2 lg:mt-[3.75rem] lg:grid-cols-4 lg:gap-[2.25rem]">
          {STEP_CARDS.map((step) => (
            <div
              key={step.caption}
              // lg 높이 190px: 시안 카드 330×248(비 1.33)인데, 그리드 폭이 4열로 줄며 카드 폭도
              // (1100 − 3×36) ÷ 4 ≈ 248px 로 줄어든다. 이때 높이가 247 그대로면 정사각(비 1.00)
              // 으로 뭉개지므로 248 × 0.764 ≈ 190 으로 낮춰 시안 비율(248:190 = 1.31)을 회복한다.
              // 모바일은 1열 전폭이라 247 을 유지한다.
              className="relative flex h-[15.4375rem] items-end overflow-hidden rounded-[1.875rem] lg:h-[11.875rem]"
            >
              <img
                src={step.image}
                alt={step.alt}
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    'linear-gradient(180deg, rgba(217,217,217,0) 0%, rgba(109,109,109,0.5) 35.577%, #000000 100%)'
                }}
              />
              <p className="relative z-10 px-4 pb-4 text-[1.25rem] font-semibold leading-[1.4] tracking-[-0.02em] text-white">
                {step.caption}
              </p>
            </div>
          ))}
        </div>
      </ServiceSection>

      {/* 섹션 4 — 이런 학생에게. 회색 밴드(#F4F4F6)는 콜멘토 고유값으로 사수한다(사용자 확정
          사항 3번 — 색 결정이므로 KISS 를 이유로 폐기하지 않는다). surface="gray" +
          cardSurface="white" 는 이 섹션 하나를 위해 연 확장이다. pb 를 갖는 이유는
          mentors.length === 0 이면 §5(밴드 연장)가 렌더되지 않아 §4 가 곧 밴드 끝(배경 전환
          경계)이 되기 때문 — pb 가 없으면 그 경우 카드 바로 밑에서 밴드가 잘린다. */}
      <ServiceSection
        surface="gray"
        className="pb-16 sm:pb-20 lg:pb-[7.5rem] lg:pt-[7.5rem]"
        heading={
          <>
            이런 학생에게<span className="text-[#BF923D]"> 전화 상담을 추천해요</span>
          </>
        }
      >
        <ServiceAudienceCards items={AUDIENCE_CARDS} imageFit="cover" cardSurface="white" />
      </ServiceSection>

      {/* 섹션 5 — 멘토스 소개 (기존 MentorSection 재사용, variant='callmentor'로 헤딩 색상・
          회색 밴드 연장만 분기). §4 와 이어지는 하나의 밴드라 ServiceSection 을 쓰지 않는다
          (위 JSDoc 참고). */}
      {mentors.length > 0 && <MentorSection mentors={mentors} variant="callmentor" />}

      {/* 섹션 6 — 후기. ServiceTestimonials 전면 대체(공통 컴포넌트 변경 0건). pt/pb 120px 은
          각각 §5(#F4F4F6)→§6(white), §6(white)→§7(black) 배경 전환 경계라 ×0.67 미적용. */}
      <ServiceSection
        className="pb-16 sm:pb-20 lg:pb-[7.5rem] lg:pt-[7.5rem]"
        heading="콜멘토 서비스를 받아본 학생들의 후기"
      >
        <ServiceTestimonials items={REVIEW_CARDS} />
      </ServiceSection>

      {/* 섹션 7 — 하단 CTA(검정 밴드). ServiceSection 으로 접기엔 SECTION_SURFACE 에 black
          항목 + 흰 헤딩용 prop 을 새로 열어야 하는데 호출부가 영구히 1곳이라 로컬 <section>
          8줄이 더 단순하다(KISS — 위 JSDoc 참고). lg pt 120px 은 배경 전환 경계라 ×0.67
          미적용(§6 pb 120 과 합쳐 240px). */}
      <section className="bg-black pt-16 pb-20 sm:pt-20 sm:pb-24 lg:pb-[7.0625rem] lg:pt-[7.5rem]">
        <div className={`${CONTAINER} text-center`}>
          <h2 className="break-keep text-[1.5rem] font-semibold leading-[1.4] tracking-[-0.02em] text-white sm:text-[1.75rem] lg:text-[2rem]">
            아직도 고민이신가요?
          </h2>
          {/* 신청/결제 플로우는 이번 범위 제외 — 확정 전까지 기존 요금 안내(/pricing)로 임시 연결.
              최종 목적지는 추후 확정. white variant 포커스 링은 #AF9364(검정 밴드 위 가시성 확보,
              CmButton.jsx 주석 참고). */}
          <CmButton
            variant="white"
            to="/pricing"
            className="mt-10 sm:mt-12 lg:mt-[5rem] font-semibold"
          >
            콜멘토 서비스 신청하기 →
          </CmButton>
        </div>
      </section>
    </main>
  );
}
