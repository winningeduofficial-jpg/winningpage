import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { UNIVERSITY_OPTIONS } from '../../../data/goalOnboardingMock';

// 대학 검색 콤보박스 + 학과 셀렉트 — docs/figma-goal/00-INDEX.md §5-3 `UniversitySelect`.
// 상한(2단계)・하한(3단계) 두 스텝이 이 컴포넌트 하나를 `target` prop만 바꿔 공유한다
// (part-02 part-01 구현 노트: "상한/하한 두 스텝을 하나의 UniversitySelectStep 컴포넌트로").
//
// 데이터 소스 미확정(part-01 구현 노트) — 정적 목업 배열 + 클라이언트 substring 필터로만
// 구현한다. 실 서비스에서는 원격 검색 + 디바운스가 필요하다(part-02 #4 구현 노트).
export default function UniversitySelect({
  value,
  onChange,
  target, // 'upper' | 'lower' — 접근성 라벨 분기용, 시각 차이는 없음(part-02 §5)
  universityPlaceholder = '대학교를 선택해주세요',
  departmentPlaceholder = '과를 선택해주세요.'
}) {
  const [searchTerm, setSearchTerm] = useState(value.university || '');
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    setSearchTerm(value.university || '');
  }, [value.university]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
        setSearchTerm(value.university || '');
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [value.university]);

  const filteredUniversities = searchTerm
    ? UNIVERSITY_OPTIONS.filter((university) => university.name.includes(searchTerm))
    : UNIVERSITY_OPTIONS;

  const selectedUniversity = UNIVERSITY_OPTIONS.find((university) => university.name === value.university);
  const departmentOptions = selectedUniversity?.departments || [];

  function selectUniversity(name) {
    onChange({ university: name, department: '' });
    setSearchTerm(name);
    setIsOpen(false);
  }

  const universityFieldId = `university-select-${target}`;
  const departmentFieldId = `department-select-${target}`;

  return (
    <div className="flex flex-col gap-[0.75rem]">
      <div className="relative" ref={wrapperRef}>
        <label className="sr-only" htmlFor={universityFieldId}>
          {target === 'lower' ? '하한 목표 대학교' : '상한 목표 대학교'}
        </label>
        <input
          id={universityFieldId}
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-autocomplete="list"
          value={searchTerm}
          placeholder={universityPlaceholder}
          onFocus={() => setIsOpen(true)}
          onChange={(event) => {
            setSearchTerm(event.target.value);
            setIsOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setIsOpen(false);
          }}
          className="h-[4.25rem] w-full rounded-[0.75rem] border border-line bg-white px-[1.25rem] pr-12 text-[1rem] text-ink placeholder:text-ink-sub focus:border-accent focus:outline-none"
        />
        <span className="pointer-events-none absolute right-[1.25rem] top-1/2 -translate-y-1/2 text-ink-sub">
          {isOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </span>

        {isOpen && (
          // 드롭다운은 입력 필드 아래 오버레이로, 레이아웃을 밀어내지 않는다(part-02 #4 구현 노트).
          <ul
            role="listbox"
            className="absolute left-0 right-0 top-[calc(100%+0.25rem)] z-20 max-h-[17rem] overflow-y-auto rounded-[0.75rem] border border-line bg-white shadow-[0_0.75rem_2rem_rgba(15,23,42,0.12)]"
          >
            {filteredUniversities.length === 0 ? (
              <li className="px-[1.25rem] py-[1.0625rem] text-[0.875rem] text-ink-sub">검색 결과가 없습니다.</li>
            ) : (
              filteredUniversities.map((university) => (
                <li key={university.name}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={value.university === university.name}
                    onClick={() => selectUniversity(university.name)}
                    className={`flex h-[4.25rem] w-full items-center px-[1.25rem] text-left text-[1rem] transition-colors hover:bg-surface-03 ${
                      value.university === university.name ? 'bg-surface-03 text-accent' : 'text-ink'
                    }`}
                  >
                    {university.name}
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>

      <div className="relative">
        <label className="sr-only" htmlFor={departmentFieldId}>
          학과
        </label>
        <select
          id={departmentFieldId}
          value={value.department}
          disabled={!value.university}
          onChange={(event) => onChange({ department: event.target.value })}
          className="h-[4.25rem] w-full appearance-none rounded-[0.75rem] border border-line bg-white px-[1.25rem] pr-12 text-[1rem] text-ink focus:border-accent focus:outline-none disabled:bg-surface-01 disabled:text-ink-sub"
        >
          <option value="" disabled>
            {departmentPlaceholder}
          </option>
          {departmentOptions.map((department) => (
            <option key={department} value={department}>
              {department}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-[1.25rem] top-1/2 -translate-y-1/2 text-ink-sub">
          <ChevronDown size={20} />
        </span>
      </div>
    </div>
  );
}
