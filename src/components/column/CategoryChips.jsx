import { ALL_CATEGORY, COLUMN_CATEGORIES } from '../../pages/column/columnData';

const OPTIONS = [ALL_CATEGORY, ...COLUMN_CATEGORIES];

export default function CategoryChips({ active, onChange, align = 'left' }) {
  return (
    <div
      className={`flex flex-wrap gap-3 ${
        align === 'center' ? 'justify-center' : 'justify-start'
      }`}
    >
      {OPTIONS.map((option) => {
        const isActive = option === active;

        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange?.(option)}
            className={`shrink-0 rounded-full px-6 py-3 text-xl font-medium leading-[1.4] transition-colors ${
              isActive ? 'bg-[#013262] text-white' : 'bg-[#F9FAFB] text-[#525252]'
            }`}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}
