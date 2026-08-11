import { useState } from 'react';
import GoalPageHeader from '../../components/goal/GoalPageHeader';
import StudyTimeSection from '../../components/goal/study/StudyTimeSection';
import ConditionSection from '../../components/goal/study/ConditionSection';
import ChipSelectSection from '../../components/goal/study/ChipSelectSection';
import RetrospectSection from '../../components/goal/study/RetrospectSection';
import {
  mockStudySubjectTimes,
  mockConditionOptions,
  mockDisturbanceOptions,
  mockStudyItemOptions
} from '../../data/goalStudyMock';

// 오늘의 공부 기록(#26). 시안 실측 콘텐츠 폭은 1190px(74.375rem, part-09 §156)이지만 앱 공통 폭
// 통일 원칙(00-INDEX.md §5-2 `PageHeader`, tailwind.config.js `max-w-goal-content` 83.75rem)에
// 따라 83.75rem 컨테이너 안에서 레이아웃한다. 시안 실측 폭은 이 주석으로만 남긴다.
export default function DailyRecord() {
  const [condition, setCondition] = useState(null);
  const [disturbances, setDisturbances] = useState([]);
  const [studyItems, setStudyItems] = useState([]);
  const [retrospect, setRetrospect] = useState('');

  // `없었음`은 다른 방해 요인과 상호배타 처리(part-09 §247 "추정").
  const toggleDisturbance = (value) => {
    setDisturbances((prev) => {
      if (value === 'none') {
        return prev.includes('none') ? [] : ['none'];
      }
      const withoutNone = prev.filter((item) => item !== 'none');
      return withoutNone.includes(value) ? withoutNone.filter((item) => item !== value) : [...withoutNone, value];
    });
  };

  const toggleStudyItem = (value) => {
    setStudyItems((prev) => (prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]));
  };

  // 필수값 정의가 시안에 없다(작업 지시 §3 확정 사항 6 "필수값 미입력 시 disabled"만 명시).
  // 최소 기준으로 추정: 컨디션 1개(필수 선택) + 핵심 학습 항목 1개 이상.
  const canSave = condition !== null && studyItems.length > 0;

  const handleSave = () => {
    // 저장은 스텁 — API·Supabase 연동 금지(작업 지시 확정 사항 §1).
    console.log('오늘의 공부 기록 저장', { condition, disturbances, studyItems, retrospect });
  };

  const totalHours = mockStudySubjectTimes.reduce((sum, row) => sum + row.hours, 0);

  return (
    <>
      <GoalPageHeader
        title="오늘의 공부 기록"
        meta="2026.08.01 (토)"
        subcopy="하루를 마감하며 기록하면 달성률과 리포트에 반영됩니다."
      />
      <div className="max-w-goal-content flex flex-col gap-5 px-[3rem] pb-24">
        <StudyTimeSection rows={mockStudySubjectTimes} totalHours={totalHours} />

        {/* 섹션2·3 — 시안은 639×265 + 531×265 2열(part-09 §160~161, 639:531 ≈ 6:5) */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[6fr_5fr]">
          <ConditionSection options={mockConditionOptions} value={condition} onChange={setCondition} />
          <ChipSelectSection
            title="방해 요인"
            options={mockDisturbanceOptions}
            selectedValues={disturbances}
            onToggle={toggleDisturbance}
          />
        </div>

        <ChipSelectSection
          title="오늘 완료한 핵심 학습 항목"
          options={mockStudyItemOptions}
          selectedValues={studyItems}
          onToggle={toggleStudyItem}
        />

        <RetrospectSection value={retrospect} onChange={setRetrospect} />

        <div className="flex justify-center pt-4">
          <button
            type="button"
            disabled={!canSave}
            onClick={handleSave}
            className="flex h-[4.5625rem] w-full max-w-[27.1875rem] items-center justify-center rounded-2xl text-[1.0625rem] font-bold leading-[1.2] transition-colors disabled:cursor-not-allowed disabled:bg-surface-01 disabled:text-ink-sub enabled:bg-primary enabled:text-white"
          >
            기록 저장하기
          </button>
        </div>
      </div>
    </>
  );
}
