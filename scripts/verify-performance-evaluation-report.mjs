// =====================================================================
// STEP5 평가 리포트 모달 + 분기 3버튼 회귀 검증
//   docs/수행평가-상세-명세.md §5.15(로딩) / §5.16(모달) / §5.17(분기) / §8.5(렌더 계약)
//
// 무엇을 막는가
// -------------
// ① **카드 1 + sections 7**(명세 L1787 단정)이 조용히 8섹션으로 돌아가는 것.
//    프롬프트 평가 형식은 8항목이지만 1번 `종합 평가 점수`는 `score`/`summary` 스칼라로
//    승격돼 `sections`에서 빠진다. 서버 상수(`EVALUATION_REPORT_SECTIONS`)를 직접 읽어
//    7종임을 고정하고, 모달이 그 7개 **앞에** 점수 카드 1개를 더해 8개 제목을 내는지 본다.
// ② 섹션 라벨·순서를 프론트가 다시 정하는 것. 라벨은 서버가 내려준 값을 그대로 써야 한다
//    (P8·P10과 같은 원칙) — 라벨을 바꿔 렌더해 그대로 나오는지로 증명한다.
// ③ §11-Q15 판정(푸터 버튼 조합)이 근거 없이 되돌아가는 것. `중간 저장`은 §5.14 제출폼의
//    버튼이라 열람 전용 모달에서 아무 일도 하지 않는다 — 없어야 한다.
// ④ 접근성 계약(dialog/aria-labelledby/스크롤 region/점수 낭독)이 빠지는 것.
// ⑤ §5.17 3버튼의 순서·위계(primary는 `추가 수행평가 진행하기` — 시안 실측이며 §11-Q16이
//    닫히기 전까지 임의로 뒤집지 않는다)와 확정 액션의 결과 고지(`aria-describedby`).
// ⑥ 제출폼 슬라이스와의 배선 계약(`handleSubmissionEvaluate` / `evaluationPhase === 'idle'`)이
//    병합 과정에서 사라지는 것.
// ⑦ 평가·확정 요청이 §8.6 계약을 벗어나는 것(제출 원고를 클라이언트가 다시 보내는 회귀).
//
// 어떻게 도는가
// -------------
// 실제 컴포넌트 파일을 esbuild로 번들해 `renderToStaticMarkup` 한다. 사본이 아니라
// 배포되는 소스를 직접 검사한다(scripts/verify-performance-sidebar-nav.mjs 관례).
// 모달은 `createPortal`을 쓰는데 **react-dom/server는 포털을 지원하지 않으므로**
// (`Portals are not currently supported by the server renderer`) esbuild 플러그인으로
// `react-dom`을 「children을 그 자리에 그대로 반환하는」 스텁으로 바꿔 넣는다. 포털의
// 목적(인쇄 시 앱 셸 분리)은 마크업 검사 대상이 아니라 안전하다.
//
//   node scripts/verify-performance-evaluation-report.mjs
//
// 제약은 다른 verify 스크립트와 동일: npm install 금지, jsdom 없음.
// =====================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as esbuild from 'esbuild';
import {
  EVALUATION_RECORD_SUMMARY_ROW_LABELS,
  EVALUATION_REPORT_SECTIONS,
  EVALUATION_SCORE_CARD_LABELS,
  EVALUATION_TRIAD_ROW_LABELS
} from '../api/_lib/performance/prompts.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// `ReportModalShell`이 `createPortal(…, document.body)`을 호출한다 — 컨테이너 인자 자체는
// 스텁 이후에도 평가되므로 최소 형태를 세워 둔다.
globalThis.document = globalThis.document || { body: { nodeType: 1 } };

const HARNESS = `
import React from 'react';
import EvaluationReportModal from './src/components/performance/step5/EvaluationReportModal.jsx';
import EvaluationBranchActions from './src/components/performance/step5/EvaluationBranchActions.jsx';

export function Modal(props) {
  return <EvaluationReportModal {...props} />;
}

export function Branch(props) {
  return <EvaluationBranchActions {...props} />;
}
`;

const PORTAL_STUB = {
  name: 'stub-react-dom-portal',
  setup(build) {
    build.onResolve({ filter: /^react-dom$/ }, () => ({
      path: 'react-dom-portal-stub',
      namespace: 'perf-stub'
    }));
    build.onLoad({ filter: /.*/, namespace: 'perf-stub' }, () => ({
      contents: 'export function createPortal(children) { return children; }',
      loader: 'js'
    }));
  }
};

