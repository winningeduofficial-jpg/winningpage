// =====================================================================
// 대입모집요강 HTML 골든 스냅샷 생성 스크립트
//
// 배경: 기존 scripts/verify-admission-html-snapshot.mjs는 git 히스토리
// (REFACTOR_COMMIT='8fc8fc3' + git show + 정규식 함수 추출)에 의존해
// rebase/squash에 취약하고, 이미 RED다(1253셀 중 853셀 일치 = 68.08%).
// 이 스크립트는 그 후계자용 "셀프 골든"을 만든다 — git 히스토리가 아니라
// HEAD(현재 코드)가 지금 만드는 출력 자체를 정본으로 고정한다.
//
// 코퍼스: src/data/admissionHwpSections.json 218개교 × 6카테고리(DB 아님,
// 재현 가능해야 하므로 번들 고정).
//
// 3개 경로 전부를 저장한다(설계 §7-B 근거):
//   - buildRawSectionHtml(raw, key, row, name)      — 공개 모달 경로
//   - buildHwpCategoryHtml(key, raw, row, name)      — 어드민 경로
//   - buildRecruitmentResultHtml(raw)                — recruitment_quota
//     표 파서(DP 휴리스틱) 경로. buildRawSectionHtml만 저장하면
//     recruitment_quota가 전부 <pre>로 빠져 buildRecruitmentHtml이 한
//     번도 실행되지 않으므로 별도로 커버한다(recruitment_quota 카테고리
//     한정, buildRecruitmentResultHtml 시그니처 자체가 그 카테고리 전용).
//
// 출력 2종(하이브리드 — 전문 9.19MB를 그대로 커밋하면 이후 골든을 갱신할
// 때마다 리뷰 불가능한 블롭 diff가 쌓이므로, "바이트 diff를 사람이 본다"는
// 가치는 로컬 캐시로 옮기고 커밋 대상은 해시만 남긴다):
//   1) tests/fixtures/admission-html-golden.json — 커밋 대상. 셀별
//      sha256 + 문자 길이(bytes)만. 길이는 공짜 단서라 해시와 함께 둔다.
//      빈 문자열 출력(raw 없음 등)은 저장하지 않는다 — 해시 비교 자체가
//      무의미하기 때문. 3경로 간 중복(예: hwpCategoryHtml이 상당수
//      rawSectionHtml과 동일)도 "생략=동일" 같은 암묵 규칙을 만들지
//      않기 위해 전부 개별로 기록한다.
//   2) .golden-cache/admission-html-golden.full.json — gitignore 대상
//      (워크트리 로컬 전용). 전문 그대로. scripts/verify-admission-doc-
//      equivalence.mjs가 mismatch 발생 시 사람이 읽을 실제 diff를
//      뽑아내는 데 쓴다. 없어도 게이트 판정 자체(해시 비교)는 동일하게
//      동작한다 — 디버깅 편의 전용.
//
// 전문 캐시가 사라졌는데(예: 워크트리 재생성) 과거 골든 커밋 시점의
// 전문이 필요하면:
//   git worktree add ../wp-golden-base <골든이 그린이던 커밋 SHA>
//   cd ../wp-golden-base && node scripts/build-admission-html-golden.mjs
// (또는 현재 워크트리에서 파서를 그 커밋으로 임시 되돌린 뒤 이 스크립트를
// 실행하고 결과만 챙긴 다음 원복해도 된다.)
//
// 재현성: 이 스크립트는 멱등이어야 한다(2회 실행 결과가 바이트 단위로
// 동일). 매 실행마다 생성 결과를 2회 계산해 직접 비교하고, 다르면 즉시
// throw한다 — 골든이 스스로 흔들리면 이후 모든 회귀 검증이 무의미해진다.
// 해시 골든에는 타임스탬프 등 비결정적 필드를 절대 넣지 않는다(넣는 순간
// 매 실행마다 커밋 대상 파일이 의미 없이 바뀐다).
//
// 사용법:
//   node scripts/build-admission-html-golden.mjs
//   node scripts/build-admission-html-golden.mjs --out <hash-json-path>
//   node scripts/build-admission-html-golden.mjs --full-out <full-json-path>
// =====================================================================

import { writeFile, stat, mkdir } from "node:fs/promises";
import { parseArgs } from "node:util";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";

import admissionHwpSections from "../src/data/admissionHwpSections.json" with {
  type: "json",
};
import {
  buildRawSectionHtml,
  buildHwpCategoryHtml,
  buildRecruitmentResultHtml,
  HWP_SECTION_HTML_KEYS,
  clean,
} from "../src/lib/admissionParsing.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const DEFAULT_HASH_OUT_PATH = path.join(
  REPO_ROOT,
  "tests/fixtures/admission-html-golden.json",
);
const DEFAULT_FULL_OUT_PATH = path.join(
  REPO_ROOT,
  ".golden-cache/admission-html-golden.full.json",
);
const CATEGORY_KEYS = Object.keys(HWP_SECTION_HTML_KEYS);
export const GOLDEN_PATHS = [
  "rawSectionHtml",
  "hwpCategoryHtml",
  "recruitmentResultHtml",
];

