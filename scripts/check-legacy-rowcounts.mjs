// =====================================================================
// P0/P17 레거시 이관 판정 — 외부(레거시) Supabase 실측 행 수 확인
//
//   node scripts/check-legacy-rowcounts.mjs
//
// 무엇을 확인하는가
// -----------------
// 수행평가 기능은 외부 앱(레거시, Supabase 프로젝트 ref `orwngbyiylchpzufwvej`)에서
// 이관 중이다. 이관할 실 데이터가 있는지가 P0/P17의 유일한 잔여 결정 항목이다.
// students / conversations / assessment_reports 3테이블의 count(*)와 Storage
// 전체 버킷 객체 수를 **읽기 전용**으로 조회한다 — 행 데이터 자체는 가져오지 않는다.
//
// 결과가 갈리는 두 갈래
// ----------------------
//   전부 0  → 결정 B 확정 가능(이관할 데이터 없음) — P17은 2h 원안으로 종결
//   1건이라도 있음 → P17이 12h 원안(이관 계획)으로 복귀해야 함
//
// 크리덴셜이 없으면
// ------------------
// `LEGACY_SUPABASE_URL` / `LEGACY_SUPABASE_SERVICE_ROLE_KEY`가 없으면 이 스크립트는
// 실패(exit 1)하지 않는다. 안내만 출력하고 exit 0으로 끝난다 — CI/스크립트 모음에
// 섞여 있어도 이 항목 때문에 전체가 실패로 보이면 안 된다.
// =====================================================================

import { createClient } from "@supabase/supabase-js";

const LEGACY_URL = process.env.LEGACY_SUPABASE_URL;
const LEGACY_SERVICE_ROLE_KEY = process.env.LEGACY_SUPABASE_SERVICE_ROLE_KEY;

if (!LEGACY_URL || !LEGACY_SERVICE_ROLE_KEY) {
  console.log(
    "레거시 DB 크리덴셜 없음 — 실행 불가. .env.local에 LEGACY_SUPABASE_URL / LEGACY_SUPABASE_SERVICE_ROLE_KEY 를 설정한 뒤 다시 실행하세요.",
  );
  process.exit(0);
}

const supabase = createClient(LEGACY_URL, LEGACY_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const TABLES = ["students", "conversations", "assessment_reports"];

async function countTable(table) {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true });
  if (error) {
    return { table, count: null, error: error.message };
  }
  return { table, count, error: null };
}

async function countStorageObjects() {
  const { data: buckets, error: bucketsError } =
    await supabase.storage.listBuckets();
  if (bucketsError) {
    return { buckets: [], total: null, error: bucketsError.message };
  }

  const buckets_result = [];
  let total = 0;

  for (const bucket of buckets) {
    let bucketTotal = 0;
    let offset = 0;
    const limit = 1000;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data: objects, error: listError } = await supabase.storage
        .from(bucket.name)
        .list(undefined, { limit, offset });

      if (listError) {
        buckets_result.push({
          name: bucket.name,
          count: null,
          error: listError.message,
        });
        break;
      }

      bucketTotal += objects.length;

      if (objects.length < limit) {
        buckets_result.push({
          name: bucket.name,
          count: bucketTotal,
          error: null,
        });
        total += bucketTotal;
        break;
      }

      offset += limit;
    }
  }

  return { buckets: buckets_result, total, error: null };
}

console.log(`레거시 DB 실측 — ${LEGACY_URL}\n`);

const tableResults = await Promise.all(TABLES.map(countTable));
const storageResult = await countStorageObjects();

console.log("테이블                    | 행 수");
console.log("--------------------------|-------");
for (const { table, count, error } of tableResults) {
  console.log(`${table.padEnd(26)}| ${error ? `ERROR: ${error}` : count}`);
}

console.log("");
if (storageResult.error) {
  console.log(`Storage — ERROR: ${storageResult.error}`);
} else {
  console.log("Storage 버킷              | 객체 수");
  console.log("--------------------------|-------");
  for (const { name, count, error } of storageResult.buckets) {
    console.log(`${name.padEnd(26)}| ${error ? `ERROR: ${error}` : count}`);
  }
  console.log(`${"합계".padEnd(26)}| ${storageResult.total}`);
}

const hasError =
  tableResults.some((r) => r.error !== null) || storageResult.error !== null;
const totalRows =
  tableResults.reduce((sum, r) => sum + (r.count ?? 0), 0) +
  (storageResult.total ?? 0);

console.log("");
if (hasError) {
  console.log(
    "일부 조회가 실패했습니다 — 위 ERROR 항목을 확인하세요. 결정은 전 항목 성공 후 내리세요.",
  );
} else if (totalRows === 0) {
  console.log("전부 0건 — 결정 B 확정 가능. P17은 2h로 종결.");
} else {
  console.log(
    `총 ${totalRows}건 존재 — P17이 12h 원안(이관 계획)으로 복귀해야 함.`,
  );
}
