/**
 * 멘토 카드 (MentorSection에서 추출한 프레젠테이션 컴포넌트)
 * - 카드 = #fbfafa 배경 + 상단 텍스트(badge/title_lines) + 하단 투명 인물사진(photo_url/photo) 합성
 * - badge/title_lines/photo_url/photo 중 하나라도 없는 row는 카드를 렌더하지 않음(null 반환)
 * - 마퀴/클론 로직은 MentorSection이 소유 — 이 컴포넌트는 isClone 여부만 받아 aria-hidden 처리
 * - 관리자 라이브 프리뷰에서도 동일 컴포넌트를 사용해 프리뷰=실렌더를 보장
 * - 0803 시안(카드 156px 폭, 시안 실값 155.84 — 210 원본 대비 ×0.742 균일 축소)은 DB의 210 기준
 *   원본 좌표를 그대로 두고 렌더 시 RENDER_SCALE(156/210)을 곱해서 축소한다 — DB 마이그레이션 없이
 *   시안에 맞춘다.
 *
 * @param {object} props
 * @param {{
 *   id: string,
 *   mentor_name?: string,
 *   badge?: string,
 *   title_lines?: string[],
 *   photo_url?: string,
 *   photo?: { top: number, left: number, width: number, height: number,
 *     crop?: { top: string, height: string } },
 *   card_width?: number,
 *   sort_order?: number,
 * }} props.mentor
 *   home_mentor_strategies row.
 *   - mentor_name: alt 텍스트 생성용 ("${mentor_name} 멘토")
 *   - badge/title_lines: 카드 상단 텍스트 블록 (badge 1행 + title_lines 각 라인)
 *   - photo_url/photo: 카드 하단 투명 인물사진 및 절대 위치(px, 210 기준 원본 — 렌더 시 RENDER_SCALE 적용 후 rem 환산)
 *   - photo.crop: 사진 높이가 카드를 초과해 내부 크롭이 필요한 경우만 존재 (예: 김성훈)
 *   - card_width: 카드 너비(px, 210 기준 원본), 기본 210
 * @param {boolean} [props.isClone=false]
 *   마퀴 N배 반복 중 클론 사이클 여부 — true면 aria-hidden 처리로 스크린리더에서 제외
 * @returns {JSX.Element|null}
 *   badge/title_lines/photo_url/photo 중 하나라도 없으면 null (카드 미노출)
 */

// 0803 시안 카드 156px 폭 (시안 실값 155.84, 210 원본 대비 ×0.742 균일 축소) 기준 렌더 스케일
// (DB는 여전히 210 기준 원본 좌표를 저장) — 이 스케일 하나로 높이/radius/텍스트/사진 좌표가 함께 축소된다.
const RENDER_SCALE = 156 / 210;

// 210 기준 카드 고정 치수(px) — 렌더 시 RENDER_SCALE 적용 후 rem 환산
const CARD_HEIGHT_PX = 360;
const CARD_RADIUS_PX = 20;
const TEXT_BLOCK_TOP_PX = 24;
const TEXT_BLOCK_WIDTH_PX = 196;
const TEXT_GAP_PX = 4;
const BADGE_FONT_PX = 16;
const LINE_FONT_PX = 15;

const toRem = (px) => `${(px * RENDER_SCALE) / 16}rem`;

export default function MentorCard({ mentor, isClone = false }) {
  const hasNewCard = Boolean(
    mentor.badge && mentor.title_lines && mentor.photo_url && mentor.photo,
  );
  if (!hasNewCard) return null;

  return (
    <li
      aria-hidden={isClone || undefined}
      className="relative shrink-0 overflow-hidden bg-[#fbfafa]"
      style={{
        width: toRem(mentor.card_width || 210),
        height: toRem(CARD_HEIGHT_PX),
        borderRadius: toRem(CARD_RADIUS_PX),
      }}
    >
      <div
        className="absolute left-1/2 flex -translate-x-1/2 flex-col items-center text-center"
        style={{
          top: toRem(TEXT_BLOCK_TOP_PX),
          width: toRem(TEXT_BLOCK_WIDTH_PX),
          gap: toRem(TEXT_GAP_PX),
        }}
      >
        <p
          className="font-semibold leading-[1.4] text-[#525252]"
          style={{ fontSize: toRem(BADGE_FONT_PX) }}
        >
          {mentor.badge}
        </p>
        {mentor.title_lines.map((line) => (
          <p
            key={line}
            className="font-medium leading-[1.4] text-[#808080]"
            style={{ fontSize: toRem(LINE_FONT_PX) }}
          >
            {line}
          </p>
        ))}
      </div>
      <div
        className={`absolute ${mentor.photo.crop ? "overflow-hidden" : ""}`}
        style={{
          top: toRem(mentor.photo.top),
          left: toRem(mentor.photo.left),
          width: toRem(mentor.photo.width),
          height: toRem(mentor.photo.height),
        }}
      >
        <img
          src={mentor.photo_url}
          alt={`${mentor.mentor_name} 멘토`}
          loading="lazy"
          draggable="false"
          className={
            mentor.photo.crop
              ? "absolute left-0 w-full object-cover"
              : "h-full w-full object-cover"
          }
          style={
            mentor.photo.crop
              ? { top: mentor.photo.crop.top, height: mentor.photo.crop.height }
              : undefined
          }
        />
      </div>
    </li>
  );
}
