/**
 * 무료진단 설문 문항 데이터 (19문항 / 5스텝)
 * Figma: hsokTD6OilcNEXyCR24sn4 / 1889:13222 ("설문조사 선택한 상태"), 1889:8753 ("설문조사 ver2")
 *        + 1889:9045, 1889:9491, 1889:9866, 1889:10355, 1889:10656
 *
 * docs/handoff/fd-ver3/survey-*.md (화면별 실측 핸드오프) 대조 결과.
 * - number 1~19 전부 존재. 12번은 1889:9866 의 두 번째 "10" 뱃지 카드(14지 복수선택)이며
 *   시안 뱃지 숫자 "10" 은 오기로 확정됨. 1889:9491 의 13지 복수선택이 진짜 10번이다.
 * - page: 1~5 = 시안 프레임 5개(8753 / 9045 / 9491 / 9866 / 10656)와 1:1 대응하는 스텝 번호.
 *   문항 분포 3 / 5 / 2 / 4 / 5 = 19.
 * - q3 / q8 안에 중첩된 조건부 문항은 number:null + extra.embeddedIn 으로 표시하며
 *   부모와 동일한 page 를 갖는다.
 *   (extra.dependsOn.questionId 답변이 채워지면 부모 QuestionCard 안에서 노출)
 * - maxSelect: 복수선택 최대 개수. 없으면 무제한.
 * - exclusiveValues: 선택 시 같은 문항의 다른 선택을 모두 해제해야 하는 배타 선택지.
 */
