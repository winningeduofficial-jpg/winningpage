// ⚠ I단계 실배선(api/goal/report.js) 이후 GrowthReportBody.jsx/DirectionReportBody.jsx는 더
// 이상 이 파일을 import하지 않는다 — 리포트 데이터는 실제로 서버가 계산해 내려준다. 이 파일은
// 삭제하지 않고 남겨 둔다: 아래 카피 전문·결함 정정 주석은 part-11/12/13/15 시안을 실측해
// 정리한 판단 기록이고, insights.js(자연어 슬롯) 문구를 다시 다듬을 때 참고 대상이다.
//
// 목표관리 앱 — 성장 리포트(#33 주간/#34 월간) + 학습방향 리포트(#37 내신/#38 정시) 전용 목업.
// docs/figma-goal/part-11.md(#33) · part-12.md(#34/#35/#36) · part-13.md(#37/#38) · part-15.md(#43/#44)
// "카피 전문" 절을 정본으로 삼되, 작업 지시서 "반드시 정정 반영할 시안 결함" 표의 번호를 그대로
// 반영했다(각 항목에 `결함N` 주석으로 표시). 성적 관리(#35/#36)는 기존 `goalMock.js`의
// `mockGrades`를 그대로 재사용하므로 이 파일에 별도로 두지 않는다(중복 생성 금지 원칙).
//
// ⚠︎ 「합격 가능성 변화」 카드는 `goalMock.js`의 `mockAdmissionChance`가 주간 리포트 전용 정본이다
// (작업 지시서 "이미 있는 것" 절). 월간 리포트는 그 계열과 다른 수치를 쓰므로(part-12 §130)
// 여기 `monthlyAdmissionChance`로 별도 정의한다 — `mockTargetUniversities`는 어느 쪽에도 쓰지 않는다.

