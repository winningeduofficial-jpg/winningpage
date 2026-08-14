import ComboField from "./ComboField";
import {
  DEPARTMENT_LABEL,
  DEPARTMENT_LOCKED_MESSAGE,
  DEPARTMENT_PLACEHOLDER,
  SUBMIT_LABEL,
  UNIVERSITY_LABEL,
  UNIVERSITY_PLACEHOLDER,
} from "./constants";

/**
 * [대학교][모집단위][조회] 3분할 바 (Figma 2029:854).
 *
 * 두 필드는 입력형 combobox다(ComboField) — 대학 202개 / 모집단위 최대 153개라
 * 목록 스크롤만으로는 못 찾는다. 빈 상태 카피를 "데이터 없음"과 "검색 결과 없음"
 * 2종으로 나눠 넘기는 것도 여기다(명세 §8.1) — 원인이 달라 안내 문구가 같으면 안 된다.
 *
 * 반응형 (tailwind.config.js의 wide=74rem 사용 — lg(1024px)에서 컨테이너 내부가 960px로
 * 줄어드는 함정을 피한다):
 *   < sm      : 1열 세로 스택
 *   sm ~ wide : 2열(대학/모집단위) + 조회 버튼이 3행 전체 폭
 *   >= wide   : 시안대로 1행 3분할 (필드 flex-1, 조회 7.75rem)
 * 컨테이너에 overflow-hidden을 걸지 않는다 — 팝오버가 바 밖으로 나와야 한다.
 */
export default function SelectorBar({
  university,
  department,
  universityOptions,
  departmentOptions,
  universityLoading,
  universityError,
  departmentLoading,
  departmentError,
  onRetryUniversities,
  onRetryDepartments,
  openField,
  onOpenFieldChange,
  onSelectUniversity,
  onSelectDepartment,
  onClearUniversity,
  onClearDepartment,
  onSubmit,
}) {
  const universityUnavailable =
    !universityLoading && !universityError && universityOptions.length === 0;
  const departmentLocked = !university;
  const canSubmit = Boolean(university && department);

  return (
    <div className="grid grid-cols-1 rounded-[1.25rem] border border-[#d7d7d7] bg-white sm:grid-cols-2 wide:grid-cols-[1fr_1fr_7.75rem]">
      <ComboField
        className="border-b border-[#d7d7d7] sm:border-b-0 sm:border-r"
        label={UNIVERSITY_LABEL}
        placeholder={UNIVERSITY_PLACEHOLDER}
        value={university}
        options={universityOptions}
        onSelect={onSelectUniversity}
        onClear={onClearUniversity}
        open={openField === "university"}
        onOpenChange={(next) => onOpenFieldChange(next ? "university" : null)}
        disabled={universityUnavailable}
        disabledMessage={
          universityUnavailable ? "아직 공개된 데이터가 없습니다" : ""
        }
        loading={universityLoading}
        error={universityError}
        onRetry={onRetryUniversities}
        emptyTitle="아직 공개된 입결 데이터가 없습니다."
        emptyDescription="대학별 최종등록자 교과등급을 준비하고 있습니다."
        noResultTitle="일치하는 대학이 없습니다."
        noResultDescription="띄어쓰기는 무시하고 찾습니다. 학교 이름 일부만 입력해 보세요."
      />

      <ComboField
        className="border-b border-[#d7d7d7] wide:border-b-0 wide:border-r"
        label={DEPARTMENT_LABEL}
        placeholder={DEPARTMENT_PLACEHOLDER}
        value={department}
        options={departmentOptions}
        onSelect={onSelectDepartment}
        onClear={onClearDepartment}
        open={openField === "department"}
        onOpenChange={(next) => onOpenFieldChange(next ? "department" : null)}
        disabled={departmentLocked || universityUnavailable}
        disabledMessage={
          departmentLocked || universityUnavailable
            ? DEPARTMENT_LOCKED_MESSAGE
            : ""
        }
        loading={departmentLoading}
        error={departmentError}
        onRetry={onRetryDepartments}
        emptyTitle="이 대학의 모집단위 정보가 아직 없습니다."
        emptyDescription="다른 대학을 선택해 주세요."
        noResultTitle="일치하는 모집단위가 없습니다."
        noResultDescription="띄어쓰기와 중점(·)은 무시하고 찾습니다. 학과 이름 일부만 입력해 보세요."
      />

      <button
        type="button"
        onClick={onSubmit}
        disabled={!canSubmit}
        className={`flex h-14 items-center justify-center rounded-b-[1.25rem] text-base font-semibold tracking-[-0.02em] transition-colors duration-200 [transition-timing-function:var(--ease-out-quart)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white sm:col-span-2 wide:col-span-1 wide:h-auto wide:rounded-b-none wide:rounded-r-[1.25rem] ${
          canSubmit
            ? "cursor-pointer bg-[#013262] text-white hover:bg-[#012649]"
            : // 비활성은 시안의 네이비 대신 회색. 흰 글자를 #d7d7d7 위에 얹으면 대비 1.6:1로
              // 글자가 사실상 사라지므로 배경을 더 밝게, 글자를 더 어둡게 잡는다.
              "cursor-not-allowed bg-[#f0f1f3] text-[#a3a8ae]"
        }`}
      >
        {SUBMIT_LABEL}
      </button>
    </div>
  );
}
