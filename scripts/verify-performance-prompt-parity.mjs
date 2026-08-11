// =====================================================================
// 수행평가 프롬프트·RAG 원문 대조 검증
//
//   node scripts/verify-performance-prompt-parity.mjs
//
// 무엇을 막는가
// -------------
// `api/_lib/performance/prompts.js`와 `knowledge.js`는 외부 앱
// (`/Users/hyunsoo/uwellnow/suhaengpyeong`)에서 **원문 그대로** 옮긴 현장 튜닝의
// 산물이다(docs/수행평가-상세-명세.md §12.1 「1바이트도 변경 금지」, §12.3 「문자 단위
// 원문 이식」). 문제는 이 규정을 어겨도 **아무 에러가 나지 않는다**는 점이다 —
// 조사 하나, 문장부호 하나가 바뀌어도 코드는 그대로 돌고, 모델 출력 품질만 조용히
// 달라진다. 그래서 사람 눈 대신 이 스크립트가 원본 파일과 직접 대조한다.
//
// 무엇을 대조하는가
// -----------------
//   ① `CORE_PRINCIPLES` / `CROSS_SUBJECT_CONNECTION_GUIDE` — `Buffer.equals` 완전 일치
//   ② 주제 추천 system 프롬프트 — §8.4 ~~Q69~~ 예외의 **경계**를 고정한다.
//      원문 유지 줄은 전부 있어야 하고(byte-equal), 스키마로 대체한 줄은 하나도
//      없어야 하며, 문구를 교체한 2줄은 옛 문장이 사라지고 새 문장이 있어야 한다.
//   ③ 주제 추천 user 메시지 — 작업 지시 8조 원문 + 금지 리터럴 `'일반고'` 부재
//   ④ RAG 직렬화 문자열 — `rowToText`/질의문/과거 수행 포맷의 템플릿 원문
//
// 원본이 없으면 SKIP
// ------------------
// 외부 앱은 이 저장소에 없는 로컬 경로다. CI에서는 조용히 SKIP(exit 0)하고,
// 원본이 있는 로컬에서만 실제 대조가 돈다. 경로는 `SUHAENGPYEONG_DIR`로 덮어쓸 수 있다.
// =====================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_DIR = process.env.SUHAENGPYEONG_DIR || '/Users/hyunsoo/uwellnow/suhaengpyeong';

const SOURCE_FILES = {
  config: path.join(SOURCE_DIR, 'api/_lib/config.js'),
  recommendTopics: path.join(SOURCE_DIR, 'api/recommend-topics.js'),
  dynamicKnowledge: path.join(SOURCE_DIR, 'api/_lib/dynamic-knowledge.js'),
  reports: path.join(SOURCE_DIR, 'api/_lib/reports.js'),
  findResources: path.join(SOURCE_DIR, 'api/find-resources.js')
};

const missing = Object.values(SOURCE_FILES).filter((file) => !fs.existsSync(file));

if (missing.length) {
  console.log(`SKIP verify-performance-prompt-parity — 이식 원본 없음 (${SOURCE_DIR})`);
  process.exit(0);
}

const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    console.log(`  ok  ${name}`);
    return;
  }
  failures.push(detail ? `${name}\n      ${detail}` : name);
  console.log(`  FAIL ${name}`);
}

const read = (file) => fs.readFileSync(file, 'utf8');
const lines = (file) => read(file).split('\n');

/** 1-based 행번호 → 그 줄. 원본이 밀리면 대조 자체가 틀어지므로 행번호로 읽는다. */
function sourceLine(file, no) {
  return lines(file)[no - 1];
}

function sourceLineRange(file, from, to) {
  return lines(file).slice(from - 1, to);
}

/** `export const NAME = \`…\`.trim();` 의 백틱 안쪽 원문. */
function extractTemplate(file, name) {
  const text = read(file);
  const startMarker = `export const ${name} = \``;
  const start = text.indexOf(startMarker);

  if (start < 0) throw new Error(`${name} 을(를) ${file} 에서 찾지 못했습니다.`);

  const bodyStart = start + startMarker.length;
  const end = text.indexOf('`.trim();', bodyStart);

  if (end < 0) throw new Error(`${name} 의 닫는 백틱을 찾지 못했습니다.`);

  return text.slice(bodyStart, end).trim();
}

// ---------------------------------------------------------------------
// ① 프롬프트 상수 — 바이트 완전 일치
// ---------------------------------------------------------------------
console.log('\n[1] 프롬프트 상수 바이트 대조');

const ported = await import(path.join(REPO_ROOT, 'api/_lib/performance/prompts.js'));

