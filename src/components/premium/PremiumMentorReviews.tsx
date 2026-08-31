import type { ReactNode } from "react";
import PremiumSectionHeading from "./PremiumSectionHeading";
import {
  PREMIUM_CONTAINER_CLASS,
  PREMIUM_GOLD_TEXT_CLASS,
  PREMIUM_HEADING_GAP_CLASS,
  PREMIUM_SECTION_PADDING_CLASS,
} from "./premiumTokens";

// "같은 길을 먼저 걸어간 멘토가 이끕니다" 섹션(해외명문대 진학컨설팅 전용, 흰 bg). 좌측
// 원형 사진(13rem=208px)+이름, 우측 후기 문단+인용 라벨+태그 pill. 데이터는 페이지가
// const 배열로 소유한다(DB 아님 — 시안 정적 카피).
type MentorReview = {
  name: string;
  photo: string;
  quote: string;
  attribution: string;
  tags: string[];
};

type PremiumMentorReviewsProps = {
  heading: ReactNode;
  mentors: MentorReview[];
};

export default function PremiumMentorReviews({
  heading,
  mentors,
}: PremiumMentorReviewsProps) {
  if (!mentors || mentors.length === 0) return null;

  return (
    <section className={`bg-white ${PREMIUM_SECTION_PADDING_CLASS}`}>
      <div className={PREMIUM_CONTAINER_CLASS}>
        <PremiumSectionHeading heading={heading} />

        <div className={`flex flex-col gap-6 ${PREMIUM_HEADING_GAP_CLASS}`}>
          {mentors.map((mentor) => (
            <div
              key={mentor.name}
              className="flex flex-col gap-6 border border-line p-6 sm:flex-row sm:gap-10 sm:p-8"
            >
              <div className="flex shrink-0 flex-col items-center gap-4 sm:w-[13rem] sm:items-start">
                <img
                  src={mentor.photo}
                  alt={`${mentor.name} 멘토`}
                  width="208"
                  height="208"
                  loading="lazy"
                  className="size-52 rounded-full object-cover"
                />
                <p className="break-keep text-[1.125rem] font-semibold leading-[1.4] text-ink-strong">
                  {mentor.name} 멘토
                </p>
              </div>
              <div className="min-w-0 flex-1">
                <p className="break-keep text-[0.9375rem] leading-[1.7] text-ink">
                  {mentor.quote}
                </p>
                <p
                  className={`mt-4 break-keep text-[0.875rem] font-medium leading-[1.4] ${PREMIUM_GOLD_TEXT_CLASS}`}
                >
                  {mentor.attribution}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {mentor.tags.map((tag) => (
                    <span
                      key={tag}
                      className="whitespace-nowrap rounded-full border border-line px-4 py-1.5 text-[0.8125rem] leading-[1.4] text-ink-strong"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