// ── 주간 성장 리포트 (#33) ──────────────────────────────────────────────
export const weeklyGrowthReport = {
  period: 'weekly',
  heading: '주간 성장 리포트',
  periodLabel: '2026-07-27 ~ 2026-08-02',
  hero: {
    // 사이드바 `김주원` vs 히어로 `김형준 학생` 불일치(결함1) — `김주원`으로 통일.
    narrative:
      '김주원 학생, 이번 주도 잘 해냈습니다! 이번 주 총 공부 시간은 16시간 30분입니다. 최소 목표 달성률은 110%, 이상 목표 달성률은 106%입니다.',
    kpis: [
      { label: '이번 주 공부 시간', value: '16시간30분' },
      { label: '이상 목표 달성률', value: '106%' },
      { label: '최소 목표 달성률', value: '110%' },
      { label: '주간 완성도', value: '100점' },
      { label: '목표군 내 위치', value: '1위' }
    ]
  },
  overview: {
    label: '한눈에 보기',
    subLabel: '이번 주 목표・공부량・컨디션',
    achievement: {
      title: '이번 주 목표 달성 현황',
      rows: [
        { label: '수시 합격률', value: 62, max: 100 },
        { label: '정시 합격률', value: 48, max: 100 }
      ]
    },
    studyTime: {
      // 결함4: Row1 카드1·카드2 제목이 둘 다 `이번 주 목표 달성 현황`이던 것을 정정(추정).
      title: '요일별 공부 시간', // (추정)
      unit: 'h',
      bars: [
        { label: '월', value: 0 },
        { label: '화', value: 0 },
        { label: '수', value: 0 },
        { label: '목', value: 0 },
        { label: '금', value: 5 },
        { label: '토', value: 7.5 },
        { label: '일', value: 4 }
      ]
    },
    condition: {
      title: '이번 주 컨디션',
      rows: [
        { emoji: '😆', label: '좋음', value: '2일' },
        { emoji: '🙂', label: '보통', value: '1일' },
        { emoji: '☹️', label: '나쁨', value: '0일' }
      ]
    }
  },
  execution: {
    label: '실행 분석',
    subLabel: '계획을 어떻게 지켰는지',
    subjectShare: {
      title: '과제별 학습 비중',
      empty: true,
      emptyMessage: '타이머 과목 데이터가 아직 없습니다.',
      tip: {
        variant: 'info',
        text: '타이머가 과목 데이터가 아직 충분히 누적되지 않아 과목별 학습 균형 판단은 보류합니다.'
      }
    },
    timeSlot: {
      title: '시간대별 학습 효율',
      rows: [
        { label: '오전 6~9', value: 0, unit: 'h' },
        { label: '오전 9~12', value: 0, unit: 'h' },
        { label: '오후 12~3', value: 0, unit: 'h' },
        { label: '오후 3~6', value: 0, unit: 'h' },
        { label: '오후 6~9', value: 6.5, unit: 'h' },
        { label: '오후 9~12', value: 3.5, unit: 'h' }
      ],
      tip: {
        variant: 'info',
        text: '오후 6~9시가 가장 긴 시간대입니다. 이 시간에 핵심 과목을 배치하면 루틴 안정성이 높아집니다.'
      }
    },
    distraction: {
      title: '학습 방해요인 분석',
      rows: [
        { label: '학교/과제 일정', value: 3, unit: '회' },
        { label: '스마트폰', value: 2, unit: '회' }
      ],
      tip: {
        variant: 'warn',
        text: '학교/과제 일정 요인이 반복적으로 나타났습니다. 다음 기간에는 해당 요인이 발생하는 시간대와 과목을 함께 확인해 학습 환경을 조정할 필요가 있습니다.'
      }
    }
  },
  outcome: {
    label: '성과의 변화',
    subLabel: '무엇을 끝냈고, 목표에 얼마나 가까워졌는지',
    coreItems: {
      title: '완료한 핵심 학습 항목',
      rows: [{ label: '오답 정리', value: 3, unit: '회' }],
      tip: {
        variant: 'success',
        text: '오답 정리 항목이 전체 기록의 100%를 차지합니다. 특정 학습 방식에 치우친 흐름이므로, 다음 기간에는 오답 정리·개념 학습·기출 분석이 함께 이어지도록 학습 구조를 조정할 필요가 있습니다.'
      }
    },
    conditionTiles: {
      // 결함5: Row3 카드2 제목이 Row2 카드2와 중복(`시간대별 학습 효율`) → 정정(추정).
      title: '컨디션별 학습량', // (추정)
      // 결함6: 라벨 3개 모두 `좋음`이던 것을 `좋음/보통/나쁨`으로 정정. 값(2일/평균 6.3h)의
      // 3행 동일 표기는 지시서 결함 목록에 없어 원본 그대로 보존한다(추정 남용 금지).
      tiles: [
        { emoji: '😆', label: '좋음', value: '2일', avg: '평균 6.3h' },
        { emoji: '🙂', label: '보통', value: '2일', avg: '평균 6.3h' },
        { emoji: '☹️', label: '나쁨', value: '2일', avg: '평균 6.3h' }
      ],
      tip: {
        variant: 'time',
        text: '좋은 컨디션을 유지한 날이 많았습니다. 이 흐름을 공부 시간 확대로만 연결하기보다, 핵심 과목 복습과 오답 분석의 질을 높이는 방향으로 활용하면 좋습니다.'
      }
    },
    admission: { title: '합격 가능성 변화' } // 데이터는 goalMock.mockAdmissionChance 참조
  },
  mentorComment: {
    title: '멘토 코멘트',
    dateLabel: '2026-08-02 작성',
    body: '김주원 학생은 주중 입반 후 짧은 적응 기간 동안 학습 기록을 시작했습니다. 이번 데이터는 정밀한 성취 판단보다 다음 주 월요일부터 이어질 정규 루틴 준비 자료로 활용하는 것이 적절합니다.'
  }
};