for (const name of ['CORE_PRINCIPLES', 'CROSS_SUBJECT_CONNECTION_GUIDE']) {
  const original = Buffer.from(extractTemplate(SOURCE_FILES.config, name), 'utf8');
  const mine = Buffer.from(ported[name], 'utf8');

  check(
    `${name} byte-equal (${original.length} bytes)`,
    original.equals(mine),
    `원본 ${original.length}B / 이식본 ${mine.length}B`
  );
}

// ---------------------------------------------------------------------
// ② 주제 추천 system 프롬프트 — 예외의 경계
// ---------------------------------------------------------------------
console.log('\n[2] 주제 추천 system 프롬프트 (§8.4 Q69 예외 경계)');

const SYSTEM = ported.buildTopicRecommendationSystem({
  topicKnowledgeText: '<<KNOWLEDGE>>',
  studentHistoryText: '<<HISTORY>>'
});

// ⓐ 원문 그대로 유지해야 하는 행 (recommend-topics.js 1-based 행번호)
const RETAINED_SYSTEM_LINES = [
  115, 116, 117,        // 역할 3줄
  119, 122, 125,        // RAG 소스 주입 블록 헤더 3개
  128, 129, 130, 131,   // 다른 과목 활용 규칙 헤더 + 1~3조
  135, 136, 137, 138, 139, 140, 141, 142, 143, // 2022 개정 교육과정 8조 + 헤더
  145                   // `출력 규칙:` 헤더
];

for (const no of RETAINED_SYSTEM_LINES) {
  const line = sourceLine(SOURCE_FILES.recommendTopics, no);
  check(
    `원문 유지 :${no}  ${line.slice(0, 34)}…`,
    SYSTEM.split('\n').includes(line),
    `누락된 원문 줄: ${JSON.stringify(line)}`
  );
}

// 출력 규칙 의미 규칙 5개 — **번호만 1~5로 재부여**(§12.1)했으므로 번호를 뗀 본문으로 대조
const SEMANTIC_OUTPUT_RULES = [146, 147, 148, 149, 151];
const stripNumber = (line) => line.replace(/^\d+\.\s*/, '');
const systemLinesNoNumber = SYSTEM.split('\n').map(stripNumber);

SEMANTIC_OUTPUT_RULES.forEach((no, index) => {
  const original = sourceLine(SOURCE_FILES.recommendTopics, no);
  const body = stripNumber(original);

  check(
    `출력 규칙 의미 규칙 :${no} → ${index + 1}번  ${body.slice(0, 26)}…`,
    systemLinesNoNumber.includes(body),
    `누락: ${JSON.stringify(body)}`
  );
});

check(
  '출력 규칙 번호가 1~5로 연속 재부여됐다',
  /출력 규칙:\n1\. .+\n2\. .+\n3\. .+\n4\. .+\n5\. .+$/.test(SYSTEM),
  SYSTEM.slice(SYSTEM.indexOf('출력 규칙:'))
);

check(
  '마크다운 금지 조항이 살아 있다 (§8.4·§12.1 명시 예외 — 폐기 금지)',
  SYSTEM.includes(stripNumber(sourceLine(SOURCE_FILES.recommendTopics, 146)))
);

// ⓑ JSON 계약 전환으로 문구를 교체한 2줄
const REPLACED = [
  {
    no: 132,
    to: "4. 사용한 경우 cross_subject 필드에 어떤 과목의 어떤 흐름을 현재 과목 방식으로 바꾸었는지 설명한다."
  },
  {
    no: 133,
    to: "5. 연계하지 않는 경우 cross_subject 필드에 정확히 '연계하지 않음'만 적는다."
  }
];

for (const { no, to } of REPLACED) {
  const original = sourceLine(SOURCE_FILES.recommendTopics, no);

  check(`문구 교체 :${no} — 옛 문장 부재`, !SYSTEM.includes(original), original);
  check(`문구 교체 :${no} — 새 문장 존재`, SYSTEM.split('\n').includes(to), to);
}

// ⓒ responseSchema로 대체해 삭제한 것
const REMOVED_SYSTEM_LINES = [
  150, // 종료 마커
  152, // 3블록 필수 마커
  153, // `추천 n:` 헤더 형식 강제
  155  // `반드시 아래 형식으로 3개 추천:`
];

for (const no of REMOVED_SYSTEM_LINES) {
  const line = sourceLine(SOURCE_FILES.recommendTopics, no);
  check(
    `스키마 대체 :${no} — 프롬프트에서 제거됨  ${line.slice(0, 30)}…`,
    !SYSTEM.includes(line.trim()),
    `남아 있는 포맷 강제 줄: ${JSON.stringify(line)}`
  );
}

