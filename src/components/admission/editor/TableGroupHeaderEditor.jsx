import ImeSafeInput from "./ImeSafeInput";

// TableBlock.groups/fixedColumnCount(2단 헤더, recruitExact 전용 실사용)
// 편집 UI. 열 자체(columns 배열)는 여기서 바꾸지 않는다 — 열 추가·삭제는
// TableBlockEditor의 컬럼 수 고정 프로브가 groups 연동 사유로 이미
// 막는다. 여기서는 groups[].name/count와 fixedColumnCount만 조정한다.
// sum(groups.count)+fixedColumnCount===columns.length 위반 여부는
// TableBlockEditor 상단의 validateBlocks 결과 배너가 실시간으로 보여준다
// (에러 문자열 자체에 "현재 합계 vs columns.length"가 담겨 있다).
//
// 2단 헤더 구성은 3차(구조 변경, 드묾) — expanded(TableBlockEditor의
// "열 설정" 토글과 공유)가 false면 편집 가능한 필드는 숨기고 한 줄
// 요약(또는 미구성 안내)만 보여준다. 기능은 그대로다 — 접근 경로만
// 열 설정 토글 뒤로 옮긴 것.
export default function TableGroupHeaderEditor({
  groups,
  fixedColumnCount,
  columnsLength,
  expanded,
  onUpdateGroupField,
  onAddGroup,
  onRemoveGroup,
  onUpdateFixedColumnCount,
  onEnableGroups,
}) {
  if (!groups) {
    if (!expanded) return null;
    return (
      <div className="mb-2 rounded border border-dashed border-[#d7d7d7] p-2">
        <button
          type="button"
          onClick={onEnableGroups}
          className="text-[11px] font-bold text-gray-500 hover:text-gray-700"
        >
          + 2단 헤더(그룹) 구성 추가
        </button>
      </div>
    );
  }

  const groupSum = groups.reduce((sum, g) => sum + (Number(g.count) || 0), 0);
  const total = groupSum + (Number(fixedColumnCount) || 0);

  if (!expanded) {
    return (
      <p className="mb-2 text-[11px] font-bold text-gray-400">
        2단 헤더 — 그룹 {groups.length}개 · 고정 컬럼 {fixedColumnCount ?? 0}개
        · 합계 {total}/{columnsLength}
        {total !== columnsLength ? " (불일치 — 열 설정에서 확인)" : " (일치)"}
      </p>
    );
  }

  return (
    <div className="mb-2 rounded border border-[#d7d7d7] p-2">
      <p className="mb-1 text-[11px] font-bold text-gray-500">
        2단 헤더(그룹) — 합계 {total} / 컬럼 수 {columnsLength}
        {total !== columnsLength ? " (아래 배너의 검증 오류 참고)" : " (일치)"}
      </p>

      <label className="mb-2 flex items-center gap-2 text-[11px] font-bold text-gray-600">
        고정 컬럼 수(fixedColumnCount)
        <input
          type="number"
          min={0}
          value={fixedColumnCount ?? 0}
          onChange={(e) =>
            onUpdateFixedColumnCount(Number(e.target.value) || 0)
          }
          className="w-16 border border-[#d7d7d7] px-1 py-1 text-[11px]"
        />
      </label>

      <div className="flex flex-col gap-1">
        {groups.map((group, idx) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: groups는 삭제가 가능하지만 doc 스키마에 group id가 없다. 스키마 확장 없이는 못 고치는 기존 제약 — 새 이슈로 별도 추적한다.
          <div key={idx} className="flex items-center gap-1">
            <ImeSafeInput
              type="text"
              value={group.name ?? ""}
              onCommit={(next) => onUpdateGroupField(idx, "name", next)}
              aria-label={`그룹 ${idx + 1} 이름`}
              className="admission-cell-editor-input w-32 border border-[#d7d7d7] px-1.5 py-1 text-[11px]"
            />
            <input
              type="number"
              min={0}
              value={group.count ?? 0}
              onChange={(e) =>
                onUpdateGroupField(idx, "count", Number(e.target.value) || 0)
              }
              aria-label={`그룹 ${idx + 1} 컬럼 수`}
              className="w-14 border border-[#d7d7d7] px-1 py-1 text-[11px]"
            />
            <button
              type="button"
              onClick={() => onRemoveGroup(idx)}
              aria-label={`그룹 ${idx + 1} 삭제`}
              className="text-[11px] font-bold text-red-500"
            >
              삭제
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={onAddGroup}
        className="mt-1 text-[11px] font-bold text-gray-500 hover:text-gray-700"
      >
        + 그룹 추가
      </button>
    </div>
  );
}