// ── 월간 성장 리포트 (#34) ──────────────────────────────────────────────
export const monthlyGrowthReport = {
  period: 'monthly',
  heading: '월간 성장 리포트',
  // 결함7: 원본은 `2026-07-27 ~ 2026-08-02`(1주 범위)로 월간 리포트인데 기간 표기가 틀렸다 →
  // 월 범위로 정정(추정: 히어로 문단이 "7월 총 공부 시간"이라 7월 전체로 판단).
  periodLabel: '2026-07-01 ~ 2026-07-31', // (추정)
  hero: {
    narrative:
      '김주원 학생, 이번 달 꾸준히 성장했습니다! 7월 총 공부 시간은 99시간 30분입니다. 4주 평균 24시간 52분으로, 3주차가 가장 안정적이었습니다.',
    kpis: [
      { label: '7월 공부 시간', value: '99시간30분' },
      { label: '이상 목표 달성률', value: '55%' },
      { label: '최소 목표 달성률', value: '79%' },
      { label: '월간 완성도', value: '86점' },
      { label: '목표군 내 위치', value: '3위' }
    ]
  },
  overview: {
    label: '한눈에 보기',
    subLabel: '이번 달 목표・공부량・컨디션', // 결함8: '이번 주' → '이번 달'
    achievement: {
      title: '이번 달 목표 달성 현황',
      summaryRows: [
        { label: '이상 목표', value: 55, max: 100 },
        { label: '최소 목표', value: 79, max: 100 }
      ],
      // 결함12: 원본은 4행 전부 `최소 52% / 이상 36%` 동일(플레이스홀더 인지) → 목업엔 서로 다른
      // 값을 넣는다(추정, 임의 수치).
      weeks: [
        { label: '1주차', min: 48, upper: 30 },
        { label: '2주차', min: 55, upper: 33 },
        { label: '3주차', min: 98, upper: 62 }, // 히어로 문단 "3주차가 가장 안정적" 근거로 최고치
        { label: '4주차', min: 65, upper: 41 }
      ]
    },
    studyTime: {
      title: '주차별 공부 시간',
      unit: 'h',
      bars: [
        { label: '1주', value: 16.5 },
        { label: '2주', value: 28 },
        { label: '3주', value: 31 },
        { label: '4주', value: 24 }
      ]
    },
    condition: {
      title: '이번 달 컨디션', // 결함8: '이번 주 컨디션' → '이번 달 컨디션'
      rows: [
        { emoji: '😆', label: '좋음', value: '14일' },
        { emoji: '🙂', label: '보통', value: '9일' },
        { emoji: '☹️', label: '나쁨', value: '3일' }
      ]
    }
  },
  execution: {
    label: '실행 분석',
    subLabel: '계획을 어떻게 지켰는지',
    subjectShare: {
      title: '과목별 학습 비중',
      empty: false,
      rows: [
        { label: '수학', value: 38 },
        { label: '국어', value: 27 },
        { label: '영어', value: 21 },
        { label: '탐구', value: 14 }
      ],
      tip: {
        variant: 'info',
        text: '수학 비중이 38%로 가장 높습니다. 목표 대비 격차가 큰 탐구를 20% 수준까지 끌어올리는 것이 좋습니다.'
      }
    },
    timeSlot: {
      title: '시간대별 학습 효율',
      rows: [
        { label: '오전 6~9', value: 4, unit: 'h' },
        { label: '오전 9~12', value: 9, unit: 'h' },
        { label: '오후 12~3', value: 17, unit: 'h' },
        { label: '오후 3~6', value: 24, unit: 'h' },
        { label: '오후 6~9', value: 36, unit: 'h' },
        { label: '오후 9~12', value: 9.5, unit: 'h' }
      ],
      tip: {
        variant: 'info',
        text: '오후 6~9시가 가장 긴 시간대입니다. 이 시간에 핵심 과목을 배치하면 루틴 안정성이 높아집니다.'
      }
    },
    distraction: {
      title: '학습 방해요인 분석',
      rows: [
        { label: '학교/과제 일정', value: 9, unit: '회' },
        { label: '스마트폰', value: 7, unit: '회' },
        { label: '피로・수면 부족', value: 5, unit: '회' }
      ],
      tip: {
        variant: 'warn',
        text: '학교/과제 일정 요인이 반복적으로 나타났습니다. 다음 기간에는 해당 요인이 발생하는 시간대와 과목을 함께 확인해 학습 환경을 조정할 필요가 있습니다.'
      }
    }
  },
  outcome: {
    label: '성과의 변화',
    subLabel: '무엇을 끝냈고, 목표에 얼마나 가까워졌는지',
    coreItems: {
      title: '완료한 핵심 학습 항목',
      rows: [
        { label: '오답 정리', value: 12, unit: '회' },
        { label: '개념 학습', value: 8, unit: '회' },
        // 결함9: 3행 라벨이 1행과 중복(`오답 정리`) → 성공 박스 문장 근거로 `기출 분석` 정정.
        { label: '기출 분석', value: 5, unit: '회' } // (추정)
      ],
      tip: {
        variant: 'success',
        text: '오답 정리·개념 학습·기출 분석이 함께 이어졌습니다. 기출 분석 비중을 조금 더 높이면 실전 대응력이 올라갑니다.'
      }
    },
    conditionTiles: {
      title: '컨디션별 학습량', // (추정) — 주간과 동일 사유(결함5 계열)
      tiles: [
        { emoji: '😆', label: '좋음', value: '14일', avg: '평균 4.6h' },
        { emoji: '🙂', label: '보통', value: '9일', avg: '평균 3.1h' }, // 결함6: '좋음' 중복 정정
        { emoji: '☹️', label: '나쁨', value: '3일', avg: '평균 1.2h' }
      ],
      tip: {
        variant: 'time',
        text: '컨디션이 좋은 날의 평균 공부 시간이 나쁜 날의 약 4배입니다. 수면 시간을 일정하게 유지하는 것이 총 학습량에 가장 큰 영향을 줍니다.'
      }
    },
    admission: { title: '합격 가능성 변화' } // 데이터는 아래 monthlyAdmissionChance 참조
  },
  strategy: {
    label: '다음 달 전략',
    subLabel: '지금 유형에서 무엇부터 바꿀지',
    learningType: {
      title: '이번 달 학습 유형 진단',
      badge: '기록안정·총량보완형',
      body: '주 5일 이상 기록이 이어졌지만 최소 목표 달성률은 79%로 아직 목표선 아래입니다. 3주차 수준(98%)을 기준으로 총량을 끌어올리는 단계입니다.'
    },
    plan: {
      title: '다음 달 관리 전략',
      rows: [
        { label: '핵심 과목 주간 고정 학습 시간 유지', value: '주 12시간' },
        { label: '오답 정리 루틴 주 3회 이상 확보', value: '주 3회' },
        { label: '시험 2주 전 일정 미리 비워 두기', value: '8월 6일까지' }
      ]
    },
    expectedEffect: {
      title: '기대 효과',
      pills: ['루틴 안정화', '공백 감소', '성과 확대'],
      caption: '탐구 비중을 20%까지 올리면 목표 대비 격차가 가장 빠르게 줄어듭니다.'
    }
  },
  mentorComment: {
    title: '멘토 코멘트',
    dateLabel: '2026-08-02 작성',
    body: '7월은 루틴이 자리 잡은 달입니다. 다만 3주차 이후 총량이 줄었고 방해 요인으로 학교/과제 일정이 반복 지적됐습니다. 8월에는 시험 기간 전 2주를 미리 비워 두는 방식으로 총량 변동을 줄이는 것을 권합니다.'
  }
};

