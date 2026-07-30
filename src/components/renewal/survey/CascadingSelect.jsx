import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

const LEVEL_META = [
  { key: 'university', label: '대학 선택', placeholder: '대학을 선택해 주세요' },
  { key: 'department', label: '학과 또는 모집단위', placeholder: '학과를 선택해 주세요' },
  { key: 'admissionType', label: '전형 유형', placeholder: '전형 유형을 선택해 주세요' },
  { key: 'detailType', label: '세부 전형명', placeholder: '세부 전형을 선택해 주세요' }
];

// ⚠️ 더미 데이터 — 1차(디자인 구현) 전용 임시물이다. SPEC-fd-ver3-v2 §8-B11=(a).
// 대학/학과/전형/입결 마스터 데이터는 repo·DB 어디에도 없고 2차에서 확보·이관한다(§10-10).
// 목적은 "드롭다운이 열리고 · chevron 이 회전하고 · 단계별로 활성화되는" 상태를 눈으로 검수하는 것뿐이며,
// 실제 입시 정보로서의 정확성은 보장하지 않는다. 2차 전환 시 이 상수를 지우고 `levels[].options`
// (이미 열려 있는 prop)로 실데이터를 주입하면 컴포넌트 자체는 무변경이다.
// 학과/전형유형은 대학 선택에 종속되고, 세부 전형명은 대학+전형유형에 종속된다.
const UNIVERSITY_DATA = {
  건국대학교: {
    departments: ['경영학과', '컴퓨터공학과', '건축학과', '수의예과'],
    admissionTypes: {
      학생부종합: ['KU자기추천전형', 'KU학교추천전형'],
      학생부교과: ['교과우수전형', '고른기회전형'],
      논술전형: ['논술우수자전형'],
      '정시(수능)': ['수능일반전형']
    }
  },
  경희대학교: {
    departments: ['경영학과', '컴퓨터공학과', '한의예과', '호텔경영학과'],
    admissionTypes: {
      학생부종합: ['네오르네상스전형', '고교연계전형'],
      학생부교과: ['지역균형전형'],
      논술전형: ['논술우수자전형'],
      '정시(수능)': ['수능위주전형']
    }
  },
  고려대학교: {
    departments: ['경영학과', '컴퓨터학과', '심리학과', '정치외교학과'],
    admissionTypes: {
      학생부종합: ['학업우수형', '계열적합형'],
      학생부교과: ['학교추천전형'],
      논술전형: ['논술전형'],
      '정시(수능)': ['일반전형']
    }
  },
  성균관대학교: {
    departments: ['경영학과', '소프트웨어학과', '글로벌경제학과', '의예과'],
    admissionTypes: {
      학생부종합: ['계열모집전형', '학과모집전형'],
      학생부교과: ['학교장추천전형'],
      논술전형: ['논술우수전형'],
      '정시(수능)': ['수능전형']
    }
  },
  연세대학교: {
    departments: ['경영학과', '컴퓨터과학과', '언더우드학부', '신소재공학부'],
    admissionTypes: {
      학생부종합: ['활동우수형', '국제형'],
      학생부교과: ['추천형'],
      논술전형: ['논술전형'],
      '정시(수능)': ['일반전형']
    }
  },
  중앙대학교: {
    departments: ['경영학과', '소프트웨어학부', '심리학과', '영어영문학과'],
    admissionTypes: {
      학생부종합: ['CAU탐구형', 'CAU융합형'],
      학생부교과: ['지역균형전형'],
      논술전형: ['논술전형'],
      '정시(수능)': ['일반전형']
    }
  }
};

function resolveMeta(levels) {
  return LEVEL_META.map((meta, index) => {
    const override = levels?.[index];
    return {
      key: override?.key || meta.key,
      label: override?.label || meta.label,
      placeholder: meta.placeholder
    };
  });
}

function getOptionsForLevel(index, levels, currentValue) {
  const university = currentValue.university;
  const admissionType = currentValue.admissionType;

  if (index === 0) {
    const custom = levels?.[0]?.options;
    return custom && custom.length ? custom : Object.keys(UNIVERSITY_DATA);
  }

  if (index === 1) {
    return university && UNIVERSITY_DATA[university] ? UNIVERSITY_DATA[university].departments : [];
  }

  if (index === 2) {
    return university && UNIVERSITY_DATA[university]
      ? Object.keys(UNIVERSITY_DATA[university].admissionTypes)
      : [];
  }

  if (index === 3) {
    return university && admissionType && UNIVERSITY_DATA[university]?.admissionTypes[admissionType]
      ? UNIVERSITY_DATA[university].admissionTypes[admissionType]
      : [];
  }

  return [];
}

