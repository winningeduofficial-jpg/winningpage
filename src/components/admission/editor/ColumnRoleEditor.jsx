import ImeSafeInput from './ImeSafeInput';
import { getKnownRolesForVariant } from '../admissionLayout';

const CUSTOM_ROLE_OPTION = '__custom__';

// 컬럼 role 편집기 — 자유 입력을 막는다. role은 getCellKind(variant, role)
// 판정에 직접 쓰여(예: selection의 'minimum' → badge 편집기) 잘못 바꾸면
// 편집 UI 종류가 조용히 바뀐다. variant별 알려진 role 목록(admissionLayout.js
// KNOWN_ROLES_BY_VARIANT, admissionParsing.js doc 생성기 소스에서 그대로
// 옮긴 값)을 드롭다운으로 제공하고, 목록에 없는 값(기존 데이터가 이미
// 알려지지 않은 role을 갖고 있는 경우 포함)에는 "직접 입력" 텍스트
// 필드 + 경고를 보여준다.
export default function ColumnRoleEditor({ variant, role, onChange }) {
  const options = getKnownRolesForVariant(variant);
  const isKnown = options.includes(role);
  const selectValue = isKnown ? role : CUSTOM_ROLE_OPTION;

  function handleSelectChange(event) {
    const next = event.target.value;
    onChange(next === CUSTOM_ROLE_OPTION ? '' : next);
  }

  return (
    <div className="flex flex-col gap-1">
      <select
        value={selectValue}
        onChange={handleSelectChange}
        aria-label="컬럼 role"
        className="border border-[#d7d7d7] px-1 py-1 text-[11px]"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
        <option value={CUSTOM_ROLE_OPTION}>직접 입력…</option>
      </select>
      {!isKnown && (
        <>
          <ImeSafeInput
            type="text"
            value={role ?? ''}
            onCommit={onChange}
            placeholder="role 직접 입력"
            aria-label="컬럼 role 직접 입력"
            className="admission-cell-editor-input w-full border border-amber-400 px-1.5 py-1 text-[11px]"
          />
          <p className="text-[10px] font-bold text-amber-600">
            이 role은 badge/chips 편집기와 연결되지 않습니다
            {options.length ? `(${variant} variant에서 알려진 role: ${options.join(', ')})` : ''}.
          </p>
        </>
      )}
    </div>
  );
}
