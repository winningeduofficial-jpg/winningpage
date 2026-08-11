import { BENEFIT_SECTION, BENEFITS } from '../../data/mentorApply';
import { MENTOR_ASSETS } from '../../data/mentorApplyAssets';
import ServiceSection from '../services/ServiceSection';
import { MENTOR_HEADING_LG } from '../services/serviceTokens';

// 멘토신청 §3 활동 혜택 — 아이콘 + 제목 + 설명 3카드 (docs/mentor-apply-spec.md §3, Figma 3408:4289).
//
// 왜 신규 컴포넌트인가 —
//   `services/ServiceStepCards.jsx` 가 구조상 가장 가깝지만 (a) 아이콘 슬롯이 아예 없고
//   (b) 카드 내부가 좌측 정렬 텍스트 전용이다. 이 섹션은 150×150 일러스트가 카드 중앙에 놓이는
//   센터 정렬 카드라, ServiceStepCards 에 정렬·아이콘 prop 두 개를 새로 뚫으면 4개 서비스 랜딩의
//   기준 카드가 조건 분기투성이가 된다(명세 §재사용 매핑 "확장 필요" 판정). 그래서 분리한다.
//
// 카피는 `data/mentorApply.js`, 이미지 경로는 `data/mentorApplyAssets.js` 가 단일 정본이다 —
// 이 파일에 문자열/경로 리터럴을 박지 마라(`landing/MentorSection.jsx` 가 카피 하드코딩 때문에
// 재사용 불가 판정을 받은 선례).
//
// 시안 실측 → rem:
//   카드 292×322(고정 높이는 반응형에서 해제, 명세 §11) / radius 20(1.25rem) / 배경 #F9FAFB
//   패딩 좌우 23(1.4375rem)·상하 28(1.75rem) / 아이콘 슬롯 150(9.375rem)
//   아이콘↔텍스트 gap 11(0.6875rem) / 제목↔설명 gap 20(1.25rem) / 카드 gap 23(1.4375rem)
//   타이틀↔카드행 gap 32(2rem)
//
// 카드 배경 #F9FAFB 는 tailwind `surface.footer` 토큰과 동일 값이라 신규 hex 없이 처리했다.
// 카드 그림자는 시안에 **없다**(§4 상담 카드와 다른 점) — 임의로 넣지 마라.

// 아이콘 슬롯. 시안은 150×150 고정이지만 sm 2열 구간에서 카드 내부 폭이 좁아지므로
// 모바일/sm 은 120(7.5rem)으로 낮추고 lg 에서 시안값으로 복귀한다(768/375 시안 부재, 확인 항목 ㊺).
// 원본 PNG 는 카드마다 실제 비율이 다르므로(132×102 / 124×91 / 134×102) object-contain 으로
// 슬롯 안에 레터박스 처리한다. w/h 를 모두 명시해 원본 크기로 튀는 것을 막는다.
const BENEFIT_ICON_CLASS =
  'h-[7.5rem] w-[7.5rem] shrink-0 object-contain lg:h-[9.375rem] lg:w-[9.375rem]';

// 카드 제목 24 SemiBold / lh 1.4 / ls -0.02em / #181D24(ink.title).
// 본문 16 Regular / lh 1.4 / #525252(ink). 두 값 모두 서비스 랜딩 공통 카드 타이포
// (serviceTokens CARD_TITLE_CLASS/CARD_DESC_CLASS)와 크기·색·굵기가 달라 재사용하지 않는다.
const BENEFIT_TITLE_CLASS =
  'break-keep text-[1.25rem] font-semibold leading-[1.4] tracking-[-0.02em] text-ink-title lg:text-[1.5rem]';
const BENEFIT_DESC_CLASS =
  'whitespace-pre-line break-keep text-[1rem] font-normal leading-[1.4] text-ink';

export default function BenefitSection({ className = '' }) {
  return (
    <ServiceSection
      heading={BENEFIT_SECTION.title}
      headingClassName={MENTOR_HEADING_LG}
      className={className}
    >
      {/*
        열 수: 데스크톱 3열(시안), sm 2열, 모바일 1열 스택 — 명세 §11 반응형 표 그대로다.
        sm 2열에서 3번째 카드가 2행에 홀로 남는 것은 이 저장소의 기존 관례를 따른 것이다
        (ServiceStepCards / ServiceAudienceCards 모두 sm:grid-cols-2 로 홀수 잔여를 허용).
        카드 높이 322 고정은 해제하고 grid 의 stretch 로 3장 높이를 맞춘다.
      */}
      <ul className="mt-8 grid grid-cols-1 gap-[1.4375rem] sm:grid-cols-2 lg:grid-cols-3">
        {BENEFITS.map((item) => (
          <li key={item.key} className="flex">
            <article className="flex w-full flex-col items-center justify-center gap-[0.6875rem] rounded-[1.25rem] bg-surface-footer px-[1.4375rem] py-[1.75rem] text-center">
              {/* 일러스트는 바로 옆 제목이 뜻을 그대로 전달하는 장식 요소라 접근성 트리에서 뺀다. */}
              <img src={MENTOR_ASSETS.benefits[item.key]} alt="" aria-hidden="true" className={BENEFIT_ICON_CLASS} />
              <div className="flex flex-col gap-[1.25rem]">
                <h3 className={BENEFIT_TITLE_CLASS}>{item.title}</h3>
                {/* desc 의 `\n` 은 시안 강제 개행이라 whitespace-pre-line 으로 보존한다. */}
                <p className={BENEFIT_DESC_CLASS}>{item.desc}</p>
              </div>
            </article>
          </li>
        ))}
      </ul>
    </ServiceSection>
  );
}