export default function CascadingSelect({ levels, value, onChange }) {
  const currentValue = value || {};
  const meta = resolveMeta(levels);
  const [openIndex, setOpenIndex] = useState(null);
  const containerRef = useRef(null);

  useEffect(() => {
    if (openIndex === null) return undefined;

    function handlePointerDown(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpenIndex(null);
      }
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') setOpenIndex(null);
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openIndex]);

  function handleSelect(index, option) {
    const next = { ...currentValue, [meta[index].key]: option };
    for (let i = index + 1; i < meta.length; i += 1) {
      next[meta[i].key] = '';
    }
    onChange?.(next);
    setOpenIndex(null);
  }

  return (
    <div
      ref={containerRef}
      className="grid w-full max-w-[62rem] grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-[repeat(4,14.25rem)] lg:gap-5"
    >
      {meta.map((level, index) => {
        const selected = currentValue[level.key] || '';
        const options = getOptionsForLevel(index, levels, currentValue);
        const enabled = index === 0 || Boolean(currentValue[meta[index - 1].key]);
        const isOpen = openIndex === index;

        return (
          <div key={level.key} className="relative flex min-w-0 flex-col gap-2">
            <p
              className={`text-base font-medium leading-5 ${
                enabled ? 'text-[#525252]' : 'text-[#D7D7D7]'
              }`}
            >
              {level.label}
            </p>

            <button
              type="button"
              disabled={!enabled}
              aria-haspopup="listbox"
              aria-expanded={isOpen}
              onClick={() => enabled && setOpenIndex(isOpen ? null : index)}
              className={`flex h-[4.25rem] w-full items-center justify-between gap-6 rounded-[1.25rem] border px-5 text-left text-xl font-normal leading-5 transition-[background-color,border-color,color] duration-150 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent/30 ${
                !enabled
                  ? 'cursor-not-allowed border-[#D7D7D7] bg-[#F5F5F5] text-[#D7D7D7]'
                  : isOpen
                    ? 'border-[#013262] bg-white text-[#181D24]'
                    : selected
                      ? 'border-[#013262] bg-white text-[#181D24] hover:border-[#B0B0B0]'
                      : 'border-[#D7D7D7] bg-white text-[#D7D7D7] hover:border-[#B0B0B0]'
              }`}
            >
              <span className="truncate">
                {selected || (enabled ? level.placeholder : '이전 항목을 먼저 선택해 주세요')}
              </span>
              {/* chevron: lucide-react ChevronDown 24 유지 (§7 C-7 — 별도 SVG 추출 안 함) */}
              <ChevronDown
                size={24}
                className={`shrink-0 transition-transform duration-150 ${isOpen ? 'rotate-180 text-[#013262]' : ''} ${
                  !enabled ? 'text-[#D7D7D7]' : selected ? 'text-[#013262]' : 'text-[#D7D7D7]'
                }`}
              />
            </button>

            {isOpen && (
              <div
                role="listbox"
                aria-label={level.label}
                className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-30 max-h-72 overflow-y-auto rounded-2xl border border-[#EDEDED] bg-white p-2 shadow-[0_1rem_2.5rem_rgba(15,23,42,0.12)]"
              >
                {options.length === 0 ? (
                  <p className="px-4 py-3 text-base text-[#808080]">선택 가능한 옵션이 없습니다.</p>
                ) : (
                  options.map((option) => {
                    const isSelected = option === selected;
                    return (
                      <button
                        key={option}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => handleSelect(index, option)}
                        className={`flex min-h-[2.75rem] w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left text-base transition hover:bg-[#F1F8FF] ${
                          isSelected ? 'bg-[#F1F8FF] font-medium text-[#013262]' : 'text-[#525252]'
                        }`}
                      >
                        <span className="truncate">{option}</span>
                        {isSelected && <Check size={18} className="shrink-0 text-[#013262]" />}
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
