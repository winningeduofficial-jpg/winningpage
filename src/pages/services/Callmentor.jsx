import { useEffect, useState } from 'react';
import MentorSection from '../../components/landing/MentorSection';
import CmButton from '../../components/callmentor/CmButton';
import CmSectionHeading from '../../components/callmentor/CmSectionHeading';
import { supabase } from '../../lib/supabase';
import heroCallMockup from '../../assets/callmentor/hero-call-mockup.png';
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
 * 콜멘토 랜딩 (scratchpad/callmentor-rebuild-spec.md, node `2555:7083`) — 랜딩 1장만 구현.
 * 신청/결제/멘토선택 등 하위 플로우는 이번 범위 제외 — 관련 CTA는 앵커 또는 기존 라우트로
 * 임시 연결한다(자세한 내용은 각 CTA 주석 참고).
 *
 * 헤더/푸터는 SiteLayout이 렌더한다 — 이 페이지는 개별 import하지 않는다.
 */

// 콘텐츠 컨테이너 — dev 랜딩 정본 토큰 max-w-content(72.75rem) 그대로 사용(다른 페이지와 폭 통일).
// 좌우 여백은 사이트 공통 관례(px-5 sm:px-8).
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
  { caption: '1. 무료 진단', image: stepDiagnosis, alt: '노트북으로 무료 진단을 진행하는 모습' },
  { caption: '2. 내 상황에 맞는 멘토 매칭', image: stepMentorMatch, alt: '책상에서 노트북을 보며 매칭 결과를 확인하는 학생' },
  { caption: '3. 30분 전화 상담', image: stepCall, alt: '전화로 멘토와 상담하는 학생' },
  { caption: '4. 1주 후 실천 재점검', image: stepReview, alt: '노트에 실천 계획을 적는 모습' }
];

const AUDIENCE_CARDS = [
  {
    title: '진로가 고민인 학생',
    desc: '희망 학과를 못 정했거나 여러 개를 두고 고민하는 경우',
    image: audienceCareer,
    alt: '진로를 고민하며 책상에 앉아있는 학생 일러스트'
  },
  {
    title: '멘탈이 부족한 학생',
    desc: '노력해도 결과가 안 나와 의욕이 떨어진 경우',
    image: audienceEntranceExam,
    alt: '입시 고민에 펜을 든 채 생각하는 학생 일러스트'
  },
  {
    title: '공부법이 고민인 학생',
    desc: '시간은 쓰는데 성적이 정체된 경우',
    image: audienceStudyMethod,
    alt: '마인드맵과 메모로 공부법을 고민하는 학생 일러스트'
  },
  {
    title: '동기가 필요한 학생',
    desc: '같은 시기를 지나온 사람의 이야기가 필요한 경우',
    image: audienceMotivation,
    alt: '책을 읽으며 동기를 다지는 학생 일러스트'
  }
];

