// 자녀 카드 (Figma 3636:104).
//
// 데이터는 fn_parent_children(sql/73)이 내려주는 한 행이다.
//
// ── 시안과 데이터가 어긋나는 지점 ──────────────────────────────────────
// 1) 시안 부제는 "고1 · 위닝고등학교 · 희망 진로 의학"인데, profiles 에는
//    학년(숫자)도 희망 진로도 없다(school_type/school_name 만 있다).
//    희망 진로는 목표관리 온보딩 쪽 데이터라 이 카드의 조회 축이 아니다 —
//    지어내지 않고 있는 값(학교명 · 학교급)만 조립한다.
// 2) 시안의 우상단 버튼은 [관리]인데 그 버튼이 무엇을 여는지는 파일 어디에도
//    그려져 있지 않다. 반면 같은 화면의 다른 리비전(3360:10499)은 같은
//    자리에 [삭제하기]를 두고 있고, 삭제 확인 모달(3709:2630)도 존재한다.
//    구현 가능한 동작이 삭제 하나뿐이라 [삭제하기]로 뒀다 — [관리]가 별도
//    화면이라면 디자인이 필요하다.
// 3) 하단 링크는 두 개다(QA 시트 행210). "학습진단 리포트 →"는 자녀의 학습진단
//    결과 리포트로(경로만 여기서 정의 — 라우트 등록은 별도 단위), "목표관리
//    리포트 →"는 /mypage/children/:studentId/report(학부모 뷰어,
//    src/pages/mypage/ChildReport.tsx)로 간다. 수락 전(pending)에는 볼 것이
//    없으므로 둘 다 링크를 걸지 않는다.

import { Link } from "react-router";

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  approved: { label: "연결됨", cls: "bg-performance-chip text-accent" },
  pending: { label: "수락대기", cls: "bg-[#ffd9d9] text-error" },
};

function formatLinkedAt(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
}

// 기간권은 만료일, 회차권은 잔여 횟수로 표시한다. 둘 다 있으면(예: 3개월
// 6회권) 회차를 우선한다 — 소진 단위가 회차이기 때문이다.
type ChildService = {
  program_key: string;
  program_name: string;
  remaining?: number | null;
  unlimited_period?: boolean;
  expires_at?: string | null;
};

function serviceStatusText(service: ChildService) {
  if (service.remaining !== null && service.remaining !== undefined) {
    return `잔여 ${service.remaining}회`;
  }
  if (service.unlimited_period) return "이용중";
  if (service.expires_at) {
    const d = new Date(service.expires_at);
    if (!Number.isNaN(d.getTime())) {
      // expires_at 은 배타 상한(sql/64) — 표시용 만료일은 하루 뺀 날짜다.
      d.setDate(d.getDate() - 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `이용중 ~${y}.${m}.${day}`;
    }
  }
  return "이용중";
}

export type Child = {
  link_id: string;
  link_status: "approved" | "pending";
  student_name: string;
  school_name?: string | null;
  school_type?: string | null;
  services?: ChildService[];
  linked_at?: string | null;
  student_profile_id: string;
};

type ChildCardProps = {
  child: Child;
  onRemove?: (child: Child) => void;
};

export default function ChildCard({ child, onRemove }: ChildCardProps) {
  // STATUS_BADGE.pending은 위 리터럴에 항상 정의돼 있다(Record<string,...> 인덱스
  // 시그니처 때문에 타입만 optional로 보인다).
  const badge = STATUS_BADGE[child.link_status] || STATUS_BADGE.pending!;
  const subtitle = [child.school_name, child.school_type]
    .filter(Boolean)
    .join(" · ");
  const services = Array.isArray(child.services) ? child.services : [];

  return (
    <div className="flex w-full flex-col rounded-2xl border border-line bg-white p-8.25">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[1.0625rem] font-semibold text-ink">
            {child.student_name}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-[0.75rem] font-semibold ${badge.cls}`}
          >
            {badge.label}
          </span>
        </div>
        <button
          type="button"
          onClick={() => onRemove?.(child)}
          className="shrink-0 rounded-md border border-line px-3 py-1 text-[0.75rem] text-ink-sub transition hover:bg-surface-04"
        >
          삭제하기
        </button>
      </div>

      {subtitle && (
        <p className="mt-2 text-[0.8125rem] text-ink-sub">{subtitle}</p>
      )}

      <div className="mt-5 flex flex-col gap-1.5">
        {child.link_status !== "approved" ? (
          <p className="rounded-lg bg-surface-04 px-4 py-3 text-[0.8125rem] text-ink-sub">
            자녀가 연결 요청을 수락하면 이용 내역이 표시돼요
          </p>
        ) : services.length === 0 ? (
          <p className="rounded-lg bg-surface-04 px-4 py-3 text-[0.8125rem] text-ink-sub">
            이용 중인 서비스가 없어요
          </p>
        ) : (
          services.map((service) => (
            <div
              key={service.program_key}
              className="flex items-center justify-between gap-3 rounded-lg bg-surface-04 px-4 py-2.5"
            >
              <span className="truncate text-[0.8125rem] text-ink">
                {service.program_name}
              </span>
              <span className="shrink-0 text-[0.8125rem] font-medium text-accent">
                {serviceStatusText(service)}
              </span>
            </div>
          ))
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <span className="text-[0.75rem] text-ink-sub">
          {formatLinkedAt(child.linked_at)}{" "}
          {child.link_status === "approved" ? "연결" : "요청"}
        </span>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {child.link_status === "approved" ? (
            <>
              <Link
                to={`/mypage/children/${child.student_profile_id}/report/diagnosis`}
                className="text-[0.8125rem] font-medium text-accent transition hover:brightness-90"
              >
                학습진단 리포트 →
              </Link>
              <Link
                to={`/mypage/children/${child.student_profile_id}/report`}
                className="text-[0.8125rem] font-medium text-accent transition hover:brightness-90"
              >
                목표관리 리포트 →
              </Link>
            </>
          ) : (
            <>
              <span
                aria-disabled="true"
                title="자녀가 연결 요청을 수락하면 열람할 수 있어요."
                className="cursor-not-allowed text-[0.8125rem] font-medium text-ink-sub/60"
              >
                학습진단 리포트 →
              </span>
              <span
                aria-disabled="true"
                title="자녀가 연결 요청을 수락하면 열람할 수 있어요."
                className="cursor-not-allowed text-[0.8125rem] font-medium text-ink-sub/60"
              >
                목표관리 리포트 →
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
