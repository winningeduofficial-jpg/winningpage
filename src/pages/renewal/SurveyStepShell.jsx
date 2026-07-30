import { useCallback, useState } from 'react';
import { Outlet } from 'react-router-dom';

/**
 * 설문 5스텝 공통 셸. `/free-diagnosis/survey` 부모 라우트의 element 이므로
 * 자식 라우트(`/1`~`/5`, `/preview`)만 바뀔 때 인스턴스가 유지된다 —
 * answers 가 스텝 간 이동에서 보존되는 근거다(새로고침 시 소실은 1차 사양).
 *
 * <Outlet> 은 gap-[3.75rem] 컬럼의 직속 자식이어야 한다.
 * 자식이 반환하는 형제(카드 스택 + 하단 배너)가 이 갭을 그대로 받는다.
 */
export default function SurveyStepShell() {
  const [answers, setAnswers] = useState({});

  const setAnswer = useCallback((questionId, nextValue) => {
    setAnswers((prev) => ({ ...prev, [questionId]: nextValue }));
  }, []);

  return (
    <main className="min-h-screen w-full bg-[#FBFAFA] pt-16">
      {/* 상단 패딩 56px(3.5rem)은 이 section이 소유한다 — <main>은 pt-16으로 헤더만 비운다. */}
      <section className="w-full pt-14 pb-16 sm:pb-20 lg:pb-[7.5rem]">
        <div className="mx-auto w-full max-w-content px-5 sm:px-8">
          {/* 컬럼 스택 gap 60 — 타이틀 블록 / 카드 스택 / 하단 배너가 형제로 이 갭을 공유한다. */}
          <div className="mx-auto flex w-full max-w-content flex-col items-start gap-[3.75rem]">
            <div className="flex w-full max-w-[37.25rem] flex-col items-start gap-5 text-[#525252]">
              <h1 className="break-keep text-[1.75rem] font-bold leading-[1.4] tracking-[-0.02em] sm:text-[2.25rem] lg:text-[2.75rem]">
                무료 진단으로
                <br />
                나에게 딱 맞는 서비스를 추천받아요
              </h1>
              <p className="break-keep text-lg font-normal leading-[1.3] sm:text-2xl">
                19개 문항을 답하면 가장 먼저 필요한 서비스를 추천해 드려요
              </p>
            </div>

            <Outlet context={{ answers, setAnswer }} />
          </div>
        </div>
      </section>
    </main>
  );
}