// 번호 뼈대 3벌(`:157-182`)의 항목 줄이 하나도 남지 않아야 한다
const SKELETON_LINES = [...new Set(sourceLineRange(SOURCE_FILES.recommendTopics, 157, 182))]
  .map((line) => line.trim())
  .filter(Boolean);

check(
  `출력 뼈대 ${SKELETON_LINES.length}종이 전부 제거됐다`,
  SKELETON_LINES.every((line) => !SYSTEM.includes(line)),
  SKELETON_LINES.filter((line) => SYSTEM.includes(line)).join(' / ')
);

check(
  '스키마가 뼈대를 대신한다 (3건 고정 + 필드 7개 required)',
  ported.TOPIC_RECOMMENDATION_SCHEMA.properties.topics.minItems === 3 &&
    ported.TOPIC_RECOMMENDATION_SCHEMA.properties.topics.maxItems === 3 &&
    ported.TOPIC_RECOMMENDATION_SCHEMA.properties.topics.items.required.length === 7
);

check(
  '스키마 필드 순서 = 시안 3754:4872 섹션 순서(§5.11)',
  JSON.stringify(ported.TOPIC_RECOMMENDATION_SCHEMA.properties.topics.items.propertyOrdering) ===
    JSON.stringify(['title', ...ported.TOPIC_DETAIL_SECTIONS.map((s) => s.id)])
);

// ---------------------------------------------------------------------
// ③ 주제 추천 user 메시지
// ---------------------------------------------------------------------
console.log('\n[3] 주제 추천 user 메시지');

const USER = ported.buildTopicRecommendationUser({
  gradeLabel: '고1',
  semester: '1학기',
  schoolType: '자율형 사립고',
  subjectGroup: '국어',
  subject: '공통국어1',
  career: '의학',
  previousTopic: '',
  assessmentText: '<<GUIDE>>'
});

// 작업 지시 8조 + 블록 라벨 — 원문 그대로
for (const no of [186, 193, 196, 197, 198, 199, 200, 201, 202, 203, 204]) {
  const line = sourceLine(SOURCE_FILES.recommendTopics, no);
  check(
    `원문 유지 :${no}  ${line.slice(0, 34)}…`,
    USER.split('\n').includes(line),
    `누락: ${JSON.stringify(line)}`
  );
}

// 보간 줄은 라벨 접두어까지가 원문 계약이다
for (const no of [187, 189, 190, 191]) {
  const prefix = sourceLine(SOURCE_FILES.recommendTopics, no).split('${')[0];
  check(
    `필드 라벨 원문 :${no}  ${prefix.trim()}`,
    USER.split('\n').some((line) => line.startsWith(prefix)),
    `누락 접두어: ${JSON.stringify(prefix)}`
  );
}

check(
  "학교 유형 하드코딩 '일반고'가 이식되지 않았다 (:188, §8.3 결정 ②)",
  !USER.includes('일반고') && !ported.buildTopicRecommendationUser({}).includes('일반고'),
  ported.buildTopicRecommendationUser({})
);

check(
  "값이 없으면 '미입력'을 렌더한다 (평가 프롬프트와 통일)",
  ported.buildTopicRecommendationUser({}).includes('- 학교 유형: 미입력')
);

check(
  "previousTopic 기본 리터럴 '없음'이 유지된다 (지시 2조가 의존)",
  ported.buildTopicRecommendationUser({}).includes(
    `- 같은 과목에서 이전에 한 주제: ${ported.NO_PREVIOUS_TOPIC_TEXT}`
  ) && ported.NO_PREVIOUS_TOPIC_TEXT === '없음'
);

// ---------------------------------------------------------------------
// ④ RAG 직렬화 — 문자 단위 원문 (§12.3)
// ---------------------------------------------------------------------
console.log('\n[4] RAG 질의문·직렬화 원문');

const knowledgeSource = read(path.join(REPO_ROOT, 'api/_lib/performance/knowledge.js'));

// 위닝DB 경로: 질의문 6줄(:227-234) + rowToText 본문(:154-164) + 라벨 2종(:255-257)
const KNOWLEDGE_SNIPPETS = [
  { label: '벡터 질의문 6줄 + 안내문 2500자 절단', from: 228, to: 233 },
  { label: 'rowToText 템플릿', from: 155, to: 163 },
  { label: '유사도 줄 포맷', from: 151, to: 151 },
  { label: '검색 라벨 2종', from: 255, to: 257 },
  { label: '레거시 과목 후보 조립', from: 282, to: 289 },
  { label: '레거시 키워드 조립', from: 291, to: 297 }
];

