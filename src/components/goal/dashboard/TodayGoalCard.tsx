import type { ChangeEvent } from "react";
import { useEffect, useState } from "react";
import GoalCard from "@/components/goal/GoalCard";
import GoalProgressBar from "@/components/goal/GoalProgressBar";
import { submitDailyRecord } from "@/lib/goalApi";

// 대시보드 "오늘의 목표" 카드 — part-07 #20(카드 배경 정본, 1076×409 = 67.25rem×25.5625rem).
// #21의 "카드 배경 1076×12 축소"는 시안 편집 사고로 판단해 채택하지 않는다(작업 지시 §확정사항 6).
//
// hasRecord는 studyHours로 파생한다: 0이면 #12(미기록, 버튼 "기록 저장"), 그 외면 #20(기록됨,
// 버튼 "기록 수정"). 게이지 채움 폭은 GoalProgressBar가 value/max로 계산한다(px 하드코딩 금지).
// hasRecord는 서버가 확인해 준 data.studyHours(부모 Dashboard가 GET /api/goal/daily-record로
// 채운 값) 기준이다 — 아직 저장하지 않은 입력창 값(pendingHours)으로 미리 전환하지 않는다.
type GoalRateRowProps = {
  label: string;
  value: number;
  dotClassName: string;
  fillClassName: string;
};

function GoalRateRow({
  label,
  value,
  dotClassName,
  fillClassName,
}: GoalRateRowProps) {
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className={`h-2 w-2 shrink-0 rounded-full ${dotClassName}`}
      />
      <span className="w-[9.5rem] shrink-0 text-[0.875rem] leading-[1.4] text-ink">
        {label}
      </span>
      <GoalProgressBar
        value={value}
        max={100}
        thickness="0.75rem"
        fillClassName={fillClassName}
        className="flex-1"
      />
      <span className="w-[3rem] shrink-0 text-right text-[0.9375rem] font-bold leading-[1.4] text-ink-strong">
        {value}%
      </span>
    </div>
  );
}

function quickAddLabel(hours: number) {
  return hours < 1 ? `+ ${hours * 60}분` : `+ ${hours}시간`;
}

function clampHours(hours: number) {
  return Math.min(24, Math.max(0, Math.round(hours * 10) / 10));
}

// 부모 Dashboard가 채운 표시용 데이터 — Dashboard.jsx의 mapTodayGoal() 결과.
type TodayGoalData = {
  studyHours: number;
  quickAddOptions: number[];
  upperGoalRate: number;
  lowerGoalRate: number;
};

type TodayGoalCardProps = {
  data: TodayGoalData;
  /** 저장 성공 시 호출. Dashboard의 기존 데이터 훅을 다시 실행해 게이지(upperGoalRate/
   *  lowerGoalRate)·확률을 최신화하는 역할은 이 카드가 아니라 상위 리로드 콜백이 진다
   *  (단일 진실 공급원을 Dashboard 쪽에 유지). */
  onSaved?: () => void;
};

export default function TodayGoalCard({ data, onSaved }: TodayGoalCardProps) {
  const hasRecord = data.studyHours > 0;

  // 아직 저장하지 않은 입력값. 서버 확정값(data.studyHours)이 바뀌면(최초 로드·저장 성공 후
  // 리로드) 그 값으로 다시 맞춘다 — 사용자가 입력 중인데 리로드가 덮어쓰는 경우는 저장 자체가
  // 그 값으로 완료된 직후뿐이라 충돌하지 않는다.
  const [pendingHours, setPendingHours] = useState(data.studyHours);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setPendingHours(data.studyHours);
  }, [data.studyHours]);

  const handleHoursChange = (event: ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value;
    if (raw === "") {
      setPendingHours(0);
      return;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    setPendingHours(clampHours(parsed));
  };

  const handleQuickAdd = (hours) => {
    setPendingHours((prev) => clampHours(prev + hours));
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError("");

    const result = await submitDailyRecord({ studyHours: pendingHours });

    setSubmitting(false);

    if (result.kind === "success") {
      onSaved?.();
      return;
    }

    const messages = {
      "no-study-time": "순공 시간은 0보다 커야 해요.",
      "no-session": "로그인이 필요합니다.",
      "not-allowed": "이용권이 필요한 서비스입니다.",
      "not-active": "목표관리 온보딩을 먼저 완료해 주세요.",
    };
    setError(
      messages[result.kind] || "저장에 실패했어요. 잠시 후 다시 시도해 주세요.",
    );
  };

  return (
    <GoalCard
      tone="neutral"
      className="flex h-[25.5625rem] flex-col gap-6 px-[2rem] py-[1.875rem]"
    >
      <div>
        <h2 className="text-[1.25rem] font-bold leading-[1.4] text-ink-strong">
          오늘의 목표
        </h2>
        <p className="mt-1 text-[0.875rem] leading-[1.4] text-ink-sub">
          기록하면 즉시 달성률에 반영돼요
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4 rounded-xl bg-surface-04 px-[1.875rem] py-[1.5rem]">
        <span className="shrink-0 text-[0.9375rem] font-semibold leading-[1.4] text-ink-strong">
          오늘 순공 시간
        </span>
        <div className="flex h-[3.125rem] w-[12rem] shrink-0 items-center justify-end gap-1 rounded-lg border border-line bg-white px-4">
          <input
            type="number"
            inputMode="decimal"
            step="0.1"
            min="0"
            max="24"
            value={pendingHours}
            onChange={handleHoursChange}
            aria-label="오늘 순공 시간(시간)"
            className="w-16 border-none bg-transparent text-right text-[1.25rem] font-bold leading-[1.2] text-ink-strong focus:outline-none"
          />
          <span className="text-[0.875rem] leading-[1.4] text-ink-sub">
            시간
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {data.quickAddOptions.map((hours) => (
            <button
              key={hours}
              type="button"
              onClick={() => handleQuickAdd(hours)}
              className="h-8 shrink-0 rounded-full border border-line px-3 text-[0.8125rem] leading-[1.2] text-ink transition-colors hover:border-ink-strong"
            >
              {quickAddLabel(hours)}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={submitting || pendingHours <= 0}
          onClick={handleSubmit}
          className="ml-auto h-[3.125rem] shrink-0 rounded-lg bg-primary px-6 text-[0.9375rem] font-semibold leading-[1.2] text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "저장 중…" : hasRecord ? "기록 수정" : "기록 저장"}
        </button>
        {error && (
          <p className="w-full text-[0.8125rem] leading-[1.4] text-red-600">
            {error}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <GoalRateRow
          label="이상 목표 학습 시간"
          value={data.upperGoalRate}
          dotClassName="bg-[#5AA6F0]"
          fillClassName="bg-[#CCE4F7]"
        />
        <GoalRateRow
          label="최소 목표 학습 시간"
          value={data.lowerGoalRate}
          dotClassName="bg-[#6FC98A]"
          fillClassName="bg-[#ABDFBA]"
        />
      </div>
    </GoalCard>
  );
}
