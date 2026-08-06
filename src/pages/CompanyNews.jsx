import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowUpRight, Download, Search } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { alertServiceNotReady } from '../lib/paidServiceAccess';

import directorPortrait from '../assets/company/director-portrait.png';
import missionBg from '../assets/company/mission-bg.jpg';
import bizAiPlatform from '../assets/company/biz-ai-platform.png';
import bizConsulting from '../assets/company/biz-consulting.png';
import bizNetwork from '../assets/company/biz-network.png';
import partnerChloeWinningArt from '../assets/company/partner-chloe-winning-art.png';
import partnerJungsangLanguage from '../assets/company/partner-jungsang-language.png';
import partnerJungsangMath from '../assets/company/partner-jungsang-math.png';

// 회사소개(/company-news) — Figma 시안(1882:19182 "회사소개", 1920×6363) 전면 재작성.
// 라우트 · 헤더/푸터(SiteLayout 전역 렌더) · Supabase 조회/검색/상세/첨부 기능은 그대로 두고
// 히어로~회사소식까지 5개 섹션을 시안 실측대로 새로 짰다(스펙: hero/mission/business/location/
// news.md, 담당자 실측 완료본). 컨테이너는 전 섹션 max-w-content px-5 sm:px-8 로 통일했다
// (시안 섹션별 실폭 1417/1174/1277 드리프트는 좌단 정렬 일관성을 위해 정규화 — 각 스펙 문서
// §7~9 근거).
//
// 섹션 간 상단 여백(1920 시안 → ×0.766, 배경 전환 없는 경계만 ×0.67 추가 축소):
//   Hero(다크)→Mission(사진)     배경 전환, 축소 없음 — 히어로 자체 높이로 자연 경계
//   Mission(사진)→Business(흰)   배경 전환, 축소 없음 — Business lg:pt-[10rem]
//   Business(흰)→Location(회색)  배경 전환 — Business lg:pb-[10.4375rem] / Location lg:pt-[7.25rem]
//   Location(회색)→News(흰)      배경 전환 — Location lg:pb-[7.5625rem] / News lg:pt-[4.6875rem]
//   News(흰)→Footer(#f9fafb)     배경 전환, 시안 249px 그대로 — News lg:pb-[11.9375rem]
//
// 폰트 블로커 — 히어로 카드 타이틀 6개는 시안상 "BM 우아한 세리프"이나 코드베이스에 웹폰트가
// 전혀 없다(assets.md §3-1). 웹폰트를 새로 들여오지 않고, tailwind.config.js의 font-serif를
// 알려진 한글 세리프 시스템 폰트(Noto Serif KR/나눔명조/바탕 등) 우선 스택으로 명시해 OS 기본
// serif(라틴 위주라 한글 폴백이 OS마다 제각각)보다 편차를 줄이는 선에서 근사했다 — 웹폰트
// 확보 전까지의 임시 처리.
// 카드 타이틀 weight 는 시안이 Bold/Regular 혼용(무료진단·수시카드·프리미엄만 Bold)인데 확대
// 렌더로도 구분이 안 되는 시안 실수로 판단해 전 카드 font-bold 로 통일했다(hero.md §7-4).
// "수시카드"는 코드 정본 라우트가 없어(hero.md §8) 다른 5장처럼 Link 로 보내지 않고, 서비스
// 준비중 alert(alertServiceNotReady)로 안내한다 — 자기평가·심화탐구 CTA와 동일한 처리다.
// 목표관리 카드 설명 텍스트만 시안 실측이 #ffffff 로 다른 5장(배경색의 밝은 틴트)과 규칙이
// 다르다(hero.md §7-5, 시안 결함 추정) — 카피가 아닌 색 값 판단은 임의 확정하지 않고 실측값을
// 보수적으로 유지했다. 카드 설명 텍스트의 opacity는 WCAG AA(4.5:1) 검증 결과 0.7에서 6장 중
// 4장이 미달해 0.95로 상향했다(리뷰 실측: susi/mentor/perf/premium 전부 4.5:1 이상 확보).

