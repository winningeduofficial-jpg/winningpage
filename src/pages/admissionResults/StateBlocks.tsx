// 로딩 / 에러 / 빈 상태 공통 블록.
//
// 저장소에 스켈레톤 관례가 없다(animate-pulse grep 0건). 텍스트 플레이스홀더가 정본이며
// 클래스는 AdmissionGuidelines.jsx:1493-1518을 그대로 따른다.

export function LoadingBlock({ title = "입결 데이터를 불러오는 중입니다." }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-2xl border border-[#e5e7eb] bg-[#f9fafb] py-16 text-center"
    >
      <p className="text-lg font-semibold text-[#525252]">{title}</p>
    </div>
  );
}

export function ErrorBlock({
  title = "입결 데이터를 불러오지 못했습니다.",
  description = "잠시 후 다시 시도해 주세요.",
  onRetry,
}) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 py-16 text-center">
      <p className="text-lg font-semibold text-red-600">{title}</p>
      <p className="mt-2 text-sm font-medium text-red-400">{description}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded-full border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-100"
        >
          다시 시도
        </button>
      ) : null}
    </div>
  );
}

// 팝오버 내부용 축약 버전 — 바깥 블록(py-16)을 그대로 쓰면 드롭다운이 과하게 길어진다.
export function PopoverStatus({
  title,
  description,
  onRetry,
  tone = "default",
}) {
  const titleClass = tone === "error" ? "text-red-600" : "text-[#525252]";

  return (
    <div className="px-6 py-10 text-center">
      <p className={`break-keep text-base font-semibold ${titleClass}`}>
        {title}
      </p>
      {description ? (
        <p className="mt-2 break-keep text-sm font-medium text-[#8f8f8f]">
          {description}
        </p>
      ) : null}
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded-full border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-100"
        >
          다시 시도
        </button>
      ) : null}
    </div>
  );
}
