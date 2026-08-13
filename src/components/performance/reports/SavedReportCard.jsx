import { Link } from "react-router-dom";
import ArtifactChip from "./ArtifactChip";

// 저장 리포트 목록 카드 — docs/수행평가-상세-명세.md §5.18(`3754:3121`)/§7.3 실측.
//
// 카드 50rem×11.25rem(800×180) r1.25rem(20) `fill #ffffff` stroke `#d9d9d9`, pad 2rem(32).
// 제목 클릭은 상세 라우트(`/app/performance/reports/:sessionId`)로 이동하고, 칩 클릭은
// 라우트 이동 없이 그 산출물의 뷰어 모달을 바로 연다(호출부의 `onArtifactClick`) — §5.18이
// 목록 화면에서 3종 산출물을 바로 열람하는 것을 전제한다(「타입별 버튼」).
//
// 미보유 산출물 라벨은 `설계 리포트 없음`/`평가 리포트 없음`/`최종 제출본 없음`(§5.18 문구
// 원문, `index.html:2910-2913`과 일치) — 이 컴포넌트가 보유/미보유에 따라 라벨을 고른다.

/** `2026. 07. 24` 포맷(§5.18 문구 원문). */
export function formatSavedAt(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}. ${m}. ${d}`;
}

const ARTIFACT_LABELS = {
  design: { available: "설계 리포트", unavailable: "설계 리포트 없음" },
  evaluation: { available: "평가 리포트", unavailable: "평가 리포트 없음" },
  final: { available: "최종 제출본", unavailable: "최종 제출본 없음" },
};

/**
 * @param {string} title `topicTitle` — 없으면 플레이스홀더 문구로 대체한다(빈 제목 링크 방지).
 * @param {string} meta `고1 1학기 · 수학 / 공통수학 1 · 의학` 조합(호출부가 조립해 넘긴다).
 * @param {string} savedAt `updatedAt`(ISO).
 * @param {string} sessionId 상세 라우트 대상.
 * @param {{design: {available: boolean, reportId: string|null}, evaluation: {...}, final: {...}}} artifacts
 * @param {(type: 'design'|'evaluation'|'final', reportId: string) => void} onArtifactClick
 */
export default function SavedReportCard({
  title,
  meta,
  savedAt,
  sessionId,
  artifacts,
  onArtifactClick,
}) {
  return (
    <div className="flex h-[11.25rem] w-[50rem] flex-col justify-between rounded-[1.25rem] border border-performance-line bg-white p-8">
      <div className="min-w-0">
        <Link
          to={`/app/performance/reports/${sessionId}`}
          className="block truncate text-[1.25rem] font-semibold leading-[1.625rem] tracking-[-0.025rem] text-ink hover:underline"
        >
          {title || "제목 없는 수행평가"}
        </Link>
        <p className="mt-2 truncate text-[0.875rem] font-normal leading-[1.125rem] tracking-[-0.0175rem] text-ink-sub">
          {[meta, formatSavedAt(savedAt)].filter(Boolean).join(" · ")}
        </p>
      </div>

      <div className="flex gap-3">
        {["design", "evaluation", "final"].map((type) => {
          const artifact = artifacts?.[type] || {
            available: false,
            reportId: null,
          };
          const labels = ARTIFACT_LABELS[type];
          return (
            <ArtifactChip
              key={type}
              label={artifact.available ? labels.available : labels.unavailable}
              available={Boolean(artifact.available)}
              onClick={() => onArtifactClick?.(type, artifact.reportId)}
            />
          );
        })}
      </div>
    </div>
  );
}