// -------------------------------------------------------------------------
// 히어로 — 서비스 카드 6장 (1882:19182 y 148~1023)
// -------------------------------------------------------------------------
const HERO_CARDS = [
  {
    key: 'free',
    bg: '#013262',
    tint: '#bddfff',
    title: '무료진단',
    desc: ['나에게 필요한', '서비스 진단'],
    best: true,
    route: '/free-diagnosis'
  },
  {
    key: 'goal',
    bg: '#47406b',
    tint: '#ffffff',
    title: '목표관리',
    desc: ['수험생활의', '완벽한 목표 설계'],
    best: false,
    route: '/services/goal'
  },
  {
    key: 'susi',
    bg: '#6b4055',
    tint: '#e8c0d3',
    title: '수시카드',
    desc: ['체계적이고 논리적인', '수시전략'],
    best: false,
    route: null // 코드 정본에 대응 라우트 없음 — 준비중 alert 처리 (hero.md §8)
  },
  {
    key: 'mentor',
    bg: '#66452b',
    tint: '#f2bc92',
    title: '콜멘토',
    desc: ['나만의 1:1', '입시 멘토링'],
    best: false,
    route: '/services/callmentor'
  },
  {
    key: 'perf',
    bg: '#40606b',
    tint: '#c0eefe',
    title: '수행평가',
    desc: ['주제 추천부터 연계까지', 'AI가 관리하는 수행평가'],
    best: false,
    route: '/services/performance'
  },
  {
    key: 'premium',
    bg: '#304d2d',
    tint: '#a0c99c',
    title: '프리미엄',
    desc: ['전문가가 직접 관리하는', '밀착 컨설팅'],
    best: true,
    route: '/page/premium-a'
  }
];

// -------------------------------------------------------------------------
// 사업영역 카드 3장 (1882:19477)
// -------------------------------------------------------------------------
const BUSINESS_CARDS = [
  {
    key: 'ai-platform',
    image: bizAiPlatform,
    title: 'AI 학습 플랫폼',
    desc: '목표관리・수시예측\n콜멘토・AI 수행평가・무료진단'
  },
  {
    key: 'consulting',
    image: bizConsulting,
    title: '입시 컨설팅 서비스',
    desc: '세특관리・약점관리\n프리미엄 컨설팅'
  },
  {
    key: 'network',
    image: bizNetwork,
    title: '연계 협력 네트워크',
    desc: '정상어학원・정상수학학원\n클로이위닝 미술학원'
  }
];
// ⚠ 가운뎃점은 시안 원문이 U+00B7(·)이나, 코드 정본(InDepthResearch.jsx) 및 페이지 전역 선례가
// U+30FB(・)로 통일돼 있어 그 관용을 따랐다(business.md §5 실측 메모 참고).

// -------------------------------------------------------------------------
// Location — 캠퍼스 카드 8장 (1882:19312)
// -------------------------------------------------------------------------
const CAMPUS_CARDS = [
  { key: 'sejong', name: '위닝에듀 세종캠퍼스', address: ['세종 마음안1로 61'] },
  {
    key: 'hwamyeong',
    name: '위닝에듀 화명캠퍼스',
    address: ['부산 북구 화명대로 40', '현천휴먼 타워, 8층']
  },
  { key: 'centum', name: '위닝에듀 센텀캠퍼스', address: ['부산 해운대구 센텀1로 9 S동 24층'] },
  {
    key: 'cheonan',
    name: '위닝에듀 천안캠퍼스',
    address: ['충남 천안시 서북구 불당23로 73-27 파크힐']
  },
  {
    key: 'jeju',
    name: '위닝에듀 제주캠퍼스',
    address: ['제주 제주시 애월읍 엄장로 55 106동 3층']
  },
  { key: 'daejeon', name: '위닝에듀 대전캠퍼스', address: [], comingSoon: true },
  { key: 'daechi', name: '위닝에듀 대치캠퍼스', address: [], comingSoon: true },
  { key: 'bundang', name: '위닝에듀 분당캠퍼스', address: [], comingSoon: true }
];

// 연계 협력기관 카드 3장 — 카드1만 시안이 설명문(제목)/브랜드명(부제) 위계가 다른 2·3과
// 반대인데(location.md §8-2), 카피 변경 권한이 없어 시안 그대로 옮겼다.
const PARTNER_CARDS = [
  {
    key: 'chloe-winning-art',
    title: '미대입시 실기/비실기\n전문 연계기관',
    subtitle: '클로이위닝 미술학원',
    links: [
      { label: '해운센텀점', href: null },
      { label: '정관점', href: null },
      { label: '천안점', href: null }
    ],
    logo: partnerChloeWinningArt,
    logoWidth: 'w-[16.7rem]'
  },
  {
    key: 'jungsang-language',
    title: '정상어학원',
    subtitle: '어학 교육 전문 연계기관',
    links: [{ label: '화명캠퍼스', href: null }],
    logo: partnerJungsangLanguage,
    logoWidth: 'w-[13rem]'
  },
  {
    key: 'jungsang-math',
    title: '정상수학학원',
    subtitle: '수학 교육 전문 연계기관',
    links: [{ label: '부산캠퍼스', href: null }],
    logo: partnerJungsangMath,
    logoWidth: 'w-[13rem]'
  }
];
// ⚠ "바로가기" 5개 링크의 목적지 URL이 시안·프로토타입 어디에도 없다(location.md §10-1).
// href 를 지어내지 않고 null로 두어, 클릭 시 alertServiceNotReady로 "준비중" 안내만 한다.

const NEWS_PREVIEW_COUNT = 5;

