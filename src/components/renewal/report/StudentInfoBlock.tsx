// 학생 기본정보 블록 — 이름 행 + 정보 6행(학년/학교 유형/희망 진로/전체 평균 내신/성적 흐름/진단 완료일).
// 라벨 문자열은 구조이지 데이터가 아니므로 컴포넌트 내 상수로 둔다(propsContracts 허용).
const INFO_FIELDS = [
  { label: "학년", key: "grade" },
  { label: "학교 유형", key: "schoolType" },
  { label: "희망 진로", key: "desiredMajor" },
  { label: "전체 평균 내신", key: "gpa" },
  { label: "성적 흐름", key: "gradeTrend" },
  { label: "진단 완료일", key: "diagnosedAt" },
];

import type { ReactNode } from "react";

type Student = {
  nameLine?: string;
  name?: string;
  grade?: string;
  schoolType?: string;
  desiredMajor?: string;
  gpa?: string;
  gradeTrend?: string;
  diagnosedAt?: string;
  [key: string]: unknown;
};

type StudentInfoBlockProps = {
  student: Student;
};

export default function StudentInfoBlock({ student }: StudentInfoBlockProps) {
  return (
    // R3(2026-08-11) — 데스크톱 폭(24.375rem)은 값 칸을 12.5rem 고정으로 둬도 되는 여유였다.
    // 모바일은 w-full + 값 칸 flex-1(가변)로 바꿔 좁은 화면에서도 값이 넘치지 않고 자연스럽게
    // 줄바꿈되게 한다(라벨:값 비율은 유지, 폭 숫자만 반응형).
    // fd-student-info/-row/-label/-value — 인쇄 훅. report-print.css 가 기존 lg: 리터럴과
    // 동일한 값으로 강제한다(BLOCK 수정, ReportSheetA4 주석 참고).
    <div className="fd-student-info flex w-full flex-col gap-1.5 lg:w-97.5">
      {/* 이름 행은 buildReport 가 완성해 내린다(student.nameLine). 이름 수집 문항이 없어 상시 null 이라
          (Q-01) 컴포넌트가 `${student.name} 학생` 을 조립하면 '학생'만 덩그러니 남는다 —
          §5.2 의 name 결측 규칙대로 접두 자체를 렌더하지 않는다. h-6 고정이라 비어도 아래 6행은 안 밀린다.
          ?? 뒤는 nameLine 이 없는 디자인 픽스처(renewalReportSample) 폴백 경로 전용이다. */}
      <p className="h-6 text-[1.25rem] font-semibold leading-5 text-accent">
        {student.nameLine ?? (student.name ? `${student.name} 학생` : "")}
      </p>
      {/* 행 높이 고정(h-5) 금지 — q8 성적 흐름 옵션 6개 중 4개와 자유입력 희망 진로가 값 칸
          w-50 에서 2줄로 접힌다(실측). min-h-5 + items-start 로 행이 값 줄바꿈만큼
          자연스럽게 늘어나게 하고, 라벨은 위 라인에 정렬된 채로 남긴다. */}
      <div className="flex flex-col gap-1.5">
        {INFO_FIELDS.map(({ label, key }) => (
          <div
            key={key}
            className="fd-student-row flex min-h-5 items-start gap-4 lg:gap-10"
          >
            {/* 모바일 라벨색은 #6b6b6b(대비 5.3:1, WCAG AA 통과) — 데스크톱 #d7d7d7(대비 ~1.4:1)은
                기존 값 칸(w-[12.5rem])이 옆에 붙어 있어 이미 승인된 화면이라 손대지 않는다.
                폰트는 데스크톱과 동일 text-base(16px) 유지 — 본문 최소 크기 기준. */}
            <span className="fd-student-label w-20 shrink-0 text-base font-medium leading-5 text-ink-sub lg:w-22.75 lg:text-line">
              {label}
            </span>
            <span className="fd-student-value min-w-0 flex-1 text-base font-medium leading-5 text-ink lg:w-50 lg:flex-none">
              {student[key] as ReactNode}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