for (const { label, from, to } of KNOWLEDGE_SNIPPETS) {
  const snippet = sourceLineRange(SOURCE_FILES.dynamicKnowledge, from, to).join('\n');
  check(
    `${label} (dynamic-knowledge.js:${from}-${to})`,
    knowledgeSource.includes(snippet),
    `원문 조각이 knowledge.js 에 없음:\n${snippet}`
  );
}

check(
  'threshold 상수 = 원문 튜닝값 (topic 0.50 / resource 0.48 / 과거 수행 0.48)',
  [
    ['TOPIC_MATCH_THRESHOLD', 0.5],
    ['RESOURCE_MATCH_THRESHOLD', 0.48],
    ['STUDENT_HISTORY_MATCH_THRESHOLD', 0.48]
  ].every(([name, value]) => {
    const re = new RegExp(`export const ${name} = ([0-9.]+);`);
    return Number(knowledgeSource.match(re)?.[1]) === value;
  })
);

check(
  'match_count = max(maxItems * 2, 10) 유지',
  knowledgeSource.includes('match_count: Math.max(maxItems * 2, 10)')
);

check(
  'maxChars 상한 = topic 4500 / resource 8000',
  /TOPIC_MAX_CHARS = 4500/.test(knowledgeSource) && /RESOURCE_MAX_CHARS = 8000/.test(knowledgeSource)
);

check(
  'packRows break 동작 유지 (상한 초과 시 이후 조각 버림)',
  knowledgeSource.includes('if (total + piece.length > maxChars) break;')
);

// 학생 과거 수행 경로: 질의문 5줄(:174-180, 2000자 절단) + 포맷(:227-234)
const REPORT_SNIPPETS = [
  { label: '과거 수행 질의문 5줄 + 2000자 절단', from: 175, to: 179 },
  { label: '과거 수행 프롬프트 포맷 라벨', from: 228, to: 230 }
];

for (const { label, from, to } of REPORT_SNIPPETS) {
  const snippet = sourceLineRange(SOURCE_FILES.reports, from, to).join('\n');
  check(
    `${label} (reports.js:${from}-${to})`,
    knowledgeSource.includes(snippet),
    `원문 조각이 knowledge.js 에 없음:\n${snippet}`
  );
}

check(
  '과거 수행 없음 문구 원문 유지',
  ported.NO_STUDENT_HISTORY_TEXT === '관련 학생 과거 수행 기록 없음' &&
    ported.NO_KNOWLEDGE_TEXT === '관련 위닝DB 항목 없음'
);

check(
  'compactText 900자 절단 유지',
  knowledgeSource.includes('compactText(r.summary_text, 900)')
);

// ---------------------------------------------------------------------
// ⑤ 설계 리포트 system 프롬프트 — 16원칙 + 6섹션 뼈대 (§12.1)
// ---------------------------------------------------------------------
console.log('\n[5] 설계 리포트 system 프롬프트 (§12.1 설계 리포트 행)');

const FR = SOURCE_FILES.findResources;

const designArgs = {
  structureType: '기본 보고서형',
  structureReason: '<<REASON>>',
  writingFrame: '<<FRAME>>',
  resourceKnowledgeText: '<<RESOURCE_RAG>>',
  allowedResources: [{ id: 'R1', title: '자료 하나' }],
  studentHistoryText: '<<HISTORY>>'
};

const DESIGN_V2 = ported.buildDesignReportSystem({
  ...designArgs,
  promptVersion: ported.DESIGN_PROMPT_VERSIONS.WITH_CORE
});
const DESIGN_V1 = ported.buildDesignReportSystem({
  ...designArgs,
  promptVersion: ported.DESIGN_PROMPT_VERSIONS.WITHOUT_CORE
});
const designV2Lines = DESIGN_V2.split('\n');

// ⓐ 원문 그대로 유지해야 하는 행 (find-resources.js 1-based 행번호)
//    405 `- 우선 작성 틀:` 까지 포함. 보간 줄(403/404/406/409/412/417)은 접두어로 따로 본다.
const RETAINED_DESIGN_LINES = [
  378,                                     // 역할 1줄
  380, 381, 382,                           // 목표 3줄
  384,                                     // `중요 원칙:`
  385, 386, 387, 388, 389, 390, 391, 392,  // 16원칙 1~8
  393, 394, 395, 396, 397, 398, 399, 400,  // 16원칙 9~16 (398 = 마크다운 금지)
  402, 405,                                // [안내문 구조 판정] 라벨
  408,                                     // [홈페이지 위닝 수행 자료 DB]
  411,                                     // [사용 허용 자료명 목록]  ← 헤더는 원문 유지
  416,                                     // [학생 과거 수행 RAG]
  419, 421,                                // `출력 방식:` + 형식 분기 지시
  424, 425, 426, 427,                      // 최종 주제 하위 키
  430, 431,                                // 추천 자료 항목 설명 2줄
  434, 435, 436, 437,                      // 안내문 요구 형식 분석 하위 키
  440, 441, 442, 443,                      // 수행평가 전체 방향 하위 키
  486, 487, 488, 489, 490                  // 체크리스트 하위 키
];

