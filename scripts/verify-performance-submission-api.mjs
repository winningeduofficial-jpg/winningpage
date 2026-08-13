// =====================================================================
// STEP5 제출·평가·확정 API 3종 계약 회귀 검증
//
//   node scripts/verify-performance-submission-api.mjs
//
// 무엇을 막는가
// -------------
// `api/performance/submission.js` / `evaluate.js` / `finalize.js`와 `sql/58`은
// 명세서 §8.6 엔드포인트 표 / §8.3 스키마 단정 / §9.3 회차 규칙 / §12.2·§12.4 이식
// 결정 위에 서 있다. 이 계약들은 **깨져도 코드가 그대로 돈다** — 차감 한 줄이 들어와도,
// 게이트 순서가 뒤집혀도, 에러 코드가 하나 사라져도 테스트 없이는 배포까지 간다.
// 그래서 다음 6가지를 기계로 못박는다.
//
//   ① 제출물 평문 조립 — 외부 `index.html:2246-2252` `buildSubmissionText`와
//                        **문자 단위 동일**(원본을 실제로 실행해 대조)
//   ② Q35 게이트       — 외부 결합 문자열은 통과하는 입력이 우리 게이트에서는 막히는가
//   ③ 차감 부재        — 3파일 + sql/58 어디에도 차감 경로가 없는가(§9.3, §12.4)
//   ④ 계약 코드 커버   — §8.6이 정의한 실패 코드가 각 파일에 실재하는가
//   ⑤ 실패 응답 형태   — `{error:{code,message}}`만 쓰고 외부식 `detail`/`error_message`가
//                        응답 본문에 실리지 않는가(§8.6 L1811)
//   ⑥ sql/58 불변식    — 부분 UNIQUE 3종 / rag_use 승격 2지점 / EXECUTE 회수 /
//                        멱등 분기(already_final · already_finalized_other)
//
// 원본이 없으면 ①②만 SKIP
// ------------------------
// 외부 앱은 이 저장소에 없는 로컬 경로다. 나머지 검사는 우리 저장소만 보므로 CI에서도
// 전부 돈다. 경로는 `SUHAENGPYEONG_DIR`로 덮어쓸 수 있다.
// =====================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_DIR = process.env.SUHAENGPYEONG_DIR || '/Users/hyunsoo/uwellnow/suhaengpyeong';
const SOURCE_HTML = path.join(SOURCE_DIR, 'index.html');

const read = (relative) => fs.readFileSync(path.join(REPO_ROOT, relative), 'utf8');

const SUBMISSION_API = read('api/performance/submission.js');
const EVALUATE_API = read('api/performance/evaluate.js');
const FINALIZE_API = read('api/performance/finalize.js');
const SQL58 = read('sql/58_performance_submission.sql');

const ported = await import(
  path.join(REPO_ROOT, 'api/_lib/performance/submission-schema.js')
);

const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    console.log(`  ok  ${name}`);
    return;
  }
  failures.push(detail ? `${name}\n      ${detail}` : name);
  console.log(`  FAIL ${name}`);
}