const REVIEW_CARDS = [
  {
    emoji: '😉',
    name: '고2 이O진',
    content: '뭘 먼저 해야 할지 몰랐는데, 통화 끝나니 이번 주 할일이 딱 정해졌어요.'
  },
  {
    emoji: '☺️',
    name: '고3 김O식',
    content: '막막하던 학과 선택을 멘토와 이야기하며 방향을 잡았어요'
  },
  {
    emoji: '😊',
    name: '고2 고3 김O원',
    content: '공부 시간이 아니라 방법이 문제였다는 걸 알게 됐어요'
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
      {/* 섹션 1 — Hero */}
      <section
        aria-label="콜멘토 소개"
        className="relative overflow-hidden bg-white"
        style={{
          backgroundImage:
            'linear-gradient(180deg, rgba(161,147,125,0.8) 0%, rgba(171,158,138,0.8) 10.577%, rgba(185,174,158,0.8) 30.769%, rgba(222,217,209,0.8) 58.173%, #FFFFFF 100%)',
          backgroundRepeat: 'no-repeat',
          backgroundSize: '100% 45rem'
        }}
      >
        <div className={`${CONTAINER} flex flex-col items-start gap-12 py-20 lg:flex-row lg:items-center lg:justify-between lg:py-[8rem]`}>
          <div className="flex w-full max-w-[36.5rem] flex-col gap-10">
            <div className="flex flex-col gap-0">
              <h1 className="break-keep text-[2rem] font-bold leading-[1.4] text-[#0F172A]">
                막막한 입시 고민,
                <br />
                30분 통화 한 번으로 끝냅니다
              </h1>
            </div>
            <p className="max-w-[35.75rem] break-keep text-[1.5rem] font-medium leading-[1.6] text-[#525252]">
              내 학습 데이터를 먼저 분석하고, 검증된 대학생 멘토가 전화로
              <br />
              핵심 문제 하나와 실행 계획을 정리해 드립니다.
            </p>
            <div className="flex flex-col gap-5 sm:flex-row">
              <CmButton variant="primary" to="/free-diagnosis">
                무료진단으로 시작하기 →
              </CmButton>
              {/* 하위 플로우(상담 안내) 미구현 범위 — 우선 4단계 진행 순서 섹션으로 인페이지 스크롤 */}
              <CmButton variant="outline" href="#callmentor-steps">
                상담이 처음이예요
              </CmButton>
            </div>
          </div>

          {/* 히어로 비주얼 — 손+아이폰 합성(시안 Group 4, node 2555:7136 확정 렌더). 소스 비율 754:919 그대로 유지(object-cover 크롭 방지). */}
          <img
            src={heroCallMockup}
            alt="콜멘토 전화 상담 통화 화면을 보여주는 손에 든 아이폰"
            className="w-full max-w-[26rem] shrink-0 aspect-[754/919] rounded-[2rem] object-cover"
          />
        </div>
      </section>

      {/* 섹션 2 — 상담을 통해 */}
      <section aria-label="상담을 통해 얻는 것" className="bg-white py-[7.5rem]">
        <div className={`${CONTAINER} flex flex-col gap-[3.75rem]`}>
          <CmSectionHeading
            weight="semibold"
            heading={
              <>
                <span className="block text-[#0F172A]">상담을 통해</span>
                <span className="block text-[#AF9364]">문제를 확인할 수 있어요</span>
              </>
            }
          />
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3 lg:gap-[6.25rem]">
            {VALUE_CARDS.map((card) => (
              <div
                key={card.title}
                className="flex flex-col items-center gap-8 rounded-[2.5rem] border border-[#D7D7D7] bg-white/10 p-10 text-center"
              >
                <img src={card.icon} alt="" aria-hidden="true" className="h-10 w-10" />
                <h3 className="text-[1.5rem] font-semibold leading-[1.3] text-[#AF9364]">
                  {card.title}
                </h3>
                <p className="text-[1.25rem] font-medium leading-[1.4] text-[#AF9364]">
                  {card.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 섹션 3 — 4단계 진행 순서 */}
      <section
        id="callmentor-steps"
        aria-label="상담 진행 순서"
        className="bg-white py-[7.5rem]"
      >
        <div className={`${CONTAINER} flex flex-col gap-[3.75rem]`}>
          <CmSectionHeading
            heading="무엇을 물어야 할지 몰라도 괜찮아요"
            headingColor="#525252"
            sub="위닝의 4단계의 꼼꼼한 상담 진행 순서"
            subColor="#525252"
          />
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEP_CARDS.map((step) => (
              <div
                key={step.caption}
                className="relative flex h-[15.4375rem] items-end overflow-hidden rounded-[1.875rem]"
              >
                <img
                  src={step.image}
                  alt={step.alt}
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
                <p className="relative z-10 px-5 pb-6 text-[1.5rem] font-semibold leading-[1.3] text-white">
                  {step.caption}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 섹션 4 — 이런 학생에게 전화 상담을 추천해요 */}
      <section aria-label="추천 대상" className="bg-[#F4F4F6] py-[7.5rem]">
        <div className={`${CONTAINER} flex flex-col gap-[3.75rem]`}>
          <CmSectionHeading
            heading={
              <>
                이런 학생에게<span className="text-[#BF923D]"> 전화 상담을 추천해요</span>
              </>
            }
          />
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {AUDIENCE_CARDS.map((card) => (
              <div
                key={card.title}
                className="overflow-hidden rounded-[1.25rem] bg-white"
              >
                <img
                  src={card.image}
                  alt={card.alt}
                  className="h-[15.4375rem] w-full object-cover"
                />
                <div className="px-[2.125rem] py-6">
                  <h3 className="text-[1.5rem] font-semibold leading-[1.3] text-[#525252]">
                    {card.title}
                  </h3>
                  <p className="mt-2 text-[1rem] font-medium leading-[1.4] text-[#525252]">
                    {card.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 섹션 5 — 멘토스 소개 (기존 MentorSection 재사용, variant='callmentor'로 헤딩 색상만 분기) */}
      {mentors.length > 0 && <MentorSection mentors={mentors} variant="callmentor" />}

      {/* 섹션 6 — 후기 */}
      <section aria-label="이용 후기" className="bg-white py-[7.5rem]">
        <div className={`${CONTAINER} flex flex-col gap-[3.75rem]`}>
          <CmSectionHeading heading="콜멘토 서비스를 받아본 학생들의 후기" />
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3 lg:gap-[3.75rem]">
            {REVIEW_CARDS.map((review) => (
              <div
                key={review.name}
                className="flex flex-col gap-5 rounded-[2.5rem] bg-[#F8F9FA] p-10 shadow-[0_2px_2px_rgba(213,213,213,0.25)]"
              >
                <div className="flex items-center gap-3">
                  <span className="text-[2rem] leading-[1.3]" role="img" aria-label="후기 이모지">
                    {review.emoji}
                  </span>
                  <p className="text-[1.125rem] font-medium leading-[1.3] text-[#808080]">
                    {review.name}
                  </p>
                </div>
                <p className="text-[1.375rem] font-normal leading-[1.3] text-[#525252]">
                  {review.content}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 섹션 7 — 하단 CTA */}
      <section aria-label="신청 유도" className="bg-black py-[7.5rem]">
        <div className={`${CONTAINER} flex flex-col items-center gap-[3.75rem] text-center`}>
          <h2 className="text-[2rem] font-semibold leading-[1.4] text-white">
            아직도 고민이신가요?
          </h2>
          {/* 신청/결제 플로우는 이번 범위 제외 — 확정 전까지 기존 요금 안내(/pricing)로 임시 연결.
              최종 목적지는 추후 확정. */}
          <CmButton variant="white" to="/pricing" className="font-semibold">
            콜멘토 서비스 신청하기 →
          </CmButton>
        </div>
      </section>
    </main>
  );
}