for (const no of RETAINED_DESIGN_LINES) {
  const line = sourceLine(FR, no);
  check(
    `원문 유지 :${no}  ${line.slice(0, 34)}…`,
    designV2Lines.includes(line),
    `누락된 원문 줄: ${JSON.stringify(line)}`
  );
}

// 보간 줄은 라벨 접두어까지가 원문 계약이다
for (const no of [403, 404]) {
  const prefix = sourceLine(FR, no).split('${')[0];
  check(
    `필드 라벨 원문 :${no}  ${prefix.trim()}`,
    designV2Lines.some((line) => line.startsWith(prefix)),
    `누락 접두어: ${JSON.stringify(prefix)}`
  );
}

check(
  '마크다운 금지 조항(16원칙 14)이 살아 있다 (§12.1 명시 — 폐기 금지)',
  DESIGN_V2.includes(sourceLine(FR, 398))
);

check(
  '빈 값 문구 원문 유지 (:409 / :357)',
  ported.NO_RESOURCE_KNOWLEDGE_TEXT === '사용 가능한 내부 자료 없음' &&
    ported.NO_ALLOWED_RESOURCE_TEXT === '없음' &&
    ported.buildAllowedResourceList([]) === '없음'
);

// ⓑ-1 `[사용 허용 자료명 목록]`의 값이 자료명 나열이 아니라 id 목록이다(Q63)
check(
  'ⓑ-1 사용 허용 자료 목록이 `id | 자료명` 형태다 (Q63)',
  ported.buildAllowedResourceList([{ id: 'R1', title: '자료 하나' }]) === '- R1 | 자료 하나' &&
    DESIGN_V2.includes('- R1 | 자료 하나')
);

// ⓑ-2 `:414` 주의 문장 — 옛 문장 부재 / 새 문장 존재
const CAUTION_414_NEW =
  "주의: chosen_resources 필드에는 위 [사용 허용 자료명 목록]에 있는 자료 id만 쓸 수 있다. 목록이 '없음'이면 id를 만들지 말고 chosen_resources를 빈 배열로 두며, 학생용 표현으로 자료 확인이 필요하다고만 정리하라. 학생에게 보이는 출력에는 DB, 내부 자료, RAG, 검증 자료 부족이라는 표현을 쓰지 마라.";

check('ⓑ-2 문구 교체 :414 — 옛 문장 부재', !DESIGN_V2.includes(sourceLine(FR, 414)));
check('ⓑ-2 문구 교체 :414 — 새 문장 존재', designV2Lines.includes(CAUTION_414_NEW));
check(
  'ⓑ-2 뒷문장(시스템 내부 표현 금지)은 원문 그대로 남았다',
  CAUTION_414_NEW.endsWith(
    '학생에게 보이는 출력에는 DB, 내부 자료, RAG, 검증 자료 부족이라는 표현을 쓰지 마라.'
  ) && sourceLine(FR, 414).endsWith(
    '학생에게 보이는 출력에는 DB, 내부 자료, RAG, 검증 자료 부족이라는 표현을 쓰지 마라.'
  )
);

// ⓒ 스키마로 대체해 삭제한 것
check(
  '스키마 대체 :420 — 번호 뼈대 참조 줄이 제거됐다',
  !DESIGN_V2.includes(sourceLine(FR, 420).trim())
);
check(
  '스키마 대체 :446 — 분기 선택 지시가 제거됐다 (분기 1개만 주입)',
  !DESIGN_V2.includes(sourceLine(FR, 446).trim())
);

// 섹션 제목 6줄: 번호 접두어만 빠지고 문자열은 그대로여야 한다
const SECTION_TITLE_LINES = [423, 429, 433, 439, 445, 485];

SECTION_TITLE_LINES.forEach((no, index) => {
  const original = sourceLine(FR, no);
  const title = original.replace(/^\d+\.\s*/, '');

  check(
    `섹션 제목 :${no} — 번호 제거 + 문자열 유지  ${title}`,
    designV2Lines.includes(title) && !DESIGN_V2.includes(original),
    `원본 ${JSON.stringify(original)} / 기대 ${JSON.stringify(title)}`
  );

  check(
    `섹션 제목 :${no} = DESIGN_REPORT_SECTIONS[${index}].label`,
    ported.DESIGN_REPORT_SECTIONS[index].label === title
  );
});

