// 학생 기본정보 블록 — 이름 행 + 정보 6행(학년/학교 유형/희망 진로/전체 평균 내신/성적 흐름/진단 완료일).
// 라벨 문자열은 구조이지 데이터가 아니므로 컴포넌트 내 상수로 둔다(propsContracts 허용).
const INFO_FIELDS = [
  { label: '학년', key: 'grade' },
  { label: '학교 유형', key: 'schoolType' },
  { label: '희망 진로', key: 'desiredMajor' },
  { label: '전체 평균 내신', key: 'gpa' },
  { label: '성적 흐름', key: 'gradeTrend' },
  { label: '진단 완료일', key: 'diagnosedAt' },
];

export default function StudentInfoBlock({ student }) {
  return (
    <div className="flex h-[11.25rem] w-[24.375rem] flex-col justify-between">
      {/* 이름 행은 buildReport 가 완성해 내린다(student.nameLine). 이름 수집 문항이 없어 상시 null 이라
          (Q-01) 컴포넌트가 `${student.name} 학생` 을 조립하면 '학생'만 덩그러니 남는다 —
          §5.2 의 name 결측 규칙대로 접두 자체를 렌더하지 않는다. h-6 고정이라 비어도 아래 6행은 안 밀린다.
          ?? 뒤는 nameLine 이 없는 디자인 픽스처(renewalReportSample) 폴백 경로 전용이다. */}
      <p className="h-6 text-[1.25rem] font-semibold leading-[1.25rem] text-[#0b84fd]">
        {student.nameLine ?? (student.name ? `${student.name} 학생` : '')}
      </p>
      <div className="flex flex-col gap-[0.375rem]">
        {INFO_FIELDS.map(({ label, key }) => (
          <div key={key} className="flex h-5 items-center gap-[2.5rem]">
            <span className="w-[5.6875rem] text-base font-medium leading-[1.25rem] text-[#d7d7d7]">
              {label}
            </span>
            <span className="w-[12.5rem] text-base font-medium leading-[1.25rem] text-[#525252]">
              {student[key]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
