// AI 아바타 — docs/수행평가-상세-명세.md §3.1 실측: 원래 3.25rem(52) 정사각, r0.75rem(12).
// **2026-09-06 결정**: 채팅 스케일을 사이트 다른 페이지 기준 한 단계 낮추면서 2.5rem(40)로
// 축소했다(팀 리더 결정, 표시 크기만 축소 — 반경 관례는 유지).
//
// **2026-09-06 아바타 에셋 결정**: 과거엔 "AI"/"위닝" 텍스트 배지가 정본이었으나(사진 에셋
// 없음), 이번 슬라이스에서 Figma 시안 일러스트(`3754:3592`, 52×52 r12 마스크)를 실제 자산으로
// 채택했다 — `public/images/performance/ai-avatar.png`. shadcn `Avatar`(`AvatarImage` +
// `AvatarFallback`)로 교체하고, 이미지 로드 실패 시에만 기존 "위닝" 텍스트 배지가 대체한다.
//
// `AiMessage`·`AiLoadingBubble` 둘 다 이 컴포넌트를 재사용한다. 장식 요소라 스크린리더에는
// 옆의 발신자 라벨("위닝 수행평가 서포터")이 이름을 대신하므로 `aria-hidden`을 건다.
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type AiAvatarProps = {
  className?: string;
};

export default function AiAvatar({ className = "" }: AiAvatarProps) {
  return (
    <Avatar
      aria-hidden="true"
      className={[
        "size-10 shrink-0 rounded-xl bg-performance-userBubble after:rounded-xl",
        className,
      ].join(" ")}
    >
      <AvatarImage
        src="/images/performance/ai-avatar.png"
        alt=""
        className="rounded-xl object-cover"
      />
      {/* 실측(원 시안): "AI" 16px/20 w600 #ffffff, @402,286 — 52×52 박스 안 텍스트(16×20)
          중앙 정렬과 정확히 일치. 이미지가 없을 때만 보이는 폴백이라 "위닝"(브랜드명,
          발신자 라벨·사이드바 메뉴 라벨과 표기 일관) 텍스트 배지를 그대로 둔다. */}
      <AvatarFallback className="rounded-xl bg-performance-userBubble text-app-label font-semibold text-white">
        위닝
      </AvatarFallback>
    </Avatar>
  );
}