// 월간 리포트 전용 "합격 가능성 변화" 데이터(part-12 §130) — 주간 `mockAdmissionChance`와
// 별개 수치. 형태(university/susi/jeongsi.delta·rate)는 동일 스키마로 맞췄다.
// 결함5 대응: `delta`를 goalMock.js의 `mockAdmissionChance`와 동일하게 `{ direction, value }`
// 구조로 통일했다(AdmissionChanceCard의 문자열 파싱 제거에 맞춤).
export const monthlyAdmissionChance = {
  upper: {
    university: '서울대학교 경영대학',
    susi: { delta: { direction: 'up', value: '1.50%' }, rate: 25.9 },
    jeongsi: { delta: { direction: 'up', value: '1.70%' }, rate: 21.4 }
  },
  lower: {
    university: '고려대학교 경영대학',
    susi: { delta: { direction: 'up', value: '1.80%' }, rate: 29.1 },
    jeongsi: { delta: { direction: 'up', value: '1.50%' }, rate: 42.6 }
  }
};

// ── 학습방향 리포트 — 내신 탭 (#37) ─────────────────────────────────────
export const naesinDirectionReport = {
  tab: 'naesin',
  heading: '내 학습 방향 리포트',
  meta: '2026.07.24 · 첫 리포트(고1 1학기 중간 / 고1 1학기 기말)',
  periodChips: [
    { value: '2-1-final', label: '고2-1 기말' },
    { value: '2-1-mid', label: '고2-1 중간' },
    { value: '1-2-final', label: '고1-2 기말' }, // 결함14: 원본 `고1-2기말` 공백 누락 정정
    { value: '1-2-mid', label: '고1-2 중간' },
    { value: '1-1-final', label: '고1-1 기말' },
    { value: '1-1-mid', label: '고1-1 중간' }
  ],
  activePeriod: '2-1-final',
  summary: {
    meta: '고2-1 기말 ・평균 3.25 등급・5등급제',
    typeLabel: '수학 집중 보완형',
    body: '과목군 간 편차는 크지 않지만 전 과목군이 목표선 아래입니다. 최소 목표 2.71등급까지 0.54등급 남았고, 수학군(3.5)을 먼저 끌어올리는 것이 평균 개선에 가장 효과적입니다.'
  },
  subjects: [
    {
      name: '국어군',
      zoneLabel: '보완 필요 구간',
      badge: '2.00 등급',
      // 결함14: 원본 오타 `먼문학·독서·문법` → `문학·독서·문법` 정정(추정: "먼저"+"문학" 결합 흔적).
      body: '서술형 답안의 논리 전개를 문학·독서·문법 중 실점 단원을 분리하고, 오답 선지가 왜 틀렸는지 문장 단위로 정리해야 합니다.', // (추정)
      materials: ['자이스토리 국어 기본', '마더텅 국어 기출', '학교 프린트 누적 정리']
    },
    {
      name: '수학군',
      zoneLabel: '집중 보완 구간',
      badge: '1.50 등급',
      body: '고난도 문항 확장보다 조건 해석, 계산 실수 방지, 풀이 시간 단축이 핵심입니다.',
      materials: ['일품', '블랙라벨', '고난도 기출 선별']
    },
    {
      name: '영어군',
      zoneLabel: '강점 유지 구간',
      badge: '1.50 등급',
      body: '고난도 빈칸·순서·삽입 중심으로 근거 독해를 강화해야 합니다.',
      materials: ['고난도 빈칸·순서·삽입 기출', '학교 부교재 변형문제']
    },
    {
      name: '사회・역사군',
      zoneLabel: '강점 유지 구간',
      badge: '1.50 등급',
      body: '개념 간 비교, 시대 흐름, 사료·자료 판단에서 실수를 줄이는 것이 중요합니다.',
      materials: ['수능특강', '기출 선지 분석', '개념·연표 비교표']
    }
  ]
};