async function loadHarness() {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const harnessPath = path.join(REPO_ROOT, `.tmp-perf-eval-harness-${stamp}.jsx`);
  const bundlePath = path.join(REPO_ROOT, `.tmp-perf-eval-bundle-${stamp}.mjs`);
  fs.writeFileSync(harnessPath, HARNESS);
  try {
    const result = await esbuild.build({
      entryPoints: [harnessPath],
      bundle: true,
      format: 'esm',
      jsx: 'automatic',
      jsxImportSource: 'react',
      platform: 'node',
      mainFields: ['module', 'main'],
      // react는 external로 남겨 스크립트와 같은 인스턴스를 쓰게 한다(엘리먼트 호환).
      external: ['react', 'react/jsx-runtime'],
      plugins: [PORTAL_STUB],
      write: false
    });
    fs.writeFileSync(bundlePath, result.outputFiles[0].text);
    return await import(`file://${bundlePath}`);
  } finally {
    fs.rmSync(harnessPath, { force: true });
    fs.rmSync(bundlePath, { force: true });
  }
}

const failures = [];
function check(condition, message) {
  if (!condition) failures.push(message);
}

const stripTags = (value) => value.replace(/<[^>]*>/g, '').trim();

function collect(html, tag) {
  const out = [];
  const re = new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)</${tag}>`, 'g');
  let m;
  while ((m = re.exec(html)) !== null) out.push({ attrs: m[1], text: stripTags(m[2]) });
  return out;
}

/** 서버가 실제로 내려주는 모양 그대로의 픽스처(`evaluate.js buildEvaluationSections`). */
function buildReport({ score = 86, summary = '총평 본문입니다.', labelOverride = null } = {}) {
  const sections = EVALUATION_REPORT_SECTIONS.map((section, index) => {
    const label = labelOverride && index === 0 ? labelOverride : section.label;

    if (section.kind === 'triad') {
      return {
        id: section.id,
        label,
        blocks: [
          {
            kind: 'keyValue',
            rows: EVALUATION_TRIAD_ROW_LABELS.map((row) => ({
              label: row.label,
              content: `${section.id}-${row.key} 값`
            }))
          }
        ]
      };
    }

    if (section.kind === 'note') {
      return { id: section.id, label, text: '특이사항 없음' };
    }

    return {
      id: section.id,
      label,
      blocks: [
        {
          kind: 'keyValue',
          rows: EVALUATION_RECORD_SUMMARY_ROW_LABELS.map((row) => ({
            label: row.label,
            content: `${row.key} 값`
          }))
        }
      ]
    };
  });

  return { id: 'report-1', score, summary, sections };
}

const { Modal, Branch } = await loadHarness();
const renderModal = (props) => renderToStaticMarkup(React.createElement(Modal, props));
const renderBranch = (props) => renderToStaticMarkup(React.createElement(Branch, props));

// ─────────────────────────────────────────────────────────────────────
// [1] §8.5 렌더 계약 — 서버 섹션 상수는 7종이다(8이 아니다).
// ─────────────────────────────────────────────────────────────────────
check(
  EVALUATION_REPORT_SECTIONS.length === 7,
  `§8.5 「카드 1 + sections 7」 위반: EVALUATION_REPORT_SECTIONS가 ${EVALUATION_REPORT_SECTIONS.length}개다`
);
check(
  EVALUATION_REPORT_SECTIONS.filter((s) => s.kind === 'triad').length === 5,
  '§8.5: 3분할(triad) 섹션은 2~6번 5개여야 한다 — 7·8번에 3분할을 강제하면 안 된다'
);

// ─────────────────────────────────────────────────────────────────────
// [2] 모달 본문 = 점수 카드 1 + 서버 섹션 7, **순서 그대로**.
// ─────────────────────────────────────────────────────────────────────
const baseHtml = renderModal({ open: true, report: buildReport(), topicTitle: '주제 제목' });
const headings = collect(baseHtml, 'h3').map((h) => h.text);

check(
  headings.length === 8,
  `모달 섹션 제목이 8개(점수 카드 1 + 섹션 7)여야 하는데 ${headings.length}개다: ${headings.join(' / ')}`
);
check(
  headings[0] === EVALUATION_SCORE_CARD_LABELS.score,
  `첫 제목은 승격된 점수 카드('${EVALUATION_SCORE_CARD_LABELS.score}')여야 하는데 '${headings[0]}'이다`
);
check(
  headings.slice(1).join('|') === EVALUATION_REPORT_SECTIONS.map((s) => s.label).join('|'),
  `섹션 제목 순서가 서버 상수와 다르다\n  기대: ${EVALUATION_REPORT_SECTIONS.map((s) => s.label).join(' / ')}\n  실제: ${headings.slice(1).join(' / ')}`
);
// 3분할 행 라벨(잘한 점/아쉬운 점/보완할 점)은 블록 뷰가 낸다 — 5개 섹션 × 3행.
for (const row of EVALUATION_TRIAD_ROW_LABELS) {
  const count = baseHtml.split(`<b>${row.label}</b>`).length - 1;
  check(count === 5, `3분할 행 '${row.label}'이 5개 섹션에 나와야 하는데 ${count}개다`);
}
for (const row of EVALUATION_RECORD_SUMMARY_ROW_LABELS) {
  check(baseHtml.includes(`<b>${row.label}</b>`), `누적 기록용 요약 행 '${row.label}'이 없다`);
}

// ─────────────────────────────────────────────────────────────────────
// [3] 승격된 점수 카드 — `86/100` 표기 + 낭독 보강 + `총평:`.
// ─────────────────────────────────────────────────────────────────────
check(baseHtml.includes('/100'), '점수 카드에 만점 표기(`/100`)가 없다(§5.16 `86/100`)');
check(baseHtml.includes('86'), '점수 값이 렌더되지 않았다');
check(
  baseHtml.includes('100점 만점에 86점'),
  '점수의 스크린리더 낭독 보강(`100점 만점에 86점`)이 없다 — `86/100`은 그대로 읽히지 않는다'
);
check(
  baseHtml.includes(`${EVALUATION_SCORE_CARD_LABELS.summary}:`),
  `총평 행 라벨('${EVALUATION_SCORE_CARD_LABELS.summary}:')이 없다`
);

// 점수를 못 읽은 경우: 점수 줄만 빠지고 총평은 남는다(0점으로 보정하지 않는다).
const noScoreHtml = renderModal({ open: true, report: buildReport({ score: null }) });
check(!noScoreHtml.includes('/100'), 'score가 없을 때 만점 표기가 남았다 — 없는 점수를 지어내면 안 된다');
check(
  noScoreHtml.includes(`${EVALUATION_SCORE_CARD_LABELS.summary}:`),
  'score가 없을 때 총평까지 사라졌다'
);

// ─────────────────────────────────────────────────────────────────────
// [4] 접근성 계약 — dialog / aria-labelledby / 스크롤 region.
// ─────────────────────────────────────────────────────────────────────
check(baseHtml.includes('role="dialog"'), 'role="dialog"가 없다');
check(baseHtml.includes('aria-modal="true"'), 'aria-modal="true"가 없다');

const labelledBy = baseHtml.match(/aria-labelledby="([^"]+)"/);
check(Boolean(labelledBy), 'aria-labelledby가 없다');
if (labelledBy) {
  check(
    new RegExp(`<h2[^>]*id="${labelledBy[1]}"`).test(baseHtml),
    'aria-labelledby가 가리키는 <h2> 제목이 없다 — 다이얼로그 접근 이름이 비어 있다'
  );
}
check(
  /role="region"[^>]*aria-label="평가 리포트 본문"|aria-label="평가 리포트 본문"[^>]*role="region"/.test(
    baseHtml
  ),
  '스크롤 영역의 role="region" + aria-label이 없다(P9 지적 재발 금지)'
);
check(
  /tabindex="0"/.test(baseHtml),
  '스크롤 영역에 tabIndex=0이 없다 — 키보드로 본문을 스크롤할 수 없다'
);

// ─────────────────────────────────────────────────────────────────────
// [5] §11-Q15 판정 — 푸터 버튼 조합.
// ─────────────────────────────────────────────────────────────────────
const footerButtons = collect(baseHtml, 'button');
const footerLabels = footerButtons.map((b) => b.text);
check(
  footerLabels.includes('다음 단계 선택하기'),
  `푸터 primary '다음 단계 선택하기'가 없다(§4 플로우 EvalReport --> NextChoice): ${footerLabels.join(' / ')}`
);
check(
  footerLabels.includes('PDF로 저장 / 인쇄'),
  '푸터 secondary `PDF로 저장 / 인쇄`가 없다(§5.16 겹친 CTA 원문)'
);
check(
  !footerLabels.includes('중간 저장'),
  '`중간 저장`은 §5.14 제출폼 버튼이다 — 열람 전용 모달에서 아무 일도 하지 않으므로 두지 않는다(§11-Q15 판정)'
);
check(
  !footerLabels.includes('저장 리포트 목록 가기'),
  '`저장 리포트 목록 가기`는 §5.18 목록 라우트가 생긴 뒤에 배선한다 — 지금은 갈 곳이 없다'
);
const nextButton = footerButtons.find((b) => b.text === '다음 단계 선택하기');
check(
  Boolean(nextButton) && /\bbg-primary\b/.test(nextButton.attrs),
  '`다음 단계 선택하기`가 primary(#013262, §11.1 Q5)로 렌더되지 않았다'
);

// ─────────────────────────────────────────────────────────────────────
// [6] 라벨·본문은 서버가 정한다 — 바꿔 넣으면 그대로 나온다.
// ─────────────────────────────────────────────────────────────────────
const OVERRIDE = 'ZZZ 라벨 검증용';
const overrideHtml = renderModal({
  open: true,
  report: buildReport({ labelOverride: OVERRIDE })
});
check(
  overrideHtml.includes(OVERRIDE),
  '서버가 내려준 섹션 라벨이 렌더되지 않았다 — 프론트가 라벨을 자체 상수로 덮어쓰고 있다'
);

// 본문이 없는 섹션은 통째로 빠진다(`getVisibleSections` 공유 판정).
const emptyHtml = renderModal({
  open: true,
  report: { score: 70, summary: '요약', sections: [{ id: 'x', label: '빈 섹션', text: '' }] }
});
check(!emptyHtml.includes('빈 섹션'), '본문이 빈 섹션이 라벨만 남은 채 렌더됐다');

// 닫힌 상태 / 리포트 없음 → 아무것도 렌더하지 않는다(무음 실패 방지 계약).
check(renderModal({ open: false, report: buildReport() }) === '', 'open=false인데 렌더됐다');
check(renderModal({ open: true, report: null }) === '', 'report=null인데 모달이 렌더됐다');

// ─────────────────────────────────────────────────────────────────────
// [7] §5.17 분기 3버튼 — 순서·위계·치수·잠금·결과 고지.
// ─────────────────────────────────────────────────────────────────────
const branchHtml = renderBranch({});
const branchButtons = collect(branchHtml, 'button');
const BRANCH_ORDER = ['추가 평가 받기', '이대로 확정짓기', '추가 수행평가 진행하기'];

check(
  branchButtons.map((b) => b.text).join('|') === BRANCH_ORDER.join('|'),
  `§5.17 버튼 순서가 다르다\n  기대: ${BRANCH_ORDER.join(' / ')}\n  실제: ${branchButtons.map((b) => b.text).join(' / ')}`
);
if (branchButtons.length === 3) {
  check(
    /\bbg-primary\b/.test(branchButtons[2].attrs),
    'primary는 `추가 수행평가 진행하기`다(§5.17 실측 + §11.1 Q5). §11-Q16이 닫히기 전까지 임의로 뒤집지 않는다'
  );
  check(
    !/\bbg-primary\b/.test(branchButtons[0].attrs) && !/\bbg-primary\b/.test(branchButtons[1].attrs),
    '`추가 평가 받기`/`이대로 확정짓기`는 secondary(stroke #d9d9d9)여야 한다'
  );
  for (const button of branchButtons) {
    check(
      /h-\[3\.25rem\]/.test(button.attrs) && /w-\[16\.25rem\]/.test(button.attrs),
      `§5.17 실측 16.25rem×3.25rem이 아닌 버튼이 있다: '${button.text}'`
    );
  }

  // 확정 2버튼은 결과를 미리 알린다(확인 다이얼로그는 §5.17에 없어 만들지 않았다).
  const describedBy = branchButtons.slice(1).map((b) => b.attrs.match(/aria-describedby="([^"]+)"/));
  check(
    describedBy.every(Boolean) && describedBy[0][1] === describedBy[1][1],
    '`이대로 확정짓기`/`추가 수행평가 진행하기` 두 확정 액션에 결과 고지(aria-describedby)가 걸려 있어야 한다'
  );
  if (describedBy.every(Boolean)) {
    check(
      new RegExp(`id="${describedBy[0][1]}"`).test(branchHtml),
      'aria-describedby가 가리키는 고지 문구가 실재하지 않는다'
    );
  }
}

// ⚠ 잠금 판정에 `/disabled/`를 쓰면 Tailwind의 `disabled:` variant 클래스에 걸려 항상
//   통과한다(무증상 무효 검사). 실제 boolean 속성 렌더 형태만 본다.
const isDisabled = (attrs) => /\sdisabled=""/.test(attrs || '');

// 확정 진행 중에는 세 버튼 모두 잠긴다(폼 복원이 끼어들어 서버와 어긋나는 것을 막는다).
const busyHtml = renderBranch({ busyAction: 'confirm' });
check(
  collect(busyHtml, 'button').every((b) => isDisabled(b.attrs)),
  'busyAction 중에 잠기지 않은 버튼이 있다'
);
check(/aria-busy="true"/.test(busyHtml), '진행 중인 액션에 aria-busy가 없다');

// 재평가 상한(§9.2) — 눌러서 409를 보게 하지 않고 미리 잠근다.
const limitedHtml = renderBranch({ reevaluateDisabled: true, reevaluateNote: '상한 안내' });
const limitedButtons = collect(limitedHtml, 'button');
check(
  isDisabled(limitedButtons[0]?.attrs),
  'reevaluateDisabled인데 `추가 평가 받기`가 잠기지 않았다'
);
check(
  !isDisabled(limitedButtons[2]?.attrs),
  '재평가 상한이 확정 버튼까지 잠갔다 — 상한과 확정은 다른 축이다'
);
check(limitedHtml.includes('상한 안내'), 'reevaluateNote가 렌더되지 않았다');

// ─────────────────────────────────────────────────────────────────────
// [8] 소스 계약 — API 요청 형태(§8.6)와 제출폼 슬라이스 배선 seam.
// ─────────────────────────────────────────────────────────────────────
/**
 * 「없어야 한다」 검사는 **주석을 걷어낸 코드**에서만 돈다. 폐기 사실을 설명하는 주석
 * (「외부 앱은 `confirm_submit` 플래그를 보냈고 …」)까지 위반으로 잡으면, 근거를 남기지
 * 못하게 만드는 검사가 된다. 줄 전체가 주석인 경우만 걷어 문자열 속 `//`은 건드리지 않는다.
 */
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

