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
  reports: path.join(SOURCE_DIR, 'api/_lib/reports.js')
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
console.log('');

if (failures.length) {
  console.error(`✗ ${failures.length}건 불일치\n`);
  failures.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
}

console.log('✓ 프롬프트·RAG 원문 대조 통과');
