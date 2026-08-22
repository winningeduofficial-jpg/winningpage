import { MENTOR_HEADING_MD } from "@/components/services/serviceTokens";
import { COUNSEL_FIELD_SECTION, COUNSEL_FIELDS } from "@/data/mentorApply";
import { MENTOR_ASSETS } from "@/data/mentorApplyAssets";

// 멘토신청 §4 상담 분야 — 7카드 2줄 그리드 (docs/mentor-apply-spec.md §4 F-1, Figma 3408:4545).
//
// ⚠ QA 지시(2026-08-21)로 무한 마퀴 트랙을 정적 그리드로 교체했다 — "가로 스크롤/잘림 없이
//   2줄(예: 4+3)로 전체 카드가 보여야 한다"는 지적이다. 이전 구현(무한 마퀴, git 이력 참고)은
//   2026-08-11 사용자 지시에 따른 것이었으나, 이번 QA 라운드에서 정반대 요구(가로 스크롤 제거)로
//   뒤집혔다 — 최신 지시가 우선이다.
//   `wide` 이상에서는 grid-cols-4 라 7장이 4+3 두 줄로 떨어지고(마지막 줄 4번째 칸은 빈 채로
//   남는다), 그 아래 폭에서는 화면에 맞춰 열이 줄며 더 많은 줄로 자연히 랩된다.
//
// 왜 신규 컴포넌트인가 —
//   `services/ServiceOutcomesPanel.jsx` 는 4/5열 + divide-x 로 나뉜 **단일 패널** 구조라
//   개별 그림자 카드 7장과 DOM 이 근본적으로 다르고, 아이콘 높이도 고정이라 7열에서 라벨이 깨진다
//   (명세 §재사용 매핑 "재사용 불가" 확정).
//
// 시안 실측 → rem:
//   카드 292×322 / radius 20(1.25rem) / 배경 #FFFFFF / 그림자 0 4px 8px rgba(0,0,0,.1)
//   패딩 좌우 23(1.4375rem)·상하 28(1.75rem) / 카드 gap 23(1.4375rem)
//   아이콘 슬롯 150(9.375rem) / 제목↔설명 gap 20(1.25rem) / 타이틀↔카드행 gap 52(3.25rem)
//
// ⚠ `계획·시간관리`(2번)와 `대학·입시전략`(5번)이 **같은 달력+시계 아이콘**을 공유한다.
//   시안의 미완/플레이스홀더로 보이지만(명세 확인 항목 ⑪) 매니페스트가 주는 대로 쓴다 —
//   전용 아이콘이 확정되면 mentorApplyAssets.js 의 admissionStrategy 키만 교체하면 된다.

// 카드는 그리드 셀 폭을 그대로 채운다(고정폭 292 는 마퀴 전용이라 폐기) — CSS Grid 는 기본
// align-items: stretch 라 h-full 만으로 같은 행의 카드 높이가 자연히 맞는다.
const COUNSEL_CARD_CLASS =
  "flex h-full w-full flex-col items-center rounded-perf-modal bg-white px-5.75 py-7 text-center shadow-[0_0.25rem_0.5rem_rgba(0,0,0,0.1)]";

// 아이콘 슬롯 150×150. 원본 PNG 는 카드마다 실제 비율이 달라(110×124 ~ 126×126) object-contain
// 으로 슬롯 안에 레터박스 처리하고, w/h 를 모두 명시해 원본 크기로 튀는 것을 막는다.
const COUNSEL_ICON_CLASS = "h-37.5 w-37.5 shrink-0 object-contain";

// 카드 제목 24 SemiBold / lh 1.3 / #191D23(ink.strong) — §3 혜택 카드(#181D24, lh 1.4)와 다르다.
// 설명 16 Regular / lh 1.3 / #525252(ink).
const COUNSEL_TITLE_CLASS =
  "break-keep text-[1.25rem] font-semibold leading-[1.3] text-ink-strong lg:text-[1.5rem]";

// 설명 min-height 2줄 고정 — 카드 1~3 은 설명이 2줄, 4~7 은 1줄이라 그대로 두면 카드 높이가
// 달라지고(그리드 stretch 로 높이를 맞춰도) 아이콘 세로 위치가 카드마다 어긋난다(확인 항목 ⑬).
// 16px × lh 1.3 × 2줄 = 41.6px = 2.6rem.
const COUNSEL_DESC_CLASS =
  "min-h-[2.6rem] whitespace-pre-line break-keep text-[1rem] font-normal leading-[1.3] text-ink";

type CounselFieldSectionProps = {
  className?: string;
};

export default function CounselFieldSection({
  className = "lg:pt-35",
}: CounselFieldSectionProps) {
  return (
    // 껍데기(bg-white pt-16 sm:pt-20)는 ServiceSection 과 문자 동일. 기본 className 의
    // lg:pt-35 은 시안의 §3 블록 ↔ §4 블록 세로 간격 140px 이다(페이지에서 덮어쓸 수 있다).
    <section className={`bg-white pt-16 sm:pt-20 ${className}`}>
      <div className="mx-auto w-full max-w-content px-5 sm:px-8">
        {/* 시안상 이 타이틀만 뷰포트 정중앙 정렬이다(타이틀 프레임 중심 x=960.5 = 1920/2). */}
        <h2 className={`${MENTOR_HEADING_MD} text-center`}>
          {COUNSEL_FIELD_SECTION.title}
        </h2>

        {/* 2줄 그리드(4+3) — wide 미만에서는 폭에 맞춰 열 수가 줄며 더 많은 줄로 랩된다.
            gap-5.75(23px)는 마퀴 시절 카드 gap 수치를 그대로 승계한다. */}
        <ul className="mt-8 grid grid-cols-2 gap-5.75 sm:mt-10 sm:grid-cols-3 lg:mt-13 wide:grid-cols-4">
          {COUNSEL_FIELDS.map((item) => (
            <li key={item.key} className="flex">
              <article className={COUNSEL_CARD_CLASS}>
                {/* 일러스트는 바로 옆 제목이 뜻을 그대로 전달하는 장식 요소라 접근성 트리에서 뺀다. */}
                <img
                  src={MENTOR_ASSETS.fields[item.key]}
                  alt=""
                  aria-hidden="true"
                  className={COUNSEL_ICON_CLASS}
                />
                <div className="mt-2.75 flex flex-col gap-5">
                  <h3 className={COUNSEL_TITLE_CLASS}>{item.title}</h3>
                  {/* desc 의 `\n` 은 시안 강제 개행이라 whitespace-pre-line 으로 보존한다. */}
                  <p className={COUNSEL_DESC_CLASS}>{item.desc}</p>
                </div>
              </article>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
