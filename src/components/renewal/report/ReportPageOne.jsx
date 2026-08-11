import ReportSheetA4 from './ReportSheetA4';
import RadarChart6 from './RadarChart6';
import StudentInfoBlock from './StudentInfoBlock';
import SummaryCards from './SummaryCards';
import PriorityTable from './PriorityTable';
import TraitNarratives from './TraitNarratives';

// 결과 리포트 1페이지(A4-3) — 헤드라인+레이더 / 학생 기본정보 / 주요 학습 특성 섹션
// (§타이틀 → 요약 카드 3장 → 우선순위 표 6행 → 서술 3블록).
// 전 섹션 static 카피 없음 — data prop 하나에서 하향 주입(props 계약 준수).
export default function ReportPageOne({ data }) {
  const { student, headlineLines, learningAxes, summaryCards, traits, traitsHeading } = data;

  // 우선순위 표 = 학습 6축을 점수 오름차순 정렬(정렬 결과가 곧 시안 행 순서와 일치).
  const priorityRows = [...learningAxes].sort((a, b) => a.score - b.score);
  // 섹션 제목은 buildReport 가 문구집 템플릿(section_traits)으로 완성해 내린다 — 이름 미수집(Q-01)
  // 시 '{name} 학생의' 접두를 제거한 축약형까지 거기서 결정한다(§5.2). 여기서 조립하면 폴백이
  // 두 곳이 되어 한쪽만 고쳐진다.

  return (
    <ReportSheetA4 page={1}>
      <div className="relative">
        <p className="mt-[2.875rem] w-[35.875rem] text-[2rem] font-semibold leading-[1.4] tracking-[-0.04rem] text-[#525252]">
          {headlineLines.map((line, index) => (
            <span key={line}>
              {line}
              {index < headlineLines.length - 1 && <br />}
            </span>
          ))}
        </p>

        <RadarChart6
          axes={learningAxes}
          className="absolute left-[35.875rem] top-[2.5625rem]"
        />
      </div>

      <div className="mt-[4.1875rem]">
        <StudentInfoBlock student={student} />
      </div>

      <h2 className="mt-[3.5625rem] text-[1.25rem] font-semibold leading-[1.25rem] text-[#0b84fd]">
        {traitsHeading}
      </h2>

      <div className="mt-[1.8125rem]">
        <SummaryCards cards={summaryCards} />
      </div>

      <div className="mt-[3.9375rem]">
        <PriorityTable rows={priorityRows} />
      </div>

      <div className="mt-[5.875rem]">
        <TraitNarratives items={traits} heading={traitsHeading} />
      </div>
    </ReportSheetA4>
  );
}