// 대학명 → 카테고리 → 경로 3단 중첩 객체 생성(전문, 로컬 캐시 전용).
export function buildGolden() {
  const golden = {};
  const universityNames = Object.keys(admissionHwpSections);

  universityNames.forEach((universityName) => {
    const row = admissionHwpSections[universityName];
    const perUniversity = {};

    CATEGORY_KEYS.forEach((key) => {
      const raw = clean(row[key]);
      const entry = {
        rawSectionHtml: buildRawSectionHtml(raw, key, row, universityName),
        hwpCategoryHtml: buildHwpCategoryHtml(key, raw, row, universityName),
      };
      if (key === "recruitment_quota") {
        entry.recruitmentResultHtml = buildRecruitmentResultHtml(raw);
      }
      perUniversity[key] = entry;
    });

    golden[universityName] = perUniversity;
  });

  return golden;
}

// scripts/verify-admission-doc-equivalence.mjs와 반드시 동일한 키 규칙을
// 써야 한다 — 둘 중 하나만 바뀌면 모든 셀이 "cell missing"으로 오탐한다.
export function buildCellKey(universityName, category, pathName) {
  return `${universityName}|${category}|${pathName}`;
}

export function hashString(value) {
  return createHash("sha256")
    .update(String(value ?? ""), "utf-8")
    .digest("hex");
}

// 전문(buildGolden 결과) → 커밋 대상 해시 골든. 빈 문자열 출력은 제외한다.
export function buildHashGolden(fullGolden) {
  const cells = {};
  let cellCount = 0;

  Object.entries(fullGolden).forEach(([universityName, perUniversity]) => {
    Object.entries(perUniversity).forEach(([category, paths]) => {
      Object.entries(paths).forEach(([pathName, html]) => {
        if (!html) return; // raw 없음 등으로 빈 출력 — 해시 비교 대상에서 제외
        const key = buildCellKey(universityName, category, pathName);
        cells[key] = {
          sha256: hashString(html),
          bytes: Buffer.byteLength(html, "utf-8"),
        };
        cellCount += 1;
      });
    });
  });

  return {
    meta: {
      generatedFrom: "src/data/admissionHwpSections.json",
      universityCount: Object.keys(fullGolden).length,
      cellCount,
      paths: GOLDEN_PATHS,
    },
    cells,
  };
}

function assertIdempotent() {
  const onceFull = JSON.stringify(buildGolden());
  const twiceFull = JSON.stringify(buildGolden());
  if (onceFull !== twiceFull) {
    throw new Error(
      "멱등성 위반(전문): 골든 생성 스크립트를 같은 프로세스 안에서 2회 실행한 결과가 다릅니다. " +
        "파서에 비결정적 요소(Date.now, Math.random, 객체 키 순서 불안정 등)가 없는지 확인하세요.",
    );
  }
  const onceHash = JSON.stringify(buildHashGolden(JSON.parse(onceFull)));
  const twiceHash = JSON.stringify(buildHashGolden(JSON.parse(twiceFull)));
  if (onceHash !== twiceHash) {
    throw new Error(
      "멱등성 위반(해시): 동일 전문에서 해시 골든이 2회 다르게 계산됩니다.",
    );
  }
}

async function writeJson(filePath, data) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
  const { size } = await stat(filePath);
  return size;
}

// parseArgs는 여기(main 안)에서만 호출한다 — 예전엔 파일 최상위에서 즉시
// 호출했는데, process.argv는 프로세스 전역이라 이 모듈을 import만 하는
// scripts/verify-admission-doc-equivalence.mjs 쪽 호출자가 이 모듈이 모르는
// 플래그(예: --dry-run)를 쓰면 import 시점에 그대로 throw했다(2026-08-06
// 사고: load-admission-content.mjs --dry-run이 이 때문에 죽었고, 그걸
// 플래그 없이 재실행하다 실제 DB에 잘못된 값이 써졌다). main()은 이미
// isMainModule 가드로 직접 실행 때만 도는데, parseArgs만 가드 밖에
// 있었던 게 원인이었다 — 이제 이 함수 안으로 옮겨 같은 가드를 받는다.
async function main() {
  const { values: args } = parseArgs({
    options: {
      out: { type: "string" },
      "full-out": { type: "string" },
    },
  });

  console.log("=== 1) 멱등성 검증(같은 프로세스 내 2회 생성 비교) ===");
  assertIdempotent();
  console.log("통과: 전문·해시 골든 모두 2회 생성 결과가 동일합니다.");

  console.log("\n=== 2) 골든 생성 ===");
  const fullGolden = buildGolden();
  const hashGolden = buildHashGolden(fullGolden);
  console.log(
    `대상: ${hashGolden.meta.universityCount}개교 × ${CATEGORY_KEYS.length}카테고리, ` +
      `해시 골든 셀 수(빈 출력 제외): ${hashGolden.meta.cellCount}`,
  );

  const hashOutPath = args.out ? path.resolve(args.out) : DEFAULT_HASH_OUT_PATH;
  const fullOutPath = args["full-out"]
    ? path.resolve(args["full-out"])
    : DEFAULT_FULL_OUT_PATH;

  const hashSize = await writeJson(hashOutPath, hashGolden);
  const fullSize = await writeJson(fullOutPath, fullGolden);

  console.log("\n=== 3) 저장 완료 ===");
  console.log(
    `커밋 대상(해시): ${hashOutPath} — ${hashSize}bytes (${(hashSize / 1024).toFixed(1)}KB)`,
  );
  console.log(
    `로컬 전용(전문, gitignore): ${fullOutPath} — ${fullSize}bytes (${(fullSize / (1024 * 1024)).toFixed(2)}MB)`,
  );
}

const isMainModule =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
