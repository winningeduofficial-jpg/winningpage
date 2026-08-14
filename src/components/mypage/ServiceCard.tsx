import { Link } from "react-router-dom";

/**
 * 마이페이지 "나의 서비스" 탭 카드 — Figma hsokTD6OilcNEXyCR24sn4 노드 3762:18713 실측.
 * 데이터 유도(주문명 파싱, 상태·카테고리 분류)는 상위 MyServicesTab.jsx가 전담하고,
 * 이 컴포넌트는 이미 만들어진 view-model(card)만 그대로 그린다.
 *
 * "프로그램 가기 →" 등 화살표는 시안에서 별도 아이콘이 아니라 텍스트에 포함된 문자라
 * 아이콘 asset 대신 유니코드 화살표를 그대로 라벨에 붙여 렌더링한다.
 *
 * @param {object} props
 * @param {object} props.card
 * @param {string} props.card.id
 * @param {string} props.card.serviceName
 * @param {string} props.card.statusLabel '이용중' | '잔여 N회' | '이용완료'
 * @param {boolean} props.card.isOngoing
 * @param {number} props.card.progressPercent 0~100
 * @param {string} props.card.metaLeft 메타 한 줄 좌측(이용기간/회권/진단 완료 등)
 * @param {string} props.card.metaRight 메타 한 줄 우측(남은일수/유효기간/완료일 등)
 * @param {Array<{kind: 'link'|'outline'|'solid', label: string, href: string}>} props.card.actions
 */
export default function ServiceCard({ card }) {
  const {
    serviceName,
    statusLabel,
    isOngoing,
    progressPercent,
    metaLeft,
    metaRight,
    actions,
  } = card;

  const statusPillClass = isOngoing
    ? "bg-[#e7f2fb] text-accent"
    : "bg-[#d9d9d9] text-ink-sub";

  return (
    <div className="flex flex-col gap-[1.1875rem] rounded-[1.25rem] border border-[#d9d9d9] bg-white p-[2rem]">
      <div className="flex items-center justify-between gap-[0.75rem]">
        <h3 className="text-[1.25rem] font-semibold leading-[1.3] tracking-[-0.025rem] text-ink">
          {serviceName}
        </h3>
        <span
          className={`inline-flex h-[2rem] shrink-0 items-center justify-center whitespace-nowrap rounded-[0.5rem] px-[0.75rem] text-[0.875rem] font-semibold leading-[1.4] ${statusPillClass}`}
        >
          {statusLabel}
        </span>
      </div>

      <div className="h-[0.375rem] w-full rounded-[0.75rem] bg-[#d9d9d9]">
        <div
          className="h-full rounded-[0.75rem] bg-primary"
          style={{ width: `${Math.round(progressPercent)}%` }}
        />
      </div>

      <div className="flex items-center justify-between gap-[0.5rem] text-[0.875rem] leading-[1.4] tracking-[-0.0175rem] text-ink-sub">
        <span>{metaLeft}</span>
        <span>{metaRight}</span>
      </div>

      {isOngoing ? (
        <Link
          to={actions[0].href}
          className="text-[0.875rem] font-medium leading-[1.4] tracking-[-0.0175rem] text-accent transition hover:opacity-80"
        >
          {actions[0].label} →
        </Link>
      ) : (
        <div className="flex items-center gap-[0.5rem]">
          {actions.map((action) => (
            <Link
              key={action.kind}
              to={action.href}
              className={
                action.kind === "outline"
                  ? "inline-flex h-[2rem] w-[8.25rem] items-center justify-center rounded-[0.5rem] border border-[#d9d9d9] text-[0.875rem] font-semibold tracking-[-0.0175rem] text-ink-sub transition hover:bg-surface-04"
                  : "inline-flex h-[2rem] w-[8.25rem] items-center justify-center rounded-[0.5rem] bg-[#e9f4ff] text-[0.875rem] font-semibold tracking-[-0.0175rem] text-accent transition hover:bg-[#d9edff]"
              }
            >
              {action.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
