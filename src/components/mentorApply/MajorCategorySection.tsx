import {
  MAJOR_CATEGORIES,
  MAJOR_CATEGORY_SECTION,
} from "../../data/mentorApply";
import { MENTOR_ASSETS } from "../../data/mentorApplyAssets";
import ServiceSection from "../services/ServiceSection";
import { MENTOR_HEADING_LG } from "../services/serviceTokens";

// 멘토신청 §2 모집 대상 계열 — 8개 학문 계열 카드 그리드(docs/mentor-apply-spec.md §2, Figma 3362:2906).
//
// 왜 신규 컴포넌트인가 —
//   유일한 후보였던 ServiceAudienceCards 는 이미지가 **카드 상단 풀폭 h-[10.5rem]** 구조라
//   "텍스트 좌상단 + 일러스트 우하단 112×93" 인 이 시안과 카드 골격 자체가 다르다(명세 § 재사용
//   매핑 "재사용 불가" 확정). 섹션 껍데기(배경·컨테이너·아이브로·h2)만 ServiceSection 을
//   재사용하고 카드 행만 여기서 만든다 — 새 헤딩 컴포넌트를 만들지 않는다.
//
// 카피는 src/data/mentorApply.js, 이미지 경로는 src/data/mentorApplyAssets.js 가 정본이다.
// 이 파일에 문자열/경로 리터럴을 박지 마라(MentorSection.jsx 가 하드코딩 때문에 재사용 불가
// 판정을 받은 전례).
//
// 인터랙션 —
//   정적 표시 전용이다. 시안에 hover/pressed 상태도, 카드 border·shadow 자체도 없어(픽셀 스캔으로
//   #ffffff → #f9fafb 즉시 전환 확인) elevate 근거가 없다. 그래서 <article> 이며 링크·버튼이
//   아니고, transition/hover 클래스도 붙이지 않는다(명세 확인 항목 ⑨). 스크롤 진입 애니메이션도
//   시안 미정의라 넣지 않았다(확인 항목 ㊻).
//
// 반응형(768/375 시안 부재 — 확인 항목 ㊺, 아래는 저장소 관례를 따른 구현 재량):
//   - 열 수 `grid-cols-1 sm:grid-cols-2 wide:grid-cols-4` — 데스크톱 전환을 lg(1024)가 아니라
//     wide(74rem=1184px)로 잡는 것은 max-w-content(1164px)를 잘림 없이 확보하는 최소 뷰포트라서다
//     (tailwind.config.js screens.wide 주석 / ColumnList·AdmissionCases·SpecialHighschoolCases 와 동일 관용구).
//   - 카드 높이 195 고정은 wide 이상에서만 유지하고 그 아래는 min-height 로 푼다(명세 § 반응형 §2 행).
//   - 일러스트는 wide 미만에서 112×93 → 88×73 으로 축소한다(원본 비율 112:93 유지).
export default function MajorCategorySection() {
  return (
    <ServiceSection
      surface="softGray"
      eyebrow={MAJOR_CATEGORY_SECTION.eyebrow}
      heading={MAJOR_CATEGORY_SECTION.title}
      headingClassName={MENTOR_HEADING_LG}
      // 상하 패딩 150/150(9.375rem)은 wide 이상에서만. 그 아래는 명세 § 반응형 전략 표대로
      // md~wide 100(6.25rem) / <md 64~80(ServiceSection 기본 pt-16 sm:pt-20)으로 낮춘다.
      className="pb-16 sm:pb-20 md:pt-[6.25rem] md:pb-[6.25rem] wide:pt-[9.375rem] wide:pb-[9.375rem]"
    >
      {/* 헤더블록 ↔ 그리드 gap 32(2rem), 카드 간 gap 14(0.875rem, 가로·세로 동일) */}
      <ul className="mt-8 grid grid-cols-1 gap-[0.875rem] sm:grid-cols-2 wide:grid-cols-4">
        {MAJOR_CATEGORIES.map((category) => (
          <li key={category.key}>
            {/* radius 8.235px → 0.5rem(rounded-lg)로 정규화(명세 확인 항목 ⑨).
                border/shadow 없음. 패딩은 시안 실측 좌 30 / 상 28 / 우 20 / 하 20 —
                일러스트를 절대배치하지 않고 mt-auto self-end 로 흘려 보내므로
                좁은 폭에서 텍스트와 겹치지 않는다. */}
            <article className="flex h-full min-h-[10.5rem] flex-col rounded-lg bg-white px-5 pb-5 pt-6 sm:pl-[1.875rem] sm:pt-[1.75rem] wide:min-h-[12.1875rem]">
              {/* 타이틀 ↔ 서브 gap 3.993px ≈ 4px(0.25rem) */}
              <div className="flex flex-col gap-1">
                {/* 카드 타이틀 20 SemiBold — 시안 #181D24 = ink.title.
                    ⚠ 같은 섹션의 h2 는 #191D23(ink.strong)으로 1비트 다른 별도 토큰이다.
                       통일 여부 미확정이라 h2 는 MENTOR_HEADING_LG 그대로 둔다(확인 항목 ⑦). */}
                <p className="text-xl font-semibold leading-[1.4] text-ink-title">
                  {category.title}
                </p>
                {/* 카드 서브 14 Regular #525252 = ink. 구분자는 가운뎃점(U+00B7) 원문 그대로 */}
                <p className="break-keep text-sm font-normal leading-[1.4] text-ink">
                  {category.desc}
                </p>
              </div>

              {/* 일러스트 — 계열명을 그림으로 반복할 뿐 새 정보가 없어 장식 처리(alt='' + aria-hidden).
                  w/h 를 둘 다 명시한다: 미지정 시 SVG 원본 크기로 튀어 그리드가 깨진다. */}
              <img
                src={MENTOR_ASSETS.majors[category.key]}
                alt=""
                aria-hidden="true"
                width={112}
                height={93}
                loading="lazy"
                className="mt-auto h-[4.5625rem] w-[5.5rem] self-end wide:h-[5.8125rem] wide:w-[7rem]"
              />
            </article>
          </li>
        ))}
      </ul>
    </ServiceSection>
  );
}