// -------------------------------------------------------------------------
// 회사소식 데이터 유틸 — 기존 구현 계보 그대로 보존 (Events.jsx 와 동일 패턴)
// -------------------------------------------------------------------------
function normalizeArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [value];
    } catch {
      return [value];
    }
  }

  return [];
}

function cleanText(value) {
  return String(value || '').trim();
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function getAttachmentName(file) {
  if (!file || typeof file === 'string') return '첨부파일 다운로드';
  return file.name || '첨부파일 다운로드';
}

function getAttachmentUrl(file) {
  if (!file) return '';
  return typeof file === 'string' ? file : file.url;
}

function renderContent(content) {
  if (!content) return null;

  if (/<\/?[a-z][\s\S]*>/i.test(content)) {
    return <div className="notice-content" dangerouslySetInnerHTML={{ __html: content }} />;
  }

  return <div className="notice-content whitespace-pre-line">{content}</div>;
}

// -------------------------------------------------------------------------
// [1] 히어로 — 다크네이비 배경 + 원장 사진 + 카피 + 서비스 카드 6장
// 아이브로우/헤드라인/사진은 시안 고정값이다(HeroSection 내부 주석 참고 — company-intro
// page_contents 행이 구 디자인 기준으로 운영 중이라 title/subtitle/image_url을 그대로
// 매핑하면 회귀가 난다). page.body만 선택적으로 보조 카피에 얹는다.
// -------------------------------------------------------------------------
function HeroSection({ page }) {
  // 원장 카피(아이브로우/헤드라인)와 사진은 시안 고정값으로 못박는다. company-intro 슬러그의
  // page_contents 행은 운영 중인 구 디자인(제목=회사명 "위닝에듀", 부제=설명 문단, 이미지=박스형
  // 사진, sql/34_menu_navigation_sync.sql에서 실사용 확인) 기준으로 채워져 있어, 그 값을 새
  // 히어로의 아이브로우/헤드라인/컷아웃 사진 슬롯에 그대로 매핑하면 위계가 다른 옛 카피가
  // 노출되고 투명 컷아웃 사진의 하단 플러시 구성이 깨진다. 관리자 오버레이는 회귀 위험이 낮은
  // body(보조 카피, 선택 렌더)만 유지한다.
  const eyebrow = '10년간 쌓아온 데이터로 빈틈없이 함께 가겠습니다.';
  const headline = '강원석 원장님';
  const body = cleanText(page?.body);
  const heroImage = directorPortrait;
  const heroImageAlt = '위닝에듀 강원석 원장';

  return (
    <section className="relative overflow-hidden bg-[#202f3f] pt-[7.25rem] pb-16 sm:pb-0 lg:min-h-[41.875rem] lg:pt-0 lg:pb-0">
      <div className="mx-auto flex w-full max-w-content flex-col gap-10 px-5 sm:px-8 lg:flex-row lg:items-end lg:justify-between lg:gap-0">
        {/* lg 이상: pt/pb를 섹션이 아닌 이 컬럼에만 걸어 사진(아래 래퍼)만 섹션 상하단에
            flush되게 한다 — items-end 정렬로 이 컬럼 하단이 사진 하단과 맞춰지고, 컬럼 자체
            높이(pt+콘텐츠+pb)가 사진 높이에 못 미치는 만큼의 여백이 컬럼 상단에 남는 방식으로
            "아이브로우 top ≈ 섹션 top + 116px" "카드 하단 → 섹션 하단 103px"를 근사한다. */}
        <div className="flex flex-col lg:max-w-[35.625rem] lg:flex-1 lg:pt-[7.25rem] lg:pb-[6.4375rem]">
          <p className="text-[0.9375rem] leading-[1.3] text-white/60">{eyebrow}</p>
          <h1 className="mt-[0.6875rem] break-keep text-[1.75rem] font-semibold leading-[1.3] text-white sm:text-[2.125rem]">
            {headline}
          </h1>
          {body && (
            <p className="mt-4 max-w-[28rem] whitespace-pre-line break-keep text-[0.9375rem] leading-[1.5] text-white/70">
              {body}
            </p>
          )}

          {/* 카드 그리드 검산: 데스크톱 3열 × 2행, gap 0(맞닿는 타일이 시안 핵심 구성 — hero.md
              §7-7). 모바일은 2열 × 3행, 768~1023 구간은 3열 × 2행으로 미리 전환해 타일이
              과도하게 부풀지 않게 한다. */}
          <div className="mt-[1.625rem] grid grid-cols-2 sm:grid-cols-3 lg:grid-rows-2">
            {HERO_CARDS.map((card) => {
              const content = (
                <>
                  {card.best && (
                    <span className="absolute left-0 top-0 flex h-[1.25rem] w-[2.125rem] items-center justify-center bg-[#ff8e00] text-[0.625rem] font-medium leading-[1.3] text-white sm:h-[1.5rem] sm:w-[2.5rem] sm:text-[0.6875rem]">
                      BEST
                    </span>
                  )}
                  {/* button(수시카드)은 phrasing content만 허용해 <p>가 유효하지 않다 —
                      6장 전부 <span className="block">으로 통일한다. */}
                  <span
                    className="block text-center text-[0.6875rem] font-semibold leading-[1.3] sm:text-[0.8125rem]"
                    style={{ color: card.tint, opacity: 0.95 }}
                  >
                    {card.desc[0]}
                    <br />
                    {card.desc[1]}
                  </span>
                  {/* 타이틀 서체 — 파일 상단 폰트 블로커 주석 참고(font-serif 임시 대체). */}
                  <span className="mt-2 block text-center font-serif text-[1.375rem] font-bold leading-[1.3] text-white sm:text-[1.6875rem] lg:text-[1.9375rem]">
                    {card.title}
                  </span>
                </>
              );
              const className =
                'relative flex aspect-[248/229] flex-col items-center justify-center gap-1 px-2 transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-0.125rem] focus-visible:outline-white';

              return card.route ? (
                <Link key={card.key} to={card.route} style={{ backgroundColor: card.bg }} className={className}>
                  {content}
                </Link>
              ) : (
                <button
                  key={card.key}
                  type="button"
                  onClick={alertServiceNotReady}
                  style={{ backgroundColor: card.bg }}
                  className={className}
                >
                  {content}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mx-auto w-[16rem] shrink-0 sm:w-[20rem] lg:mx-0 lg:mb-0 lg:w-[24rem] lg:self-end xl:w-[28.125rem]">
          <img
            src={heroImage}
            alt={heroImageAlt}
            className="h-auto w-full object-contain object-bottom"
          />
        </div>
      </div>
    </section>
  );
}

// -------------------------------------------------------------------------
// [2] Mission / Vision / Talents — 전면 사진 배경 + 좌측 3블록
// 시안엔 dim 오버레이 레이어가 없어 실측 렌더에서 텍스트가 사진 밝은 영역에 묻힌다
// (mission.md §7-1) — 시안에 없는 좌→우 그라디언트 스크림을 추가로 넣었다(근거를 여기 남긴다).
// -------------------------------------------------------------------------
const MISSION_BLOCKS = [
  {
    key: 'mission',
    label: 'Mission',
    lines: ['학생 한 명, 한명의 가능성을 믿고,', '데이터와 전문성으로 증명하는 위닝에듀입니다']
  },
  {
    key: 'vision',
    label: 'Vision',
    lines: ['데이터와 실적으로 증명하는', '대한민국 대표 입시 컨설팅 플랫폼입니다']
  },
  {
    key: 'talents',
    label: (
      <>
        Talents for
        <br />
        Winning Edu
      </>
    ),
    lines: ['학생 한 명의 가능성을 믿고, 10년 이상의', '현장 노하우와 전문성으로 함께 성장하는 사람']
  }
];

function MissionSection() {
  return (
    <section className="relative isolate overflow-hidden bg-[#111418] pt-14 pb-14 sm:pt-20 sm:pb-20 lg:pt-[6.9375rem] lg:pb-[7.875rem]">
      <img
        src={missionBg}
        alt=""
        aria-hidden="true"
        loading="lazy"
        decoding="async"
        className="absolute inset-0 -z-10 h-full w-full object-cover"
      />
      {/* 시안에 없는 스크림 — 사진 위 흰 텍스트 대비 확보용(정규화 근거는 위 섹션 주석 참고). */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-gradient-to-r from-black/70 via-black/45 to-black/20 sm:bg-gradient-to-r sm:from-black/60 sm:via-black/30 sm:to-transparent"
      />

      <div className="mx-auto flex w-full max-w-content flex-col px-5 sm:px-8">
        {MISSION_BLOCKS.map((block, index) => (
          <div key={block.key} className={index === 0 ? '' : 'mt-5 sm:mt-7 lg:mt-[2.5rem]'}>
            {/* 구분선 — 첫 블록 위에는 없다. */}
            {index > 0 && (
              <span
                aria-hidden="true"
                className="mb-5 ml-0 block h-9 w-0.5 bg-[#D8D8D8] sm:ml-3 sm:mb-7 sm:h-12 lg:ml-4 lg:mb-[2.5rem] lg:h-16"
              />
            )}
            <p className="text-[0.75rem] font-medium leading-[1.3] text-[#E9F4FF] sm:text-[0.8125rem] lg:text-[0.875rem]">
              {block.label}
            </p>
            <p
              className="mt-4 max-w-[36.4375rem] whitespace-pre-line break-keep text-[1.0625rem] font-semibold leading-[1.45] text-white sm:text-[1.125rem] lg:text-[1.25rem] lg:leading-[1.3]"
              style={{ textShadow: '0 0.1875rem 0.9375rem rgba(0,0,0,0.4)' }}
            >
              {block.lines.join('\n')}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

// -------------------------------------------------------------------------
// [3] 사업영역 — 흰 배경 카드 3장 (3D 일러스트 + 타이틀 + 본문)
// -------------------------------------------------------------------------
function BusinessSection() {
  return (
    <section className="bg-white pt-16 pb-16 sm:pt-20 lg:pt-[10rem] lg:pb-[10.4375rem]">
      <div className="mx-auto w-full max-w-content px-5 sm:px-8">
        <p className="text-center text-[0.875rem] font-medium leading-[1.3] text-[#013262] sm:text-[1rem]">
          사업영역
        </p>
        <h2 className="mx-auto mt-5 max-w-[36rem] break-keep text-center text-[1.5rem] font-semibold leading-[1.3] text-[#525252] sm:text-[1.75rem] lg:text-[2rem]">
          위닝에듀는 기술을 기반으로{' '}
          <br className="hidden lg:inline" />
          경계없는 입시지원을 제공합니다
        </h2>

        {/* 3열 폭 검산: (1100 − 30×2) / 3 = 346.7px, 시안 370×0.937(카드폭 정규화 비율) = 346.7px ✓
            (business.md §7 — 폰트를 시안 1:1로 유지하려면 컨테이너를 max-w-content로 정규화하고
            카드 내부는 카드폭 비율 0.937로 환산해야 한다). 768~1023 구간은 sm:grid-cols-2로
            채워 카드 한 장이 컨테이너 전폭을 차지해 여백만 남는 것을 막는다. */}
        <div className="mt-10 grid grid-cols-1 gap-5 sm:mt-12 sm:grid-cols-2 lg:mt-[4.1875rem] lg:grid-cols-3 lg:gap-[1.875rem]">
          {BUSINESS_CARDS.map((card) => (
            <div
              key={card.key}
              className="flex flex-col rounded-[1.25rem] bg-white px-6 pb-8 pt-7 shadow-[0_0.125rem_0.25rem_0.125rem_rgba(215,215,215,0.25)] lg:rounded-[1.5rem] lg:px-10 lg:pb-12 lg:pt-[2.625rem]"
            >
              <img
                src={card.image}
                alt=""
                aria-hidden="true"
                loading="lazy"
                decoding="async"
                className="h-[9.5rem] w-[7.75rem] object-contain lg:h-[12.625rem] lg:w-[10.3125rem]"
              />
              <p className="mt-4 text-[1.125rem] font-semibold leading-[1.4] tracking-[-0.02em] text-[#525252] lg:text-[1.5rem]">
                {card.title}
              </p>
              <p className="mt-[1.75rem] whitespace-pre-line break-keep text-[0.9375rem] font-medium leading-[1.4] text-[#525252] lg:text-[1.25rem]">
                {card.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// -------------------------------------------------------------------------
// [4] Location + 연계 협력기관
// -------------------------------------------------------------------------
// 목적지가 없어(캠퍼스 상세 라우트 미정) PartnerCard와 동일하게 alertServiceNotReady로
// "준비중" 안내한다 — 호버 스타일·화살표로 클릭 가능해 보이는데 실제로는 아무 반응이 없던
// 문제를 해소한다. button은 phrasing content만 허용해 내부를 전부 span(+block/flex)으로 짠다.
function CampusCard({ campus }) {
  return (
    <button
      type="button"
      onClick={alertServiceNotReady}
      className="group flex min-h-[10.25rem] w-full flex-col justify-between rounded-xl border border-[#D9D9D9] bg-white px-5 py-5 text-left transition hover:border-[#013262] hover:bg-[rgba(233,247,255,0.4)] sm:px-6 sm:py-6 lg:px-[2.125rem] lg:py-[1.5rem]"
    >
      <span className="block">
        <span className="block text-[0.75rem] leading-[1.3] text-[#013262]">분점</span>
        <span className="mt-[0.375rem] block break-keep text-[1.125rem] font-semibold leading-[1.3] text-[#525252] sm:text-[1.25rem] lg:text-[1.5rem]">
          {campus.name}
        </span>
      </span>
      {/* 원형 화살표 버튼 — 헤더 행이 아닌 주소와 같은 하단 행에 items-end로 배치(시안:
          우측 하단 정렬). */}
      <span className="mt-3 flex items-end justify-between gap-3">
        <span className="block min-h-[2.4rem] break-keep text-[0.8125rem] leading-[1.3] text-[#525252] sm:text-[0.875rem]">
          {campus.comingSoon ? '오픈예정' : campus.address.join(', ')}
        </span>
        <span
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#323232] text-white transition group-hover:bg-[#013262] sm:h-[2.125rem] sm:w-[2.125rem]"
        >
          <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
        </span>
      </span>
    </button>
  );
}

function PartnerCard({ partner }) {
  return (
    <div className="flex min-h-[19rem] flex-col justify-between rounded-xl border border-[#D9D9D9] bg-white px-6 pb-6 pt-[1.8125rem] lg:min-h-[23.25rem] lg:px-[1.4375rem] lg:pb-[1.5625rem]">
      <div>
        <p className="whitespace-pre-line break-keep text-[1.25rem] font-semibold leading-[1.3] text-[#525252] lg:text-[1.5rem]">
          {partner.title}
        </p>
        <p className="mt-2 text-[0.8125rem] leading-[1.3] text-[#525252] sm:text-[0.875rem]">
          {partner.subtitle}
        </p>
        <span aria-hidden="true" className="mt-[1.0625rem] block h-[0.0625rem] w-full bg-[#D7D7D7]" />
        <div className="mt-[1.125rem] flex flex-col gap-3">
          {partner.links.map((link) => (
            <button
              key={link.label}
              type="button"
              onClick={alertServiceNotReady}
              className="flex items-center justify-between text-left text-[0.8125rem] font-medium leading-[1.3] text-[#525252] hover:text-[#013262] sm:text-[0.875rem]"
            >
              <span>{link.label}</span>
              <span className="inline-flex items-center gap-1 border-b border-[#525252]">
                바로가기
                <ArrowUpRight className="h-[0.875rem] w-[0.875rem]" aria-hidden="true" />
              </span>
            </button>
          ))}
        </div>
      </div>
      <img
        src={partner.logo}
        alt={partner.subtitle}
        loading="lazy"
        decoding="async"
        className={`mt-6 self-end ${partner.logoWidth} max-w-full object-contain opacity-30`}
      />
    </div>
  );
}

function LocationSection() {
  return (
    <section className="bg-[#F6F7FB] pt-14 pb-14 sm:pt-20 sm:pb-20 lg:pt-[7.25rem] lg:pb-[7.5625rem]">
      <div className="mx-auto w-full max-w-content px-5 sm:px-8">
        {/* [A] Location 블록 */}
        <p className="text-[1rem] font-medium leading-[1.3] text-[#013262] sm:text-[1.125rem]">
          Location
        </p>
        <h2 className="mt-4 max-w-[40rem] break-keep text-[1.375rem] font-semibold leading-[1.3] text-[#525252] sm:text-[1.5rem]">
          전국 어디서든, 필요한 입시 관리를 한곳에서{' '}
          <br className="hidden sm:inline" />
          여러 지점의 센터와 전문 연계기관을 통해 입시의 전 영역을 지원합니다.
        </h2>

        {/* 캠퍼스 카드 그리드 — 375: 1열 / 768: 2열 / 1024↑: 3열 (location.md §9) */}
        <div className="mt-8 grid grid-cols-1 gap-3 sm:mt-10 sm:grid-cols-2 sm:gap-[0.875rem] lg:mt-[2.6875rem] lg:grid-cols-3 lg:gap-4">
          {CAMPUS_CARDS.map((campus) => (
            <CampusCard key={campus.key} campus={campus} />
          ))}
        </div>

        {/* [B] 연계 협력기관 블록 */}
        <h2 className="mt-16 text-[1.375rem] font-semibold leading-[1.3] text-[#525252] sm:mt-20 sm:text-[1.5rem] lg:mt-[5.75rem]">
          연계 협력기관
        </h2>
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:mt-[1.75rem] lg:grid-cols-3">
          {PARTNER_CARDS.map((partner) => (
            <PartnerCard key={partner.key} partner={partner} />
          ))}
        </div>
      </div>
    </section>
  );
}

// -------------------------------------------------------------------------
// [5] 회사소식 — 최신 5건 미리보기 + "더보기" 펼침(검색 포함) + 기존 ?id= 상세뷰
// 상세뷰는 검색/펼침 상태와 무관하게 목록 위에 그대로 얹는다(§2 설계 결정).
// -------------------------------------------------------------------------
function NewsDetail({ row, onBack }) {
  const images = normalizeArray(row.image_urls);
  const finalImages = images.length ? images : row.image_url ? [row.image_url] : [];
  const attachments = normalizeArray(row.attachments);

  return (
    <section className="bg-white pt-14 pb-16 sm:pt-20 lg:pt-[4.6875rem] lg:pb-[11.9375rem]">
      <div className="mx-auto w-full max-w-content px-5 sm:px-8">
        <button
          type="button"
          onClick={onBack}
          className="mb-8 inline-flex items-center gap-2 text-[0.9375rem] font-semibold text-[#525252] hover:text-[#013262] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#013262]"
        >
          <ArrowLeft className="h-[1.125rem] w-[1.125rem]" aria-hidden="true" />
          회사소식 목록으로
        </button>

        <article className="border-y border-[#D9D9D9]">
          <header className="border-b border-[#EFEFEF] px-1 py-8">
            <div className="mb-3 flex items-center gap-2">
              {row.is_pinned && (
                <span className="rounded bg-[#013262] px-2 py-1 text-xs font-bold text-white">
                  주요소식
                </span>
              )}
              <span className="text-sm font-medium text-[#767676]">{formatDate(row.created_at)}</span>
            </div>
            <h1 className="break-keep text-[1.5rem] font-bold leading-[1.35] text-[#525252] sm:text-[1.75rem]">
              {row.title}
            </h1>
          </header>

          <div className="min-h-[20rem] px-1 py-12">
            {finalImages.length > 0 && (
              <div className="mx-auto mb-10 max-w-[57.5rem] space-y-4">
                {finalImages.map((url, index) => (
                  <img
                    key={`${url}-${index}`}
                    src={url}
                    alt={`${row.title} 이미지 ${index + 1}`}
                    className="w-full rounded-2xl object-contain"
                  />
                ))}
              </div>
            )}

            {renderContent(row.content)}

            {(attachments.length > 0 || row.file_url) && (
              <div className="mt-12 rounded-xl border border-[#D9D9D9] bg-[#F9FAFB] p-5">
                <p className="mb-3 text-sm font-bold text-[#525252]">첨부파일</p>
                <div className="space-y-2">
                  {attachments.map((file, index) => {
                    const url = getAttachmentUrl(file);
                    if (!url) return null;

                    return (
                      <a
                        key={`${url}-${index}`}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 rounded-lg border border-[#D9D9D9] bg-white px-4 py-3 text-sm font-semibold text-[#525252] hover:border-[#013262]"
                      >
                        <Download className="h-4 w-4" aria-hidden="true" />
                        {getAttachmentName(file)}
                      </a>
                    );
                  })}

                  {attachments.length === 0 && row.file_url && (
                    <a
                      href={row.file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 rounded-lg border border-[#D9D9D9] bg-white px-4 py-3 text-sm font-semibold text-[#525252] hover:border-[#013262]"
                    >
                      <Download className="h-4 w-4" aria-hidden="true" />
                      {row.file_name || '첨부파일 다운로드'}
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        </article>
      </div>
    </section>
  );
}

function NewsRow({ row, onSelect }) {
  return (
    // items-stretch(모바일 flex-col 기준)로 두 번째 span(제목)의 교차축 폭을 컨테이너 전체로
    // 고정해야 truncate(nowrap)가 min-content=max-content로 폭을 결정해버려 카드가 전역
    // 가로 스크롤을 유발하던 문제가 해소된다. 헤딩 태그(h3) 대신 span을 쓰는 이유는 button의
    // 콘텐츠 모델이 phrasing content만 허용해서다(h3는 flow content).
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full flex-col items-stretch gap-1 py-3 text-left transition hover:text-[#013262] sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:py-0"
    >
      <span className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
        {row.is_pinned && (
          <span className="shrink-0 rounded bg-[#013262] px-2 py-1 text-[0.6875rem] font-bold leading-[1.3] text-white">
            주요소식
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-[0.9375rem] leading-[1.4] text-[#525252] sm:text-[1rem]">
          {row.title}
        </span>
      </span>
      <span className="shrink-0 text-[0.75rem] leading-[1.4] text-[#767676] sm:text-[1rem] sm:text-[#525252]">
        {formatDate(row.created_at)}
      </span>
    </button>
  );
}

function NewsSection({ rows, loading, onSelect, keyword, setKeyword, expanded, setExpanded }) {
  const filteredRows = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return rows;

    return rows.filter((row) =>
      [row.title, row.content, row.file_name].join(' ').toLowerCase().includes(q)
    );
  }, [keyword, rows]);

  const visibleRows = expanded ? filteredRows : rows.slice(0, NEWS_PREVIEW_COUNT);

  return (
    <section className="bg-white pt-14 pb-16 sm:pt-20 lg:pt-[4.6875rem] lg:pb-[11.9375rem]">
      <div className="mx-auto w-full max-w-content px-5 sm:px-8">
        <div className="flex items-end justify-between">
          <h2 className="text-[1.5rem] font-bold leading-[1.4] text-[#525252] sm:text-[1.75rem] lg:text-[2rem]">
            회사소식
          </h2>
          {/* "더보기" — 시안 색 #D7D7D7는 흰 배경 대비 AA 크게 미달 → #A0A0A0으로 상향
              (news.md §8-4). 펼친 뒤에는 검색 UI가 대신 나오므로 버튼을 숨긴다. 노출 조건을
              rows.length > 0으로 완화해 5건 이하인 DB 상태에서도 검색·총건수 표기에 도달할
              수 있게 한다(전에는 5건 넘을 때만 진입 가능해 검색 UI 자체에 닿을 방법이 없었다). */}
          {!expanded && rows.length > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="text-[0.8125rem] font-normal leading-[1.3] text-[#A0A0A0] underline hover:text-[#525252] sm:text-[0.9375rem]"
            >
              더보기
            </button>
          )}
        </div>
        <span aria-hidden="true" className="mt-[1.125rem] block h-[0.0625rem] w-full bg-[#525252]" />

        {expanded && (
          <div className="mt-6 flex h-12 items-center border-b border-[#111827] sm:h-14">
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="검색어를 입력해주세요"
              aria-label="회사소식 검색"
              type="search"
              className="h-full flex-1 bg-transparent px-1 text-[0.9375rem] font-medium outline-none placeholder:text-[#A0A0A0] sm:text-base"
            />
            <Search
              strokeWidth={1.7}
              aria-hidden="true"
              className="mr-2 h-5 w-5 text-[#767676]"
            />
          </div>
        )}

        {expanded && (
          <p className="mt-6 text-[0.8125rem] font-medium text-[#767676] sm:text-sm">
            총 <span className="font-bold text-[#013262]">{filteredRows.length}</span>건의 소식이
            있습니다.
          </p>
        )}

        <div
          className={
            expanded
              ? 'mt-4 divide-y divide-[#EFEFEF] sm:mt-3'
              : 'mt-[2.25rem] flex flex-col gap-3 sm:gap-[1.125rem]'
          }
        >
          {loading ? (
            <div className="py-16 text-center text-sm font-medium text-[#767676]">
              회사소식을 불러오는 중입니다.
            </div>
          ) : visibleRows.length === 0 ? (
            <div className="py-16 text-center text-sm font-medium text-[#767676]">
              등록된 회사소식이 없습니다.
            </div>
          ) : (
            visibleRows.map((row) => (
              <NewsRow key={row.id} row={row} onSelect={() => onSelect(row.id)} />
            ))
          )}
        </div>
      </div>
    </section>
  );
}

export default function CompanyNews() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get('id');
  const [introPage, setIntroPage] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  // 목록의 검색어/펼침 상태를 NewsSection 로컬이 아닌 여기서 들고 있어야, 상세뷰 진입 시
  // NewsSection이 언마운트돼도(아래 selectedId && selectedRow 분기) 목록으로 돌아왔을 때
  // 검색 결과·펼침 상태가 유지된다.
  const [keyword, setKeyword] = useState('');
  const [expanded, setExpanded] = useState(false);

  // ?id= 변화(상세 진입·목록 복귀 모두)에서 스크롤을 최상단으로 되돌린다. 회사소식 섹션이
  // 페이지 하단(~5000px)에 있어 setSearchParams만으로는 pathname이 안 바뀌어
  // App.jsx의 ScrollToTop(pathname 전용)이 반응하지 않는다.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [selectedId]);

  useEffect(() => {
    let alive = true;

    async function loadPage() {
      setLoading(true);

      const [introResult, newsResult] = await Promise.all([
        supabase
          .from('page_contents')
          .select('*')
          .eq('slug', 'company-intro')
          .eq('is_active', true)
          .maybeSingle(),
        supabase
          .from('company_news')
          .select('*')
          .eq('is_active', true)
          .order('is_pinned', { ascending: false })
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: false })
      ]);

      if (!alive) return;

      if (introResult.error) {
        console.error('회사소개 조회 오류:', introResult.error);
      } else {
        setIntroPage(introResult.data || null);
      }

      if (newsResult.error) {
        console.error('회사소식 조회 오류:', newsResult.error);
        setRows([]);
      } else {
        setRows(newsResult.data || []);
      }

      setLoading(false);
    }

    loadPage();

    return () => {
      alive = false;
    };
  }, []);

  const selectedRow = useMemo(() => {
    if (!selectedId) return null;
    return rows.find((row) => String(row.id) === String(selectedId)) || null;
  }, [rows, selectedId]);

  // ?id= 딥링크 진입 시 rows 로딩이 끝나기 전까지는 selectedRow가 null이라 아래 분기를 타지
  // 못하고 전체 랜딩(히어로~회사소식, mission-bg 등 수 MB 에셋 포함)이 먼저 렌더됐다가 로딩
  // 완료 후 상세로 전환되는 플래시가 있었다. 로딩 중에는 랜딩 대신 플레이스홀더만 보여준다.
  if (selectedId && loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white pt-16">
        <p className="text-sm font-medium text-[#767676]">불러오는 중입니다.</p>
      </main>
    );
  }

  if (selectedId && selectedRow) {
    return (
      <main className="min-h-screen bg-white pt-16">
        <NewsDetail row={selectedRow} onBack={() => setSearchParams({})} />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white pt-16">
      <HeroSection page={introPage} />
      <MissionSection />
      <BusinessSection />
      <LocationSection />
      <NewsSection
        rows={rows}
        loading={loading}
        onSelect={(id) => setSearchParams({ id: String(id) })}
        keyword={keyword}
        setKeyword={setKeyword}
        expanded={expanded}
        setExpanded={setExpanded}
      />
    </main>
  );
}
