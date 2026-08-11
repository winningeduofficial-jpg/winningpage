import { useCallback, useState } from 'react';
import { Outlet } from 'react-router-dom';
// 리포트 '페이지'가 아니라 storage 모듈만 import 한다 — 페이지를 가져오면 인쇄 CSS 가 설문 번들로 끌려온다.
// 저장 키·직렬화·스키마 검증의 정의처도 그 모듈 하나다(여기에 리터럴을 두면 읽기 쪽과 갈라진다).
import { submitDiagnosisAnswers } from '../../lib/diagnosisInputStorage';
// Q-01(2026-08-11 확정) — 제출 시점에 로그인 학생 이름을 조회한다. 비로그인·조회 실패는 null.
import { fetchLoggedInStudentName } from '../../lib/diagnosisStudentName';
// B-1(2026-08-11 확정) — q15 캐스케이드 fetch 상태(옵션 5벌 + loading + error)를 이 셸이 소유한다.
import { useAdmissionCascade } from '../../hooks/useAdmissionCascade';

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

  // B-1 — q15(목표 대학 입결 조회) 캐스케이드 옵션·컷 fetch 상태. answers.q15 가 바뀔 때마다
  // 훅 내부에서 대학→학과→전형유형/세부전형명/반영교과 순으로 필요한 조회만 다시 tap 한다.
  const admissionCascade = useAdmissionCascade(answers.q15);

  /**
   * 제출 — answers 를 DiagnosisInput 으로 정규화해 저장하고 그 값을 돌려준다(§7.4.2).
   *
   * 감싸는 이유는 소유권이다. answers 를 들고 있는 것이 이 셸이고, 리포트로 이동하는 순간
   * 이 인스턴스가 언마운트되며 응답이 사라진다. 스텝 페이지와 preview 가 각자
   * `submitDiagnosisAnswers(answers)` 를 부르면 제출 진입점이 두 곳으로 갈라져,
   * 한쪽만 고치면 그 경로로 들어온 진단만 조용히 저장되지 않는다.
   *
   * async 인 이유는 Q-01 이다 — 이름은 폼에 없고 제출 시점에 세션에서 조회한다. 입결 컷(B-1)은
   * 스텝5 캐스케이드가 선택 시점에 이미 조회해 둔 값(admissionCascade.cuts)을 그대로 싣는다 —
   * 제출 시점에 다시 조회하지 않는다.
   */
  const submitDiagnosis = useCallback(async () => {
    const name = await fetchLoggedInStudentName();
    return submitDiagnosisAnswers(answers, {
      name,
      admissionCuts: admissionCascade.cuts,
      admissionMeta: admissionCascade.admissionMeta
    });
  }, [answers, admissionCascade.cuts, admissionCascade.admissionMeta]);

  return (
    <main className="min-h-screen w-full bg-[#FBFAFA] pt-16">
      {/* 상단 패딩 56px(3.5rem)은 이 section이 소유한다 — <main>은 pt-16으로 헤더만 비운다. */}
      <section className="w-full pt-14 pb-16 sm:pb-20 lg:pb-[7.5rem]">
        <div className="mx-auto w-full max-w-content px-5 sm:px-8">
          {/* 컬럼 스택 gap 60 — 타이틀 블록 / 카드 스택 / 하단 배너가 형제로 이 갭을 공유한다. */}
          <div className="mx-auto flex w-full max-w-content flex-col items-start gap-[3.75rem]">
            <div className="flex w-full max-w-[37.25rem] flex-col items-start gap-5 text-[#525252]">
              <h1 className="break-keep text-[1.75rem] font-bold leading-[1.4] tracking-[-0.02em] sm:text-[2.25rem] lg:text-[2.75rem]">
                학습진단으로
                <br />
                나에게 딱 맞는 서비스를 추천받아요
              </h1>
              <p className="break-keep text-lg font-normal leading-[1.3] sm:text-2xl">
                17개 문항을 답하면 가장 먼저 필요한 서비스를 추천해 드려요
              </p>
            </div>

            <Outlet
              context={{ answers, setAnswer, submitDiagnosis, cascadeLevels: admissionCascade.levels }}
            />
          </div>
        </div>
      </section>
    </main>
  );
}