// 형식별 3분기 — 원문 바이트 일치 + 판정 결과 분기만 주입(§12.1)
const BRANCH_RANGES = [
  { key: 'question', from: 448, to: 461 },
  { key: 'report', from: 463, to: 479 },
  { key: 'other', from: 481, to: 483 }
];

for (const { key, from, to } of BRANCH_RANGES) {
  const original = Buffer.from(sourceLineRange(FR, from, to).join('\n').trim(), 'utf8');
  const mine = Buffer.from(ported.DESIGN_WRITING_BRANCHES[key], 'utf8');

  check(
    `작성 구조 분기 ${key} byte-equal (:${from}-${to}, ${original.length} bytes)`,
    original.equals(mine),
    `원본 ${original.length}B / 이식본 ${mine.length}B`
  );
}

check(
  '보고서형 판정 → report 분기만 주입된다',
  DESIGN_V2.includes(ported.DESIGN_WRITING_BRANCHES.report) &&
    !DESIGN_V2.includes(ported.DESIGN_WRITING_BRANCHES.question) &&
    !DESIGN_V2.includes(ported.DESIGN_WRITING_BRANCHES.other)
);

const DESIGN_QUESTION = ported.buildDesignReportSystem({
  ...designArgs,
  structureType: '문항별 답변형'
});

check(
  '문항별 답변형 판정 → question 분기만 주입된다',
  DESIGN_QUESTION.includes(ported.DESIGN_WRITING_BRANCHES.question) &&
    !DESIGN_QUESTION.includes(ported.DESIGN_WRITING_BRANCHES.report)
);

// 분기 매핑 키는 inferAssessmentStructure(:241-299)의 type 리터럴 그대로
for (const no of [248, 256, 264, 272, 280, 288, 295]) {
  const type = sourceLine(FR, no).match(/type: '(.+)'/)?.[1];

  check(
    `구조 판정 유형 원문 :${no}  ${type}`,
    Boolean(type) &&
      Object.prototype.hasOwnProperty.call(ported.DESIGN_WRITING_BRANCH_BY_STRUCTURE_TYPE, type)
  );
}

// ---------------------------------------------------------------------
// ⑥ CORE_PRINCIPLES 주입 A/B (§11 Q83, 명세 L1620)
// ---------------------------------------------------------------------
console.log('\n[6] 설계 리포트 A/B 배선 (design-v1 / design-v2)');

check(
  'v2 = CORE_PRINCIPLES + 연결 문장 + v1 (단일 변수 비교)',
  DESIGN_V2.endsWith(DESIGN_V1) &&
    DESIGN_V2.startsWith(ported.CORE_PRINCIPLES) &&
    DESIGN_V2.includes(ported.CORE_PRINCIPLES_DESIGN_BRIDGE)
);

check(
  'v1은 CORE_PRINCIPLES 미주입 = 외부 동작 재현 (외부 원문에도 없다)',
  !DESIGN_V1.includes('[AI 수행평가 코치 핵심 원칙]') &&
    !DESIGN_V1.includes(ported.CORE_PRINCIPLES_DESIGN_BRIDGE) &&
    !read(FR).includes('CORE_PRINCIPLES')
);

check(
  '연결 문장이 충돌 3건 + 우선순위를 모두 다룬다',
  ['다시 선정하거나 바꾸지 않는다', '그대로 쓰지 않는다', '중요 원칙 8~13', '아래 중요 원칙을 따른다']
    .every((fragment) => ported.CORE_PRINCIPLES_DESIGN_BRIDGE.includes(fragment))
);

check(
  '기본값이 design-v2(주입) 고정이다',
  ported.DESIGN_PROMPT_VERSION_DEFAULT === 'design-v2' &&
    ported.buildDesignReportSystem(designArgs).startsWith(ported.CORE_PRINCIPLES)
);

check(
  '버전 스위치는 서버 환경변수 한 곳뿐이고, 알 수 없는 값은 v2로 떨어진다',
  ported.resolveDesignPromptVersion({}) === 'design-v2' &&
    ported.resolveDesignPromptVersion({ PERFORMANCE_DESIGN_PROMPT_VERSION: '' }) === 'design-v2' &&
    ported.resolveDesignPromptVersion({ PERFORMANCE_DESIGN_PROMPT_VERSION: 'design-v3' }) === 'design-v2' &&
    ported.resolveDesignPromptVersion({ PERFORMANCE_DESIGN_PROMPT_VERSION: 'DESIGN-V1' }) === 'design-v2' &&
    ported.resolveDesignPromptVersion({ PERFORMANCE_DESIGN_PROMPT_VERSION: ' design-v1 ' }) === 'design-v1'
);