const libSource = fs.readFileSync(path.join(REPO_ROOT, 'src/lib/performance/evaluation.js'), 'utf8');
const libCode = stripComments(libSource);
check(
  libSource.includes("'/api/performance/evaluate'") &&
    libSource.includes("'/api/performance/finalize'"),
  'evaluation.js가 §8.6 두 엔드포인트를 부르지 않는다'
);
check(
  /\{\s*sessionId,\s*submissionId\s*\}/.test(libSource),
  'evaluate 요청 바디가 `{ sessionId, submissionId }`가 아니다 — 제출 원고를 클라이언트가 다시 보내면 안 된다(§8.6)'
);
check(
  // `fields`는 주석에서 서버 컬럼을 언급할 때도 나오므로 **요청 바디의 키 형태**만 본다.
  !/submission_text|confirm_submit|fields\s*:/.test(libCode),
  'evaluate 요청에 폐기된 필드(`submission_text`/`confirm_submit`/`fields`)가 되살아났다(§12.4)'
);
check(
  libSource.includes("'confirm'") && libSource.includes("'new_assessment'"),
  'finalize의 두 action이 모두 없다(§12.2 — 두 버튼 다 확정 저장이다)'
);

const pageSource = fs.readFileSync(
  path.join(REPO_ROOT, 'src/pages/performance/PerformanceChatPage.jsx'),
  'utf8'
);
check(
  pageSource.includes('function handleSubmissionEvaluate'),
  '제출폼 슬라이스의 진입점 `handleSubmissionEvaluate`가 사라졌다 — 폼이 평가를 시작할 길이 없다'
);
check(
  pageSource.includes('<EvaluationReportModal') && pageSource.includes('<EvaluationBranchActions'),
  '평가 리포트 모달·분기 3버튼이 페이지에 배선돼 있지 않다'
);
check(
  pageSource.includes('PERFORMANCE_LOADING_COPY.evaluationReport'),
  '§5.15 평가 로딩 문구가 `loadingCopy.js` 쌍에서 오지 않는다'
);
check(
  pageSource.includes('수행평가 제출물을 제출합니다.'),
  '§5.15 정본 타임라인 3항의 제출 말풍선 원문이 없다'
);
check(
  !/consume_performance_credit|charged:\s*true/.test(stripComments(pageSource)),
  '이 슬라이스에는 차감이 없다(§9.3/Q84) — 차감 흔적이 들어왔다'
);

// ─────────────────────────────────────────────────────────────────────
if (failures.length) {
  console.error(`\n❌ 평가 리포트 검증 실패 ${failures.length}건\n`);
  for (const message of failures) console.error(`  · ${message}`);
  process.exit(1);
}

console.log('✅ 평가 리포트 모달 + 분기 3버튼 검증 통과 (카드 1 + sections 7, §5.16/§5.17 계약)');
