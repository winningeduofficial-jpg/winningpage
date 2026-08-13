import { useEffect, useRef, useState } from 'react';
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
import { fetchTodayGoalRecord, submitDailyRecord } from '../../lib/goalApi';

// 코드값 → 라벨(goalStudyMock.js 옵션 그대로) / 라벨 → 코드값(GET 응답 프리필용, 서버는
// api/goal/daily-record.js 가 한글 라벨로 저장하므로 역매핑이 필요하다).
const TASK_CODE_BY_LABEL = Object.fromEntries(mockStudyItemOptions.map((o) => [o.label, o.value]));
const REASON_CODE_BY_LABEL = Object.fromEntries(mockDisturbanceOptions.map((o) => [o.label, o.value]));

// 오늘의 공부 기록(#26). 시안 실측 콘텐츠 폭은 1190px(74.375rem, part-09 §156)이지만 앱 공통 폭
// 통일 원칙(00-INDEX.md §5-2 `PageHeader`, tailwind.config.js `max-w-goal-content` 83.75rem)에
// 따라 83.75rem 컨테이너 안에서 레이아웃한다. 시안 실측 폭은 이 주석으로만 남긴다.
export default function DailyRecord() {
  const [condition, setCondition] = useState(null);
  const [disturbances, setDisturbances] = useState([]);
  const [studyItems, setStudyItems] = useState([]);
  const [retrospect, setRetrospect] = useState('');

  // GET /api/goal/daily-record 프리필 상태. studyHours는 이 페이지에서 입력받지 않는다 —
  // 대시보드 "오늘의 목표" 카드 또는 열공 타이머(#25, 타이머 영속화는 별도 작업)에서만
  // 채워진다(임무 지시 배경 절). hasExistingRecord는 오늘 행 존재 여부로 버튼 문구를 바꾼다.
  const [studyHours, setStudyHours] = useState(0);
  const [hasExistingRecord, setHasExistingRecord] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState(null);
  const [highlightStudyTime, setHighlightStudyTime] = useState(false);
  const studyTimeRef = useRef(null);

  useEffect(() => {
    let alive = true;
    fetchTodayGoalRecord().then((result) => {
      if (!alive) return;

      if (result.kind !== 'success') {
        // 방어적 분기 — RequireGoalAccess가 이미 온보딩·이용권을 걸러 정상 경로에선
        // 여기 도달하지 않는다(Dashboard.jsx의 동일 패턴 참고). 페이지는 빈 상태로 둔다.
        if (result.kind !== 'no-session') {
          console.error('[DailyRecord] 오늘 기록 조회 실패:', result.kind);
        }
        return;
      }

      const { record } = result;
      if (!record) return;

      setStudyHours(record.studyHours || 0);
      setHasExistingRecord(true);
      setCondition(record.bodyCondition || null);
      setStudyItems((record.tasks || []).map((label) => TASK_CODE_BY_LABEL[label]).filter(Boolean));
      setDisturbances((record.reasons || []).map((label) => REASON_CODE_BY_LABEL[label]).filter(Boolean));
      setRetrospect(record.memo || '');
    });
    return () => {
      alive = false;
    };
  }, []);

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
  // 최소 기준으로 추정: 컨디션 1개(필수 선택) + 핵심 학습 항목 1개 이상. 순공 시간 0은
  // disabled가 아니라 클릭 시 안내(아래 handleSave)로 처리한다 — 서버 400 no_study_time과
  // 짝을 이루는 클라이언트 선제 안내다.
  const canSave = condition !== null && studyItems.length > 0;

  const scrollToStudyTime = () => {
    studyTimeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightStudyTime(true);
    setTimeout(() => setHighlightStudyTime(false), 2000);
  };

  const handleSave = async () => {
    if (!canSave || submitting) return;

    if (studyHours <= 0) {
      setBanner({
        tone: 'info',
        message: '순공 시간이 아직 없어요. 대시보드 오늘의 목표 카드 또는 타이머에서 시간을 기록하세요.'
      });
      scrollToStudyTime();
      return;
    }

    setSubmitting(true);
    setBanner(null);

    const result = await submitDailyRecord({
      bodyCondition: condition,
      reasons: disturbances,
      tasks: studyItems,
      memo: retrospect
    });

    setSubmitting(false);

    switch (result.kind) {
      case 'success': {
        setHasExistingRecord(true);
        if (result.record) setStudyHours(result.record.studyHours || 0);
        // delta는 이상/최소 수시만 대표로 보여준다(간단 요약) — 정시는 컷 미확보 학생이면
        // 항상 0으로 나와 "정시 확률이 0만큼 늘었다"는 오해를 줄 수 있다(jungsiAvailable
        // 플래그가 이 응답엔 없다 — buildStudentPayload 전용, 이 라우트 범위 밖).
        const delta = result.delta || { idealSusi: 0, minSusi: 0 };
        setBanner({
          tone: 'success',
          message: `기록을 저장했어요. 이상 목표 +${delta.idealSusi.toFixed(2)}%p · 최소 목표 +${delta.minSusi.toFixed(2)}%p`
        });
        break;
      }
      case 'no-study-time':
        setBanner({
          tone: 'info',
          message: '순공 시간이 아직 없어요. 대시보드 오늘의 목표 카드 또는 타이머에서 시간을 기록하세요.'
        });
        scrollToStudyTime();
        break;
      case 'no-session':
        setBanner({ tone: 'error', message: '로그인이 필요합니다.' });
        break;
      case 'not-allowed':
        setBanner({ tone: 'error', message: '이용권이 필요한 서비스입니다.' });
        break;
      case 'not-active':
        setBanner({ tone: 'error', message: '목표관리 온보딩을 먼저 완료해 주세요.' });
        break;
      default:
        setBanner({ tone: 'error', message: '기록 저장에 실패했어요. 잠시 후 다시 시도해 주세요.' });
    }
  };

  return (
    <>
      <GoalPageHeader
        title="오늘의 공부 기록"
        meta="2026.08.01 (토)"
        subcopy="하루를 마감하며 기록하면 달성률과 리포트에 반영됩니다."
      />
      <div className="max-w-goal-content flex flex-col gap-5 px-[3rem] pb-24">
        <div
          ref={studyTimeRef}
          className={`rounded-2xl transition-shadow ${highlightStudyTime ? 'ring-2 ring-red-400' : ''}`}
        >
          {/* 과목별 순공 시간 배분은 아직 실데이터가 없다(타이머 영속화·과목별 목표는
              별도 작업, D-8 PR1) — rows는 계속 mockStudySubjectTimes를 쓴다. totalHours만
              GET /api/goal/daily-record 로 프리필된 실제 오늘 순공 시간으로 교체한다. */}
          <StudyTimeSection rows={mockStudySubjectTimes} totalHours={studyHours} />
        </div>

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
            disabled={!canSave || submitting}
            onClick={handleSave}
            className="flex h-[4.5625rem] w-full max-w-[27.1875rem] items-center justify-center rounded-2xl text-[1.0625rem] font-bold leading-[1.2] transition-colors disabled:cursor-not-allowed disabled:bg-surface-01 disabled:text-ink-sub enabled:bg-primary enabled:text-white"
          >
            {submitting ? '저장 중…' : hasExistingRecord ? '기록 수정' : '기록 저장하기'}
          </button>
        </div>
      </div>

      {/* 저장 결과 안내 — Onboarding.jsx의 fixed bottom 배너 패턴(submitError)을 그대로
          준용한다. success(초록)는 이 페이지 신규 톤이고, info/error는 기존 톤 그대로다. */}
      {banner && (
        <div
          role="alert"
          className={`fixed inset-x-0 bottom-[2rem] z-[55] mx-auto w-[calc(100%-2.5rem)] max-w-[28rem] rounded-[0.75rem] border px-[1.25rem] py-[1rem] text-center text-[0.875rem] font-semibold shadow-[0_18px_45px_rgba(13,27,42,0.15)] ${
            banner.tone === 'success'
              ? 'border-green-200 bg-green-50 text-green-700'
              : banner.tone === 'error'
                ? 'border-red-200 bg-red-50 text-red-600'
                : 'border-blue-200 bg-blue-50 text-blue-700'
          }`}
        >
          {banner.message}
        </div>
      )}
    </>
  );
}