check(
  '알 수 없는 promptVersion도 주입본으로 떨어진다 (스위치 오설정이 v1을 켜지 않는다)',
  ported.buildDesignReportSystem({ ...designArgs, promptVersion: 'design-v9' }).startsWith(ported.CORE_PRINCIPLES)
);

check(
  'resolveDesignPromptVersion은 요청 객체를 받지 않는다 (클라이언트 지정 불가)',
  ported.resolveDesignPromptVersion.length <= 1
);

// ---------------------------------------------------------------------
// ⑦ 설계 리포트 user 메시지
// ---------------------------------------------------------------------
console.log('\n[7] 설계 리포트 user 메시지');

const DESIGN_USER = ported.buildDesignReportUser({
  selectedTopic: '<<TOPIC>>',
  selectedTopicDetail: '<<DETAIL>>',
  gradeLabel: '고2',
  semester: '1학기',
  schoolType: '자율형 사립고',
  subjectGroup: '과학',
  subject: '고급 생명과학',
  career: '의학',
  assessmentText: '<<GUIDE>>'
});
const DESIGN_USER_EMPTY = ported.buildDesignReportUser({});

// 블록 라벨 + 작업 지시 4줄 — 원문 그대로
for (const no of [494, 497, 500, 507, 510, 511, 512, 513, 514]) {
  const line = sourceLine(FR, no);
  check(
    `원문 유지 :${no}  ${line.slice(0, 34)}…`,
    DESIGN_USER.split('\n').includes(line),
    `누락: ${JSON.stringify(line)}`
  );
}

for (const no of [501, 502, 503, 504, 505]) {
  const prefix = sourceLine(FR, no).split('${')[0];
  check(
    `필드 라벨 원문 :${no}  ${prefix.trim()}`,
    DESIGN_USER.split('\n').some((line) => line.startsWith(prefix)),
    `누락 접두어: ${JSON.stringify(prefix)}`
  );
}

check(
  "하드코딩 폴백 3종('고등학생'/'일반고'/'국어')이 이식되지 않았다 (:339-341)",
  !['고등학생', '일반고', '국어'].some((literal) => DESIGN_USER_EMPTY.includes(literal)),
  DESIGN_USER_EMPTY
);

check(
  "값이 없으면 '미입력'을 렌더한다",
  DESIGN_USER_EMPTY.includes('- 학교 유형: 미입력') &&
    DESIGN_USER_EMPTY.includes('- 학년/학기: 미입력') &&
    DESIGN_USER_EMPTY.includes('- 선택 과목: 미입력')
);

check(
  "원문 리터럴 '없음'/'안내문 정보 없음'이 유지된다 (:498, :505, :508)",
  DESIGN_USER_EMPTY.includes('- 이전 주제: 없음') &&
    DESIGN_USER_EMPTY.includes('[선택 주제 상세]\n없음') &&
    DESIGN_USER_EMPTY.includes('[수행평가 안내문 요약]\n안내문 정보 없음')
);

// ---------------------------------------------------------------------
// ⑧ 설계 리포트 스키마·상수 (§8.4 완화책 ⓐ / §8.5 / §5.13)
// ---------------------------------------------------------------------
console.log('\n[8] 설계 리포트 responseSchema · 섹션 상수');

check(
  'number 타입 필드가 하나도 없다 (§8.4 완화책 ⓐ)',
  !JSON.stringify(ported.DESIGN_REPORT_SCHEMA).includes('"number"') &&
    !JSON.stringify(ported.DESIGN_REPORT_SCHEMA).includes('"integer"')
);

check(
  '섹션 순서·라벨 = 시안 3754:4722 실측 (§5.13)',
  JSON.stringify(ported.DESIGN_REPORT_SECTIONS.map((section) => section.label)) ===
    JSON.stringify([
      '최종 주제',
      '추천 자료 및 활용 포인트',
      '안내문 요구 형식 분석',
      '수행평가 전체 방향',
      '작성 구조 설계',
      '학생 작성 체크리스트'
    ])
);

check(
  '추천 자료 섹션만 서버 조립이고 모델 스키마에 없다 (:430 원문 선언)',
  ported.DESIGN_REPORT_SECTIONS.filter((section) => section.authoredBy === 'server')
    .map((section) => section.id)
    .join() === 'recommended_resources' &&
    !Object.prototype.hasOwnProperty.call(
      ported.DESIGN_REPORT_SCHEMA.properties,
      'recommended_resources'
    )
);

