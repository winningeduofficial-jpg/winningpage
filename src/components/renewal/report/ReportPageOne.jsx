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
  const { student, headlineLines, learningAxes, summaryCards, traits, traitsHeading, urgency, notices } =
    data;

  // 우선순위 표 = 학습 6축을 점수 오름차순 정렬(정렬 결과가 곧 시안 행 순서와 일치).
  const priorityRows = [...learningAxes].sort((a, b) => a.score - b.score);
  // 섹션 제목은 buildReport 가 문구집 템플릿(section_traits)으로 완성해 내린다 — 이름 미수집(Q-01)
  // 시 '{name} 학생의' 접두를 제거한 축약형까지 거기서 결정한다(§5.2). 여기서 조립하면 폴백이
  // 두 곳이 되어 한쪽만 고쳐진다.

  return (
    <ReportSheetA4 page={1}>
      {/*
        R3(2026-08-11) — 데스크톱은 헤드라인 옆에 레이더를 절대배치로 겹쳐 올리는 2단 구성이다.
        모바일은 겹칠 폭이 없으므로 relative/absolute 를 끄고 세로로 쌓는다(헤드라인 → 레이더).
      */}
      <div className="relative">
        <p className="fd-headline mt-6 w-full text-[1.5rem] font-semibold leading-[1.4] tracking-[-0.02rem] text-[#525252] lg:mt-[2.875rem] lg:w-[35.875rem] lg:text-[2rem] lg:tracking-[-0.04rem]">
          {headlineLines.map((line, index) => (
            <span key={line}>
              {line}
              {index < headlineLines.length - 1 && <br />}
            </span>
          ))}
        </p>

        {/*
          자리 예약(F-03) — TYPE_COPY.detail(유형별 상세 설명 1문단)이 확정되면 헤드라인 바로
          아래, 즉 여기에 화면 전용(fd-screen-only)으로 들어간다. head 의 부연이라 다른 자리가
          없고, 데스크톱에서 헤드라인 오른쪽은 절대배치 레이더가 차지하고 있어 이 아래로 약
          20rem 의 화면 전용 여백이 실제로 비어 있다(레이더는 flow 에 기여하지 않는다).
          폭은 헤드라인과 같은 lg:w-[35.875rem] 을 재사용하면 되고, fd-screen-only 라 인쇄 훅은
          필요 없다. 조회 키는 data.studentType — 자리를 새로 파지 마라.
          이번 범위에서 렌더하지 않는 이유: 8종 중 문구가 갖춰진 일부에만 뜨면 비대칭이 노출된다.
        */}

        {/* fd-radar-overlay — 인쇄 훅(BLOCK 수정). 데스크톱은 헤드라인 옆에 레이더를
            절대배치로 겹쳐 올리는 2단 구성이다; 인쇄에서 lg: 가 꺼지면 모바일처럼 세로로
            쌓여 헤드라인 블록 높이만큼 페이지가 더 길어진다. report-print.css 가 기존
            lg: 리터럴과 동일한 값(35.875rem/2.5625rem)으로 강제한다. */}
        <RadarChart6
          axes={learningAxes}
          className="fd-radar-overlay relative mx-auto mt-6 lg:absolute lg:left-[35.875rem] lg:top-[2.5625rem] lg:mx-0 lg:mt-0"
        />
      </div>

      {/*
        notices.hexCaption(F-05) — 레이더 범례.

        결정문은 "레이더가 절대배치라 flow 를 소비하지 않으니 캡션을 그 박스 안에 넣고 인쇄에도
        싣는다"였다. flow 계산은 맞지만 **겹침**을 빠뜨렸다 — 실측(1440 화면·794 인쇄 양쪽)에서
        절대배치 박스 안의 캡션이 아래 요약 카드 3장 위로 올라타 카드 테두리와 글자가 겹쳤다.
        레이더 하단(컨테이너 기준 27.5rem)과 요약 카드 상단 사이 여유가 1줄분도 없다.

        그래서 캡션만 flow 로 내리고 **화면 전용**으로 강등했다(결정문 가드레일이 지정한 폴백:
        "1px라도 줄면 fd-screen-only 로 강등한다"). 자리는 헤드라인 블록 바로 아래다 —
        모바일에서는 레이더가 flow 라 캡션이 정확히 차트 밑에 오고, 데스크톱에서는 차트와 같은
        가로 밴드 왼쪽에 놓인다. 폭은 헤드라인과 같은 값 재사용(새 매직넘버 아님).
        인쇄에서 display:none 이라 A4 2장은 그대로이고 별도 인쇄 훅도 필요 없다.
      */}
      {/* G-3(NIT 3) — 화면 전용 문단, 모바일 text-base(16px) · 데스크톱 기존 text-sm(14px) 유지. */}
      {notices?.hexCaption && (
        <p className="fd-screen-only mt-3 w-full break-keep text-base leading-[1.4] text-[#6b6b6b] lg:mt-4 lg:w-[35.875rem] lg:text-sm">
          {notices.hexCaption}
        </p>
      )}

      <div className="fd-mt-student mt-8 lg:mt-[4.1875rem]">
        <StudentInfoBlock student={student} />
      </div>

      <h2 className="fd-mt-traits-heading mt-8 text-[1.25rem] font-semibold leading-[1.25rem] text-[#0b84fd] lg:mt-[3.5625rem]">
        {traitsHeading}
      </h2>

      <div className="fd-mt-summary-cards mt-6 lg:mt-[1.8125rem]">
        <SummaryCards cards={summaryCards} />
      </div>

      {/*
        R3(2026-08-11) — urgency(§4.4 E)는 buildReport 가 이미 조립해 두고도 렌더 슬롯이 없어
        죽어 있던 값이다(diagnosisReport.js buildUrgency 주석 참고). "가장 시급한 영역" 카드
        바로 아래 각주로 붙인다 — 위 카드와 같은 화제(긴급도)를 다루면서도 경고성 문구라
        카드 자체보다 한 단계 낮은 위계(text-sm)로 분리한다.
      */}
      {/* WARN-2(2026-08-11) — 본문(#525252)과 동일 색이면 위계가 크기(14px)로만 구분돼
          약하다. #808080(대비 3.95:1)은 14px 본문 기준(WCAG AA ≥4.5:1)에 미달해 되돌린다 —
          StudentInfoBlock 모바일 라벨이 이미 쓰는 #6b6b6b(대비 ≈5.34:1)를 재사용한다
          (새 색상값 도입 아님, 팀리드 재조정 지시 2026-08-11). */}
      {urgency?.message && (
        <p className="fd-mt-urgency mt-3 text-sm leading-[1.4] text-[#6b6b6b] lg:mt-2">{urgency.message}</p>
      )}

      <div className="fd-mt-priority mt-8 lg:mt-[3.9375rem]">
        <PriorityTable rows={priorityRows} />
      </div>

      {/*
        notices.goalCompare(F-05) — 이 문장이 설명하는 대상은 바로 위 표의 '현재 수준/목표 수준'
        열과 요약 카드의 '목표 75점'이다. 확장 영역으로 보내면 두 화면만큼 떨어져 연결이 끊긴다.
        인쇄에 넣지 않는 이유: 1페이지 flow 여유가 71.0px 뿐인데 이건 hexCaption 과 달리
        flow 요소라 그 여유를 직접 갉아먹는다(절대배치 공짜 공간이 없다).
      */}
      {/* G-3(NIT 3) — 화면 전용 문단, 모바일 text-base(16px) · 데스크톱 기존 text-sm(14px) 유지. */}
      {notices?.goalCompare && (
        <p className="fd-screen-only mt-3 break-keep text-base leading-[1.4] text-[#6b6b6b] lg:text-sm">
          {notices.goalCompare}
        </p>
      )}

      <div className="fd-mt-traits mt-10 lg:mt-[5.875rem]">
        {/* notices.traitIntro — TraitNarratives 3블록을 소개하는 리드 문장(§5.1 고정 안내).
            traitsHeading(§타이틀)은 SummaryCards·PriorityTable 과 공용이라 "특성 세 가지"를
            특정하지 않는다 — 이 블록 바로 위에서만 좁혀 소개한다. */}
        {/* WARN-2 — urgency.message 와 동일 사유로 #6b6b6b(대비 ≈5.34:1) 재사용. */}
        {notices?.traitIntro && (
          <p className="mb-3 text-sm leading-[1.4] text-[#6b6b6b]">{notices.traitIntro}</p>
        )}
        <TraitNarratives items={traits} heading={traitsHeading} />
      </div>
    </ReportSheetA4>
  );
}