export const renewalSurveyQuestions = [
  {
    id: 'q1',
    number: 1,
    page: 1,
    category: '기본정보',
    title: '현재 학년을 선택해 주세요',
    helper: '하나만 선택해 주세요.',
    type: 'radio-chip',
    options: ['중학교 3학년', '고등학교 1학년', '고등학교 2학년', '고등학교 3학년', 'N수생'],
    extra: {}
  },
  {
    id: 'q2',
    number: 2,
    page: 1,
    category: '기본정보',
    title: '현재 재학 중인 학교 유형을 선택해 주세요.',
    helper: '하나만 선택해 주세요.',
    type: 'radio-chip',
    options: ['일반고', '자율형・사립고', '특목고', '특성화고', '기타', '해당 없음'],
    extra: {}
  },
  {
    id: 'q3',
    number: 3,
    page: 1,
    category: '목표설정',
    title: '현재 진학 목표는 어느 정도 정해져 있나요?',
    helper: '하나만 선택해 주세요.',
    type: 'radio-row',
    options: [
      '목표 대학과 학과가 모두 정해져 있어요',
      '목표 대학만 정해져 있어요',
      '희망 학과나 계열만 정해져 있어요',
      '대략적인 대학 수준만 생각하고 있어요',
      '여러 목표 사이에서 고민하고 있어요',
      '아직 구체적인 목표가 없어요'
    ],
    extra: {}
  },
  {
    id: 'q3-target-university',
    number: null,
    page: 1,
    category: null,
    title: '목표대학 (선택입력)',
    helper: null,
    type: 'text',
    options: [],
    extra: {
      embeddedIn: 'q3',
      dependsOn: { questionId: 'q3' },
      placeholder: '예) 성균관대학교'
    }
  },
  {
    id: 'q3-target-major',
    number: null,
    page: 1,
    category: null,
    title: '희망 학과 또는 모집단위 (선택입력)',
    helper: null,
    type: 'text',
    options: [],
    extra: {
      embeddedIn: 'q3',
      dependsOn: { questionId: 'q3' },
      placeholder: '예) 경영학과'
    }
  },
  {
    id: 'q3-target-reason',
    // Figma 원문 라벨이 q3-target-major 와 중복 표기된 오탈자 — 사용자 확정 문구로 교체
    number: null,
    page: 1,
    category: null,
    title: '그 목표를 선택한 이유',
    helper: null,
    type: 'radio-row',
    options: [
      '해당 분야에 관심과 적성이 있어서',
      '희망 직업과 연결되어 있어서',
      '대학의 인지도나 선호도가 높아서',
      '현재 성적으로 지원할 수 있을 거 같아서',
      '부모님이나 주변의 권유로',
      '지역이나 통학 조건이 적합해서',
      '아직 충분히 알아보지 못했어요'
    ],
    extra: {
      embeddedIn: 'q3',
      dependsOn: { questionId: 'q3' }
    }
  },
  {
    id: 'q4',
    number: 4,
    page: 2,
    category: '기본정보',
    title: '현재 적용되는 내신 등급 체계를 선택해 주세요.',
    helper: '하나만 선택해 주세요.',
    type: 'radio-row',
    options: ['9등급제', '5등급제', '성취평가제 중심', '잘 모르겠어요'],
    extra: {}
  },
  {
    id: 'q5',
    number: 5,
    page: 2,
    category: '기본정보',
    title: '입력하려는 전체 평균 내신은 어떤 기준인가요?',
    helper: '하나만 선택해 주세요.',
    type: 'radio-row',
    options: [
      '전 과목 평균 내신',
      '국영수사과 평균',
      '국영수사 평균',
      '국영수과 평균',
      '대학별 환산 내신',
      '학교에서 제공한 평균 내신',
      '정확히 모르겠어요'
    ],
    extra: {}
  },
  {
    id: 'q6',
    number: 6,
    page: 2,
    category: '성적입력',
    title: '현재 성적을 입력해 주세요',
    helper: '',
    type: 'grade-grid',
    options: [],
    extra: {
      groups: [
        {
          key: 'overall',
          label: '전체 평균 및 과목별 평균',
          fields: [
            { key: 'overall_avg', label: '전체 평균', placeholder: '3.24' },
            { key: 'korean', label: '국어', placeholder: '3.0' },
            { key: 'math', label: '수학', placeholder: '2.1' },
            { key: 'english', label: '영어', placeholder: '3.5' },
            { key: 'social', label: '사회', placeholder: '3.4' },
            { key: 'science', label: '과학', placeholder: '2.8' },
            { key: 'korean_history', label: '한국사', placeholder: '2.0' }
          ]
        },
        {
          key: 'mock_exam',
          label: '최근 모의고사 등급',
          fields: [
            { key: 'mock_korean', label: '국어 등급', placeholder: '1~9' },
            { key: 'mock_math', label: '수학', placeholder: '1~9' },
            { key: 'mock_english', label: '영어', placeholder: '1~9' },
            { key: 'mock_social', label: '사회', placeholder: '1~9' },
            { key: 'mock_science', label: '과학', placeholder: '1~9' },
            { key: 'mock_korean_history', label: '한국사', placeholder: '1~9' }
          ]
        }
      ]
    }
  },
  {
    id: 'q7',
    number: 7,
    page: 2,
    category: '성적입력',
    title: '학기별 전체 평균 내신을 입력해 주세요',
    helper: '',
    type: 'grade-grid',
    options: [],
    extra: {
      groups: [
        {
          key: 'semester_avg',
          label: '',
          fields: [
            { key: 'sem1_1', label: '1학년 1학기', placeholder: '4.10' },
            { key: 'sem1_2', label: '1학년 2학기', placeholder: '3.68' },
            { key: 'sem2_1', label: '2학년 1학기', placeholder: '3.21' },
            { key: 'sem2_2', label: '2학년 2학기', placeholder: '2.95' },
            { key: 'sem3_1', label: '3학년 1학기', placeholder: '2.72' }
          ]
        }
      ]
    }
  },
  {
    id: 'q8',
    number: 8,
    page: 2,
    category: '기본정보',
    title: '최근 성적은 어떤 흐름을 보이고 있나요?',
    helper: '하나만 선택해 주세요.',
    type: 'radio-row',
    options: [
      '대부분의 과목이 상승하고 있어요',
      '일부 과목은 상승하고 일부는 비슷해요',
      '큰 변화 없이 정체되어 있어요',
      '일부 과목이 하락하고 있어요',
      '과목마다 성적 변동이 큰 편이에요',
      '아직 비교할 시험 결과가 부족해요'
    ],
    extra: {}
  },
  {
    id: 'q8-followup',
    // 결정 B9=(b): 선택지에 '여러 과목'이 있으므로 단일선택이 설계 의도. chip-multi → radio-chip.
    number: null,
    page: 2,
    category: null,
    title: '성적 변화가 가장 큰 과목',
    helper: null,
    type: 'radio-chip',
    options: ['국어', '수학', '영어', '사회', '과학', '탐구', '여러 과목', '잘 모르겠어요'],
    extra: {
      embeddedIn: 'q8',
      dependsOn: { questionId: 'q8' }
    }
  },
  {
    id: 'q9',
    number: 9,
    page: 3,
    category: '기본정보',
    title: '다음 문장이 현재 자신의 모습과 얼마나 가까운지 선택해 주세요.',
    helper: '',
    type: 'likert',
    options: [],
    extra: {
      scale: ['매우 그렇다', '대체로 그렇다', '보통이다', '별로 그렇지 않다', '전혀 그렇지 않다'],
      statements: [
        '다음 시험에서 달성하고 싶은 성적이나 등급이 구체적으로 정해져 있다',
        '목표를 위해 어떤 과목과 단원을 먼저 공부해야 하는지 알고 있다',
        '해야 할 공부를 주간 또는 일간 단위의 구체적인 분량으로 나누고 있다',
        '시험, 수행평가, 학교 일정까지 고려해 계획을 조정하고 있다',
        '세운 계획의 70% 이상을 실제로 완료하는 편이다',
        '해야 할 공부를 미루지 않고 정해진 시간에 시작하는 편이다',
        '평일과 주말에 일정한 공부 시간을 확보하고 있다',
        '취약 과목과 중요한 과목에 시간을 우선 배분하고 있다',
        '틀린 문제의 원인을 구분해 다시 확인하고 있다',
        '시험 결과를 보고 공부 방법이나 계획을 수정한다',
        '성적이 기대보다 낮아도 학습 리듬을 비교적 빠르게 회복한다',
        '해야 할 일이 많거나 불안할 때도 공부를 시작할 수 있다'
      ]
    }
  },
  {
    // 1889:9491 의 Q10 (13지). 1889:9866 / 1889:10355 에 뱃지 "10" 으로 그려진 14지 문항은
    // 별개 문항이며 12번이 확정이다(q12 참조).
    id: 'q10',
    number: 10,
    page: 3,
    category: '기본정보',
    title: '최근 학습을 가장 자주 방해하는 요인은 무엇인가요?',
    helper: '최대 3개를 선택해 주세요',
    type: 'checkbox-row',
    maxSelect: 3,
    exclusiveValues: ['특별히 큰 어려움은 없어요'],
    options: [
      '무엇부터 공부해야 할지 모르겠어요',
      '계획을 너무 크게 세워 자주 밀려요',
      '계획은 있지만 시작을 자주 미뤄요',
      '휴대전화나 영상 때문에 집중이 끊겨요',
      '학교와 학원 일정 때문에 자습 시간이 부족해요',
      '특정 과목의 공부 방법을 모르겠어요',
      '문제를 풀고도 오답 정리를 하지 못해요',
      '공부한 시간에 비해 성적이 잘 오르지 않아요',
      '수행평가와 시험 준비가 자주 겹쳐요',
      '성적과 입시에 대한 불안이 커요',
      '주변 학생과 비교하면서 자신감이 떨어져요',
      '공부에 대한 의욕이 많이 줄었어요',
      '특별히 큰 어려움은 없어요'
    ],
    extra: {}
  },
  {
    id: 'q11',
    number: 11,
    page: 4,
    category: '기본정보',
    title: '다음 문장이 현재 자신의 모습과 얼마나 가까운지 선택해 주세요.',
    helper: '',
    type: 'likert',
    options: [],
    extra: {
      scale: ['매우 그렇다', '대체로 그렇다', '보통이다', '별로 그렇지 않다', '전혀 그렇지 않다'],
      statements: [
        '과목별 성적과 학습 상태를 비교해 강점과 약점을 알고 있다',
        '취약 과목을 보완하기 위한 구체적인 학습 방법이 있다',
        '수행평가 안내문에서 평가 기준과 제출 조건을 파악할 수 있다',
        '수행평가를 시험 준비와 겹치지 않게 미리 준비하는 편이다',
        '교과에서 배운 개념을 탐구 주제로 발전시킬 수 있다',
        '신뢰할 수 있는 자료를 활용해 단순 조사 이상의 분석을 만들 수 있다',
        '이전에 한 활동을 새로운 탐구로 심화하거나 확장할 수 있다',
        '교과 활동과 진로 관심을 자연스럽게 연결할 수 있다',
        '활동에서 맡은 역할과 실제 수행 과정을 구체적으로 설명할 수 있다',
        '활동을 통해 배운 점과 성장한 점을 자기평가서로 정리할 수 있다',
        '희망 대학과 학과에서 중요하게 보는 요소를 알고 있다',
        '현재 성적과 학생부를 기준으로 앞으로 보완할 부분을 알고 있다'
      ]
    }
  },
  {
    // 1889:9866 / 1889:10355 의 두 번째 "10" 뱃지 카드(14지). 뱃지 숫자는 시안 오기이며
    // 실제 문항 번호는 12번으로 확정됨.
    id: 'q12',
    number: 12,
    page: 4,
    category: '기본정보',
    title: '학교 활동이나 입시 준비에서 현재 가장 어려운 부분은 무엇인가요?',
    helper: '최대 3개를 선택해 주세요',
    type: 'checkbox-row',
    maxSelect: 3,
    exclusiveValues: ['현재는 관련 도움이 크게 필요하지 않아요'],
    options: [
      '과목별 성적을 어떻게 관리해야 할지 모르겠어요',
      '수행평가 안내문을 해석하기 어려워요',
      '수행평가 주제를 정하기 어려워요',
      '자료를 찾고 글의 구조를 구성하기 어려워요',
      '기본적인 보고서는 쓸 수 있지만 깊이가 부족해요',
      '교과 내용을 심화 탐구로 발전시키기 어려워요',
      '진로와 교과 활동을 연결하기 어려워요',
      '이전에 했던 활동과 겹치지 않는 주제를 만들기 어려워요',
      '논문이나 학술자료를 활용하기 어려워요',
      '활동 후 자기평가서를 작성하기 어려워요',
      '학생부의 강점과 부족한 점을 모르겠어요',
      '목표 대학의 입결과 전형을 해석하기 어려워요',
      '지원 대학의 도전·적정·안정 범위를 모르겠어요',
      '현재는 관련 도움이 크게 필요하지 않아요'
    ],
    extra: {}
  },
  {
    id: 'q13',
    number: 13,
    page: 4,
    category: '기본정보',
    title: '현재 준비 중인 일정 중 가장 가까운 것은 무엇인가요?',
    helper: '하나만 선택해 주세요.',
    type: 'radio-row',
    options: [
      '7일 이내 수행평가',
      '2주 이내 시험 또는 수행평가',
      '한 달 이내 중요한 일정',
      '수시 원서 접수 준비',
      '당장 급한 일정 없음',
      '잘 모르겠어요'
    ],
    extra: {}
  },
  {
    id: 'q14',
    number: 14,
    page: 4,
    category: '기본정보',
    title: '어떤 방식의 도움을 받을 때 가장 잘 실천할 수 있을 것 같아요?',
    helper: '최대 2개를 선택해 주세요.',
    type: 'checkbox-row',
    maxSelect: 2,
    options: [
      '성적과 문제점 분석',
      '주 1회 계획 점검',
      '매일 공부량 관리',
      '과목별 공부 방법 피드백',
      '수행평가 집중 지원',
      '심화탐구 설계',
      '자기평가서 정리',
      '지원 가능 대학 분석',
      '수시전략 상담',
      '멘토와 고민 상담'
    ],
    extra: {}
  },
  {
    id: 'q15',
    number: 15,
    page: 5,
    category: '기본정보',
    title: '목표 대학 입결 조회',
    helper: null,
    type: 'cascade',
    options: [],
    extra: {
      levels: [
        { key: 'university', label: '대학 선택', placeholder: '건국대학교' },
        { key: 'department', label: '학과 또는 모집단위', placeholder: '경영학과' },
        { key: 'admissionType', label: '전형 유형', placeholder: '학생부종합' },
        { key: 'detailType', label: '세부 전형명', placeholder: 'KU자기추천' }
      ]
    }
  },
  {
    id: 'q16',
    number: 16,
    page: 5,
    category: '기본정보',
    title: '수능 최저 예상은 어떠신가요?',
    helper: '하나만 선택해 주세요.',
    type: 'radio-row',
    options: [
      '충족 가능성이 높아요',
      '경계 수준이에요',
      '충족하기 어려워요',
      '수능최저가 없어요',
      '잘 모르겠어요'
    ],
    extra: {}
  },
  {
    id: 'q17',
    number: 17,
    page: 5,
    category: '기본정보',
    title: '학생부종합 준비 상태는 어떠신가요?',
    helper: '하나만 선택해 주세요.',
    type: 'radio-row',
    options: [
      '여러 학년에 걸쳐 이어져 있어요',
      '활동은 있지만 연결되지 않아요',
      '성적은 괜찮지만 탐구가 부족해요',
      '탐구는 많지만 성적이 부족해요',
      '모두 평균적인 수준이에요',
      '강점과 부족한 점을 모르겠어요'
    ],
    extra: {}
  },
  {
    id: 'q18',
    number: 18,
    page: 5,
    category: '기본정보',
    title: '면접 준비 상태는 어떠신가요?',
    helper: '하나만 선택해 주세요.',
    type: 'radio-row',
    options: [
      '충분히 연습했고 자신 있어요',
      '기본은 말할 수 있지만 후속이 어려워요',
      '학생부 정리가 부족해요',
      '준비를 시작하지 못했어요',
      '면접이 없는 전형이에요',
      '잘 모르겠어요'
    ],
    extra: {}
  },
  {
    id: 'q19',
    number: 19,
    page: 5,
    category: '기본정보',
    title: '최근 공부나 입시와 관련하여 가장 답답했던 상황을 한 문장으로 적어 주세요.',
    helper: null,
    type: 'text',
    multiline: true,
    // 주관식 자유서술 — 선택입력이라 스텝 진행(제출) 요건에서 제외한다.
    optional: true,
    options: [],
    extra: {
      // 시안 입력 영역 992 × 105 px = 62rem × 6.5625rem, 콘텐츠 상단 정렬(items-start)
      placeholder: '예) 성적은 오르지 않고 해야 할 활동은 많은데 무엇부터 해야 할지 모르겠어요.'
    }
  }
];

export default renewalSurveyQuestions;