// ── 학습방향 리포트 — 정시 탭 (#38) ─────────────────────────────────────
export const jeongsiDirectionReport = {
  tab: 'jeongsi',
  heading: '내 학습 방향 리포트',
  meta: '2026.07.24 · 첫 리포트(고1 1학기 중간 / 고1 1학기 기말)',
  periodChips: [
    { value: '2-6', label: '고2 6모' },
    { value: '2-3', label: '고2 3모' },
    { value: '1-2-11', label: '고1-2 11월' }
  ],
  activePeriod: '2-6',
  summary: {
    meta: '고2 6모 기준 · 종합 백분위 78.4 · 평균 3.50등급 · 9등급제',
    typeLabel: '수학 집중 보완형',
    body: '영어를 포함해 전 과목이 목표선 아래이며, 그중 수학(백분위 74)에서 격차가 가장 큽니다. 종합 백분위 78.4로 이상 목표 92.0까지 13.6 부족합니다.'
  },
  subjects: [
    {
      name: '국어',
      zoneLabel: '보완 필요 구간',
      badge: '3등급 (백분위 81)',
      body: '지문 독해 속도가 안정되지 않았습니다. 기출 지문을 구조 단위로 끊어 읽는 훈련부터 시작하세요.',
      materials: ['고난도 독서 자료 분석', '문학 선지 근거 정리']
    },
    {
      name: '수학',
      zoneLabel: '집중 보완 구간',
      badge: '4등급 (백분위 74)',
      body: '4과목 중 백분위가 가장 낮아 최우선 보완 과목입니다. 반복 출제 유형부터 완결하세요.',
      materials: ['일품', '블랙라벨', '고난도 기출 선별']
    },
    {
      name: '영어',
      zoneLabel: '강점 유지 구간',
      badge: '3등급 (백분위 81)',
      // part-13 §221: 구간 라벨은 "강점 유지"인데 본문은 보완 톤 — 시안 자체 불일치, 원문 그대로 유지(추정 대상 아님).
      body: '어법·어휘 기본기를 먼저 채워야 합니다. 지문별 어법 포인트를 표로 정리하세요.',
      materials: ['수능특강 영어독해', '어법 클리닉']
    },
    {
      name: '탐구1(과탐)',
      zoneLabel: '강점 유지 구간',
      badge: '4등급 (백분위 74)',
      body: '개념 누락 단원이 남아 있습니다. 오답이 몰린 단원부터 개념을 다시 세우세요.',
      materials: ['수능특강', '기출 선지 분석', '개념·연표 비교표']
    }
  ]
};