/** 주석·문자열 리터럴을 지운 코드 본문. "주석에 단어가 있으니 통과"를 막는다. */
function codeOnly(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')
    .replace(/`(?:\\.|[^`\\])*`/g, '``')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""');
}

const SUBMISSION_CODE = codeOnly(SUBMISSION_API);
const EVALUATE_CODE = codeOnly(EVALUATE_API);
const FINALIZE_CODE = codeOnly(FINALIZE_API);

/** `--` 주석을 지운 SQL 본문. 주석에서 원장·이용권을 **언급**하는 것은 정상이다. */
const SQL58_CODE = SQL58.replace(/^\s*--.*$/gm, ' ');

// ─────────────────────────────────────────────────────────────────────
// ① 제출물 평문 조립 — 원본 함수를 실제로 실행해 대조
// ─────────────────────────────────────────────────────────────────────
console.log('\n[1] buildSubmissionText 원문 대조 (index.html:2246-2252)');

let externalBuildSubmissionText = null;

if (!fs.existsSync(SOURCE_HTML)) {
  console.log(`  SKIP — 이식 원본 없음 (${SOURCE_DIR})`);
} else {
  const html = fs.readFileSync(SOURCE_HTML, 'utf8');
  const start = html.indexOf('function buildSubmissionText(');
  const end = html.indexOf('\n}\n', start);

  check('원본에 buildSubmissionText가 실재한다', start !== -1 && end !== -1);

  if (start !== -1 && end !== -1) {
    const src = html.slice(start, end + 2);
    // eslint-disable-next-line no-new-func
    externalBuildSubmissionText = new Function(`${src}\nreturn buildSubmissionText;`)();

    const fixtures = [
      {
        name: '기본 보고서형 3필드',
        topic: '의료 정보의 비판적 수용',
        schema: ported.defaultSubmissionSchema(),
        fields: { intro: '서론 본문', body: '본론 본문', conclusion: '결론 본문' }
      },
      {
        name: '문항형 6필드(값 일부 비움)',
        topic: '연잎 효과와 초발수 표면',
        // 원본 추출기의 행 앵커는 `질문 N:`이다(`guide-structure.js extractAnswerQuestions`).
        schema: ported.inferSubmissionSchema(
          '질문 1: 주제를 고른 이유는 무엇인가요?\n질문 2: 어떤 자료를 활용했나요?\n질문 3: 분석 결과는 무엇인가요?\n질문 4: 무엇을 느꼈나요?\n질문 5: 후속 탐구 방향은 무엇인가요?\n질문 6: 진로와 어떻게 연결되나요?'
        ),
        fields: { question_1: '가', question_3: '나' }
      },
      {
        name: '카드뉴스형 + 빈 주제',
        topic: '',
        schema: ported.inferSubmissionSchema('카드뉴스 4장을 제작한다.'),
        fields: { purpose: '제작 의도', card_plan: '', evidence: '근거', message: '메시지' }
      },
      {
        name: '값에 개행·공백이 섞인 경우',
        topic: '  띄어쓰기  주제  ',
        schema: ported.defaultSubmissionSchema(),
        fields: { intro: '한 줄\n\n두 줄  ', body: '   ', conclusion: '끝' }
      }
    ];

    for (const fixture of fixtures) {
      // 원본은 `rows`가 있는 필드 객체를 받지만 이 함수는 `label`/`key`만 읽는다 —
      // 그래서 이식본 스키마(rows 제거본)를 그대로 넣어도 원본이 같은 값을 낸다.
      const external = externalBuildSubmissionText(fixture.topic, fixture.schema, fixture.fields);
      const mine = ported.buildSubmissionText(fixture.topic, fixture.schema, fixture.fields);

      check(
        `조립 결과 동일 — ${fixture.name}`,
        Buffer.from(external, 'utf8').equals(Buffer.from(mine, 'utf8')),
        `external=${JSON.stringify(external)}\n      ported=${JSON.stringify(mine)}`
      );
    }

    check(
      '깨진 스키마도 기본 보고서형으로 축퇴한다(원본에 없던 방어)',
      ported.buildSubmissionText('주제', { fields: [] }, {}).includes('[제출 형식] 기본 보고서형')
    );
  }
}

// ─────────────────────────────────────────────────────────────────────
// ② Q35 — 외부 결합 문자열은 통과하지만 우리 게이트는 막는다
// ─────────────────────────────────────────────────────────────────────
console.log('\n[2] 100자 게이트가 재는 대상 (Q35, §12.2 L2373)');

if (!externalBuildSubmissionText) {
  console.log('  SKIP — 이식 원본 없음');
} else {
  // 「주제명만 붙여넣고 회차를 태우는 오용」 — 규정이 정확히 막으려던 케이스.
  const topic = '의료 정보의 비판적 수용: 건강기능식품 광고의 설득 전략 분석';

  // 문항형은 최대 20필드다(`index.html:2152`). 필드 수가 늘수록 라벨 뼈대만으로
  // 임계값을 넘으므로, 외부 계산식의 결함이 가장 선명하게 드러나는 형태다.
  const questionSchema = ported.inferSubmissionSchema(
    // 행 앵커는 `질문 N:`이고, 본문이 같으면 중복 제거된다(`extractAnswerQuestions`).
    Array.from({ length: 8 }, (_, i) => `질문 ${i + 1}: ${i + 1}번째로 확인할 내용은 무엇인가요?`).join('\n')
  );
  const thinFields = { question_1: '가', question_2: '나', question_3: '다' };

  const externalText = externalBuildSubmissionText(topic, questionSchema, thinFields);
  const externalLength = externalText.trim().length;
  const gate = ported.checkSubmissionMinLength(questionSchema, thinFields);

  check(
    '문항형 8필드 — 외부 계산식(결합 문자열)은 본문 3자로도 100자를 통과한다',
    questionSchema.fields.length === 8 && externalLength >= 100,
    `fields=${questionSchema.fields.length} externalLength=${externalLength}`
  );
  check(
    '문항형 8필드 — 우리 계산식(순수 본문 합)은 3자로 판정해 막는다',
    gate.total === 3 && gate.ok === false,
    `total=${gate.total} ok=${gate.ok}`
  );

  // 기본 보고서형(3필드)은 뼈대가 79자라 외부 계산식으로도 통과하지 못한다 —
  // 즉 외부의 결함은 "항상 통과"가 아니라 **필드 수·주제 길이에 따라 통과**다.
  // 이 값이 100을 넘도록 변하면(필드 추가 등) 위 문항형 검사와 같은 상태가 된다.
  const basicSchema = ported.defaultSubmissionSchema();
  const basicFields = { intro: '가', body: '나', conclusion: '다' };
  console.log(
    `  info 기본 보고서형 3필드 뼈대 길이(외부 계산식) = ${externalBuildSubmissionText(topic, basicSchema, basicFields).trim().length}자`
  );

  check(
    '서버가 조립한 평문에도 같은 결함 입력이 그대로 들어간다(조립≠측정 분리)',
    ported.buildSubmissionText(topic, questionSchema, thinFields) === externalText
  );
  check(
    '스키마 밖 키로는 게이트를 채울 수 없다',
    ported.checkSubmissionMinLength(basicSchema, {
      ...basicFields,
      junk: '라'.repeat(500)
    }).total === 3
  );
}

// ─────────────────────────────────────────────────────────────────────
// ③ 차감 부재 (§9.3 / §12.4 — 외부 evaluate-text.js:51 선차감 이식 금지)
// ─────────────────────────────────────────────────────────────────────
console.log('\n[3] 차감 코드 부재');

for (const [name, code] of [
  ['submission.js', SUBMISSION_CODE],
  ['evaluate.js', EVALUATE_CODE],
  ['finalize.js', FINALIZE_CODE]
]) {
  check(`${name} — consume_performance_credit 호출 없음`, !code.includes('consume_performance_credit'));
  check(`${name} — program_access write 없음`, !/program_access[\s\S]{0,80}update/i.test(code));
}

check(
  'evaluate.js — 원장은 읽기(select)만 한다',
  /performance_credit_ledger[\s\S]{0,120}\.select\(/.test(EVALUATE_API) &&
    !/from\('performance_credit_ledger'\)[\s\S]{0,120}\.(insert|update|upsert|delete)\(/.test(EVALUATE_API)
);
check(
  'sql/58 — 원장·이용권을 읽지도 쓰지도 않는다(주석 언급은 제외)',
  !SQL58_CODE.includes('performance_credit_ledger') && !SQL58_CODE.includes('program_access')
);
check(
  '3파일 모두 응답에 charged:false를 싣는다(§8.6 무차감 명시)',
  [SUBMISSION_API, EVALUATE_API, FINALIZE_API].filter((src) => src.includes('charged: false')).length >= 2 &&
    EVALUATE_API.includes('charged: false') &&
    FINALIZE_API.includes('charged: false')
);

// ─────────────────────────────────────────────────────────────────────
// ④ §8.6 계약 코드 커버리지
// ─────────────────────────────────────────────────────────────────────
console.log('\n[4] §8.6 엔드포인트 표 실패 코드');

const CONTRACT_CODES = {
  'submission.js': {
    source: SUBMISSION_API,
    codes: ['EMPTY_SUBMISSION', 'UNKNOWN_FIELD', 'SESSION_FINALIZED']
  },
  'evaluate.js': {
    source: EVALUATE_API,
    codes: ['SUBMISSION_TOO_SHORT', 'REQUIRED_FIELD_EMPTY', 'REEVALUATION_LIMIT', 'MODEL_FAILED']
  },
  'finalize.js': {
    source: FINALIZE_API,
    codes: ['NO_EVALUATION_YET', 'ALREADY_FINALIZED_OTHER']
  }
};

for (const [name, { source, codes }] of Object.entries(CONTRACT_CODES)) {
  for (const code of codes) {
    check(`${name} — ${code}`, source.includes(`'${code}'`));
  }
}

check(
  'evaluate.js — 요청에서 confirm_submit을 읽지 않는다(§8.6 폐기)',
  !EVALUATE_CODE.includes('confirm_submit')
);
check(
  'evaluate.js — 요청에서 fields/submission_text를 읽지 않는다(값은 DB에서 읽는다)',
  !/body\.(fields|submissionText|submission_text)/.test(EVALUATE_CODE)
);
check(
  'finalize.js — action 값은 confirm/new_assessment 2종뿐(외부 승계)',
  FINALIZE_API.includes("['confirm', 'new_assessment']")
);
check(
  'submission.js — mode는 draft/submit 2종',
  SUBMISSION_API.includes("body.mode === 'submit'") && SUBMISSION_API.includes("body.mode === 'draft'")
);

// ── 게이트 순서: 제출물 형식 게이트가 상한 게이트보다 **먼저** 와야 한다.
//    뒤집히면 100자 미달 요청이 재평가 슬롯을 태운다.
const idxTooShort = EVALUATE_API.indexOf("'SUBMISSION_TOO_SHORT'");
const idxLimit = EVALUATE_API.indexOf("'REEVALUATION_LIMIT'");
const idxAttempt = EVALUATE_API.indexOf('evaluation_attempt_count: attemptCount + 1');
check(
  'evaluate.js — 제출물 게이트 → 재평가 상한 → 시도 카운터 순서',
  idxTooShort > 0 && idxLimit > idxTooShort && idxAttempt > idxLimit,
  `tooShort=${idxTooShort} limit=${idxLimit} attempt=${idxAttempt}`
);

// ── 시도 카운터는 **낙관적 잠금(CAS)** 이어야 한다(검토 P11).
//    조건 없이 `attemptCount + 1`을 덮어쓰면 동시 요청 N건이 전부 같은 스냅샷을 읽고
//    같은 값을 써서 카운터가 1만 오른다 — 평가는 무차감이라(§9.3) 이 상한이 유일한
//    방어선인데 병렬성으로 통째로 무력화된다.
check(
  'evaluate.js — 시도 카운터가 읽은 값 조건부 update다(CAS)',
  /\.update\(\{ evaluation_attempt_count: attemptCount \+ 1 \}\)[\s\S]{0,200}\.eq\('evaluation_attempt_count', attemptCount\)/.test(
    EVALUATE_API
  )
);
check(
  'evaluate.js — CAS가 0행이면 모델을 부르지 않고 429로 끝낸다',
  /if \(!attemptRow\) \{[\s\S]{0,400}'EVALUATION_ATTEMPT_LIMIT'/.test(EVALUATE_API)
);

// ── draft 덮어쓰기는 **아직 초안인 행만** 대상으로 한다(검토 P11).
//    `is_draft` 조건이 없으면 뒤늦은 draft 저장이 이미 제출·채점된 원고를 덮어써
//    평가 리포트(점수)와 저장 원고가 서로 다른 글을 가리키게 된다.
check(
  'submission.js — updateRevision이 is_draft=true + is_final=false를 함께 본다',
  /\.eq\('is_draft', true\)[\s\S]{0,120}\.eq\('is_final', false\)/.test(SUBMISSION_API)
);

// ── 멱등 재생이 모델 호출보다 앞에 있어야 한다(더블클릭이 모델을 다시 부르면 안 된다).
const idxReplay = EVALUATE_API.indexOf('reused: true');
const idxModel = EVALUATE_API.indexOf('generateWithRetry(');
check(
  'evaluate.js — 멱등 재생이 모델 호출보다 먼저다',
  idxReplay > 0 && idxModel > idxReplay,
  `replay=${idxReplay} model=${idxModel}`
);

// ── Gemini 결함 완화 ⓐ~ⓓ (§8.4)
check('evaluate.js — MAX_TOKENS면 파싱하지 않고 재시도(ⓒ)', EVALUATE_API.includes("finishReason === 'MAX_TOKENS'"));
check('evaluate.js — responseSchema 강제', EVALUATE_API.includes('responseSchema: EVALUATION_REPORT_SCHEMA'));
check('evaluate.js — score는 서버가 파싱(ⓐ)', EVALUATE_API.includes('parseEvaluationScore'));
check('evaluate.js — maxDuration 60 선언', EVALUATE_API.includes("runtime: 'nodejs', maxDuration: 60"));
check(
  'evaluate.js — 텍스트 파서 폴백이 없다(JSON.parse 1곳뿐, §12.4)',
  (EVALUATE_CODE.match(/JSON\.parse\(/g) || []).length === 1
);
check(
  'evaluate.js — 평가 단계는 RAG를 부르지 않는다(원문 작업 지시 :151)',
  !EVALUATE_CODE.includes('loadDynamicAssessmentKnowledge') &&
    !EVALUATE_CODE.includes('loadRelevantStudentSessions')
);

// ─────────────────────────────────────────────────────────────────────
// ⑤ 실패 응답 형태 (§8.6 L1811)
// ─────────────────────────────────────────────────────────────────────
console.log('\n[5] 실패 응답에 원 예외 메시지를 싣지 않는다');

for (const [name, source, code] of [
  ['submission.js', SUBMISSION_API, SUBMISSION_CODE],
  ['evaluate.js', EVALUATE_API, EVALUATE_CODE],
  ['finalize.js', FINALIZE_API, FINALIZE_CODE]
]) {
  check(`${name} — error:{code,message} 형태`, source.includes('error: { code, message }'));
  check(`${name} — detail/error_message 키 없음`, !/\b(detail|error_message)\s*:/.test(code));
  check(
    `${name} — catch에서 error.message를 응답에 싣지 않는다`,
    !/return\s+fail\([^)]*error\.message/.test(code) && !/json\(\{[^}]*error\.message/.test(code)
  );
}

// ─────────────────────────────────────────────────────────────────────
// ⑥ sql/58 불변식
// ─────────────────────────────────────────────────────────────────────
console.log('\n[6] sql/58 스키마·RPC 불변식');

check(
  '세션당 evaluation 리포트 1행 부분 UNIQUE',
  /create unique index if not exists performance_reports_one_evaluation_per_session_idx[\s\S]{0,200}where \(report_type = 'evaluation'\)/.test(
    SQL58
  )
);
check(
  '세션당 final_submission 리포트 1행 부분 UNIQUE',
  /create unique index if not exists performance_reports_one_final_per_session_idx[\s\S]{0,200}where \(report_type = 'final_submission'\)/.test(
    SQL58
  )
);
check('performance_reports.submission_id 추가', SQL58.includes('add column if not exists submission_id uuid'));
check(
  '상한 2축 컬럼 추가',
  SQL58.includes('add column if not exists evaluation_count integer') &&
    SQL58.includes('add column if not exists evaluation_attempt_count integer')
);

// rag_use 승격이 **정확히 2지점**(평가 커밋 / 최종 확정)에만 있어야 한다.
const ragPromotions = SQL58.match(/set rag_use = true/g) || [];
check('rag_use 승격이 정확히 2지점', ragPromotions.length === 2, `count=${ragPromotions.length}`);
check(
  'rag_use 승격은 performance_session_vectors에만 건다',
  (SQL58.match(/update public\.performance_session_vectors/g) || []).length === 2
);

check(
  '평가 커밋 RPC가 is_final을 건드리지 않는다',
  !/commit_performance_evaluation_report[\s\S]*?\$function\$;/
    .exec(SQL58)?.[0]
    ?.includes('is_final = ')
);
check(
  'finalize RPC가 대상 행을 for update로 잠근다',
  /finalize_performance_submission[\s\S]*?for update/.test(SQL58)
);
// 대상 제출본만 잠그면 같은 세션의 **서로 다른** 제출본 2건이 동시에 확정을 시도할 때
// 잠금이 겹치지 않아 둘 다 "확정된 행 없음"으로 통과하고, 뒤늦은 쪽이 부분 UNIQUE 23505 →
// 호출부 500이 된다(`already_finalized_other` 분기가 성립하지 않는다, 검토 P11).
// 세션 행을 함께 잠가 세션 단위로 직렬화한다 — 순서는 반드시 **제출본 → 세션**이어야
// `commit_performance_evaluation_report`(제출본 update → 세션 update)와 교착하지 않는다.
// 파일 상단 목차·주석에도 함수 이름이 나오므로 `create or replace`에 앵커한다
// (앵커가 없으면 앞선 RPC의 본문을 잘라 보게 된다).
const FINALIZE_FN =
  /create or replace function public\.finalize_performance_submission[\s\S]*?\$function\$;/.exec(SQL58)?.[0] || '';
check(
  'finalize RPC가 세션 행도 for update로 잠근다(세션 단위 직렬화)',
  /from public\.performance_sessions s\s+where s\.id = p_session_id\s+for update/.test(FINALIZE_FN)
);
check(
  'finalize RPC의 잠금 순서가 제출본 → 세션이다(교착 방지)',
  FINALIZE_FN.indexOf('from public.performance_submissions sub') <
    FINALIZE_FN.indexOf('from public.performance_sessions s\n   where s.id = p_session_id\n     for update')
);
check(
  'finalize RPC 멱등 분기 3종',
  SQL58.includes("'already_final'") &&
    SQL58.includes("'already_finalized_other'") &&
    SQL58.includes("'no_evaluation'")
);
check(
  '같은 제출본 재확정은 finalize_reason을 덮어쓰지 않는다',
  /if v_is_final then[\s\S]{0,600}return jsonb_build_object\(\s*'status', 'already_final'/.test(SQL58)
);
check(
  '두 RPC 모두 EXECUTE를 회수하고 service_role에만 부여',
  (SQL58.match(/revoke all on function/g) || []).length === 6 &&
    (SQL58.match(/grant execute on function[\s\S]{0,200}to service_role;/g) || []).length === 2
);
check(
  '두 RPC 모두 security definer + search_path 고정',
  (SQL58_CODE.match(/security definer/g) || []).length === 2 &&
    (SQL58_CODE.match(/set search_path to 'public'/g) || []).length === 2
);
check(
  '오버로드 잔재 drop 가드 존재(42725 방어)',
  SQL58.includes("p.proname in (") && SQL58.includes('drop function if exists')
);

// 라우트가 select 하는 컬럼이 sql/58에 실재하는가 — 42703 배포 사고 방지.
for (const column of ['evaluation_count', 'evaluation_attempt_count']) {
  check(`evaluate.js가 select 하는 ${column}이 sql/58에 있다`, EVALUATE_API.includes(column) && SQL58.includes(column));
}
check(
  'sql/README.md에 58번 행이 있다',
  read('sql/README.md').includes('58_performance_submission.sql')
);

// ─────────────────────────────────────────────────────────────────────
console.log('');

if (failures.length) {
  console.error(`FAIL verify-performance-submission-api — ${failures.length}건\n`);
  failures.forEach((failure) => console.error(`  - ${failure}`));
  process.exit(1);
}

console.log('PASS verify-performance-submission-api — STEP5 API 3종 계약이 명세와 일치합니다.');