check(
  '모델 작성 섹션 5종이 스키마 required와 1:1이다',
  JSON.stringify(
    ported.DESIGN_REPORT_SECTIONS.filter((section) => section.authoredBy === 'model').map(
      (section) => section.id
    )
  ) ===
    JSON.stringify(ported.DESIGN_REPORT_SCHEMA.required.filter((key) => key !== 'chosen_resources'))
);

check(
  '체크리스트 5건 고정 (:486-490) / chosen_resources 최대 3건 (§8.4)',
  ported.DESIGN_REPORT_SCHEMA.properties.checklist.minItems === 5 &&
    ported.DESIGN_REPORT_SCHEMA.properties.checklist.maxItems === 5 &&
    ported.DESIGN_REPORT_SCHEMA.properties.chosen_resources.maxItems === 3
);

// 섹션 행 라벨 = 원문 하위 키 줄(`- 라벨:`)에서 뽑은 문자열
const ROW_LABEL_RANGES = [
  { id: 'final_topic', from: 424, to: 427 },
  { id: 'required_format', from: 434, to: 437 },
  { id: 'overall_direction', from: 440, to: 443 }
];

for (const { id, from, to } of ROW_LABEL_RANGES) {
  const original = sourceLineRange(FR, from, to).map((line) =>
    line.replace(/^-\s*/, '').replace(/:$/, '')
  );

  check(
    `행 라벨 원문 ${id} (:${from}-${to})`,
    JSON.stringify(ported.DESIGN_SECTION_ROW_LABELS[id].map((row) => row.label)) ===
      JSON.stringify(original),
    `원본 ${JSON.stringify(original)}`
  );
}

// 자료 카드 6필드 + 0건 폴백 3줄 + 필드 기본 문구 (§12.1)
check(
  '자료 카드 필드 6종 라벨 = 시안 §5.13 / 원문 :166-171',
  JSON.stringify(ported.DESIGN_RESOURCE_CARD_FIELDS.map((field) => field.label)) ===
    JSON.stringify(['자료명', '출처 정보', '출처 링크', '핵심 개념', '활용 포인트', '작성 시 주의'])
);

const emptyResourceSource = sourceLineRange(FR, 155, 157).join('\n');

check(
  '자료 0건 폴백 3줄 원문 유지 (:155-157)',
  ported.DESIGN_EMPTY_RESOURCE_ROWS.every((row) =>
    emptyResourceSource.includes(`- ${row.label}: ${row.content}`)
  ),
  emptyResourceSource
);

const resourceFallbackSource = sourceLineRange(FR, 167, 171).join('\n');

check(
  '자료 카드 필드 기본 문구 원문 유지 (:167-171)',
  Object.values(ported.DESIGN_RESOURCE_FIELD_FALLBACKS).every((value) =>
    resourceFallbackSource.includes(value)
  ),
  Object.values(ported.DESIGN_RESOURCE_FIELD_FALLBACKS)
    .filter((value) => !resourceFallbackSource.includes(value))
    .join(' / ')
);

// 마무리(결론) 기본 문구 4줄 — 문구는 원문, 번호 접두어 `7.`은 제거(§12.1)
const conclusionSource = sourceLineRange(FR, 25, 28).join('\n');

check(
  '마무리 기본 문구 4줄 원문 유지 (:25-28)',
  ported.DESIGN_CONCLUSION_DEFAULT_ROWS.every((row) =>
    conclusionSource.includes(`- ${row.label}: ${row.content}`)
  ),
  conclusionSource
);

check(
  "마무리 문구에서 번호 접두어 '7.'이 제거됐다 (6섹션 구조와 충돌)",
  !JSON.stringify(ported.DESIGN_CONCLUSION_DEFAULT_ROWS).includes('7.') &&
    !JSON.stringify(ported.DESIGN_CONCLUSION_DEFAULT_ROWS).includes('마무리 구성 방향')
);

check(
  '생성 파라미터 temperature는 원문 0.25 그대로 (:519)',
  ported.DESIGN_GENERATION_DEFAULTS.temperature === 0.25 &&
    sourceLine(FR, 519).includes('temperature: 0.25')
);

check(
  'maxOutputTokens는 원문 5200에서 상향됐다 (§12.3 실측 재조정 + JSON 오버헤드)',
  sourceLine(FR, 518).includes('maxOutputTokens: 5200') &&
    ported.DESIGN_GENERATION_DEFAULTS.maxOutputTokens > 5200 &&
    ported.DESIGN_MAX_OUTPUT_TOKENS_RETRY > ported.DESIGN_GENERATION_DEFAULTS.maxOutputTokens
);

// ---------------------------------------------------------------------
console.log('');

if (failures.length) {
  console.error(`✗ ${failures.length}건 불일치\n`);
  failures.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
}

console.log('✓ 프롬프트·RAG 원문 대조 통과');
