#!/usr/bin/env node

// main(prod) 릴리스 시점 1회 실행용 — dev cloud Supabase의 콘텐츠·마스터
// 데이터 전체를 prod Supabase로 복사한다. 로컬 스택용 scripts/seed-from-dev.mjs
// 와는 별개 파일이며 그 파일은 건드리지 않는다.
//
// 사용법 (기본은 드라이런 — 아무것도 쓰지 않는다):
//   node scripts/seed-prod-from-dev.mjs
//   node scripts/seed-prod-from-dev.mjs --apply
//   node scripts/seed-prod-from-dev.mjs --verify   # 시딩 후 검증(읽기만)
//
// 접속 정보:
//   dev(소스)  — .env.seed.local (없으면 .env.local, 로컬 URL이면 중단)
//   prod(타깃) — env SEED_TARGET_URL / SEED_TARGET_SERVICE_ROLE_KEY,
//                없으면 .env.seed.prod.local 파일(gitignore됨, 이 저장소엔 없음 — 직접 생성)
//   관리자 계정 — env SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD (없으면 계정 생성 단계 스킵)
//
// 안전장치:
//   - 기본 드라이런. 실제 반영은 --apply + SEED_CONFIRM=<타깃 프로젝트 ref> 일치 시에만.
//   - 타깃이 dev 프로젝트(gjowqdiopinhixfivnkx)와 같으면 즉시 중단(자기 자신 시딩 방지).
//   - 서비스 롤 키는 어떤 경우에도 stdout에 출력하지 않는다.
//
// 브리프 대비 편차 (브리프의 화이트리스트 중 아래 4개는 넣지 않음 — 스키마 실측 근거):
//   - admission_result_department_index / admission_result_university_index /
//     admission_university_resource_index / goal_university_options
//     → 전부 VIEW(baseline.sql, security_invoker=true)다. 기반 테이블
//       (admission_results / admission_university_resources / goal_university_cuts)을
//       시딩하면 자동으로 값이 나온다 — upsert 대상이 아니다.
//   - goal_workbooks
//     → goal_workbooks.profile_id가 goal_students(profile_id) FK(on delete cascade)다.
//       "사용자당 다건"(baseline.sql 코멘트)인 유저 데이터라 마스터가 아니다.
//       그대로 복사하면 dev 유저의 문제집을 prod로 유출하게 된다 — 이 스크립트의
//       목표("user 연관 데이터는 복사하지 않는다")와 정면으로 충돌해 제외한다.
//   - performance_topics
//     → performance_topics.session_id가 performance_sessions FK(not null)다.
//       기존 scripts/seed-from-dev.mjs가 2026-08-21에 이미 같은 이유로 화이트리스트에서
//       뺐다(주석 참고) — 세션당 생성되는 유저 데이터이지 마스터가 아니다.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const DEV_PROJECT_REF = "gjowqdiopinhixfivnkx";
const PAGE = 1000;

// FK 의존 순서 고려: 참조되는 쪽을 먼저.
// special 필드는 단순 upsert로 안 되는 테이블(아래 handleXxx 함수 참고).
const TABLES = [
  // 약관
  { name: "terms", pk: "code,version", special: "terms" },
  // 결제 카탈로그
  { name: "programs" },
  { name: "products" },
  { name: "coupons" },
  // 학습진단 카피
  { name: "learning_diagnosis_v2_survey_copy" },
  // 랜딩/메뉴
  { name: "page_contents" },
  { name: "program_categories" },
  { name: "banners" },
  { name: "home_mentor_strategies" },
  { name: "home_side_banners" },
  { name: "popups" },
  { name: "app_settings", pk: "key" },
  { name: "university_acceptances" },
  // 콘텐츠 게시판
  { name: "faqs" },
  { name: "galleries" },
  { name: "notices" },
  { name: "company_news" },
  { name: "admission_posts" },
  { name: "admission_acceptance_rates" },
  { name: "admission_case_logos" },
  { name: "special_highschool_acceptance_rates" },
  { name: "special_highschool_cases" },
  // 멘토 지원
  { name: "mentor_apply_copy" },
  { name: "mentor_apply_faqs" },
  // 목표관리 정시 컷
  { name: "goal_university_cuts" },
  // 프리미엄 북
  { name: "premium_book_pages" },

  // --- 이하 이 스크립트에서 추가하는 대상(브리프) ---

  // 관리자 권한 체계. admin_roles/admin_role_permissions는 dev·prod가 각자
  // 마이그레이션으로 gen_random_uuid() id를 이미 발급받았으므로 id를 그대로
  // 복사할 수 없다(role_id FK가 prod의 기존 id를 참조 중 — 바꾸면 23503).
  // name 기준으로 매핑해 role_id를 리라이트한다. handleAdminRoles 참고.
  { name: "admin_resources", pk: "key" },
  { name: "admin_roles", special: "admin_roles" },
  {
    name: "admin_role_permissions",
    pk: "role_id,resource_key",
    special: "admin_role_permissions",
  },

  // 대입 모집요강 마스터 (FK 없음 — university_key/department_key는 text)
  { name: "admission_universities" },
  { name: "admission_results" }, // 43,170행 — id는 identity(BY DEFAULT)라 명시값 upsert 가능
  { name: "admission_university_resources" },

  // 콘텐츠 마스터
  { name: "trending_departments" },
  { name: "winning_assessment_knowledge_items" }, // RAG 지식베이스 (embedding vector 포함)
];

// ---------------------------------------------------------------------------
// env 로딩
// ---------------------------------------------------------------------------

function readEnvFile(name) {
  const env = {};
  let raw;
  try {
    raw = readFileSync(path.join(repoRoot, name), "utf8");
  } catch {
    return null;
  }
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

function loadDevEnv() {
  const fromSeedLocal = readEnvFile(".env.seed.local");
  const fromEnvLocal = readEnvFile(".env.local");
  const env = fromSeedLocal ?? fromEnvLocal;
  const source = fromSeedLocal ? ".env.seed.local" : ".env.local";
  const url = env?.SUPABASE_URL || env?.VITE_SUPABASE_URL;
  const key = env?.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error(
      ".env.seed.local 또는 .env.local에 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요",
    );
  if (url.includes("127.0.0.1") || url.includes("localhost"))
    throw new Error(
      `${source}의 SUPABASE_URL이 로컬을 가리킴 — dev URL이어야 한다.`,
    );
  if (!url.includes(DEV_PROJECT_REF))
    throw new Error(
      `${source}의 SUPABASE_URL이 dev 프로젝트(${DEV_PROJECT_REF})가 아님 — 중단.`,
    );
  return { url: url.replace(/\/$/, ""), key, source };
}

// prod는 env 우선, 없으면 .env.seed.prod.local 파일. 둘 다 없으면 null —
// 드라이런은 타깃 미설정 상태로도 동작해야 하므로 여기서 던지지 않는다.
function loadProdEnv() {
  if (process.env.SEED_TARGET_URL && process.env.SEED_TARGET_SERVICE_ROLE_KEY) {
    return {
      url: process.env.SEED_TARGET_URL.replace(/\/$/, ""),
      key: process.env.SEED_TARGET_SERVICE_ROLE_KEY,
      source: "env(SEED_TARGET_URL)",
    };
  }
  const file = readEnvFile(".env.seed.prod.local");
  const url = file?.SEED_TARGET_URL || file?.SUPABASE_URL;
  const key =
    file?.SEED_TARGET_SERVICE_ROLE_KEY || file?.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key)
    return { url: url.replace(/\/$/, ""), key, source: ".env.seed.prod.local" };
  return null;
}

function hostOf(url) {
  return new URL(url).host;
}

// ---------------------------------------------------------------------------
// 읽기/쓰기 공통
// ---------------------------------------------------------------------------

async function fetchAll(client, table) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client
      .from(table)
      .select("*")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${table} 읽기 실패: ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

async function upsertAll(client, table, rows, onConflict) {
  for (let i = 0; i < rows.length; i += PAGE) {
    const chunk = rows.slice(i, i + PAGE);
    const { error } = await client.from(table).upsert(chunk, { onConflict });
    if (error) throw new Error(`${table} 쓰기 실패(${i}~): ${error.message}`);
  }
}

async function countRows(client, table) {
  const { count, error } = await client
    .from(table)
    .select("*", { count: "exact", head: true });
  if (error) throw new Error(`${table} 카운트 실패: ${error.message}`);
  return count;
}

// ---------------------------------------------------------------------------
// dev storage 도메인 → prod storage 도메인 치환 (문자열/배열/JSON 재귀)
// ---------------------------------------------------------------------------

// prodHost가 없으면(타깃 미설정 드라이런) 치환하지 않고 건수만 센다.
function replaceHostDeep(value, devHost, prodHost, counter) {
  if (typeof value === "string") {
    if (!value.includes(devHost)) return value;
    counter.count += value.split(devHost).length - 1;
    return prodHost ? value.split(devHost).join(prodHost) : value;
  }
  if (Array.isArray(value))
    return value.map((v) => replaceHostDeep(v, devHost, prodHost, counter));
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value))
      out[k] = replaceHostDeep(v, devHost, prodHost, counter);
    return out;
  }
  return value;
}

// ---------------------------------------------------------------------------
// terms 특수 처리 — seed-from-dev.mjs의 replaceTerms와 동일 이유(마이그레이션이
// prod에도 (code,version) 활성 행을 미리 심어 두 유니크에 동시에 걸림).
// ---------------------------------------------------------------------------

async function handleTerms(prodClient, rows) {
  const { error: deactivateError } = await prodClient
    .from("terms")
    .update({ is_active: false })
    .eq("is_active", true);
  if (deactivateError)
    throw new Error(`terms 비활성화 실패: ${deactivateError.message}`);
  await upsertAll(prodClient, "terms", rows, "code,version");
  const devIds = rows.map((r) => r.id);
  const { error: pruneError } = await prodClient
    .from("terms")
    .delete()
    .not("id", "in", `(${devIds.join(",")})`);
  if (pruneError && pruneError.code !== "23503")
    throw new Error(`terms 잔여 행 정리 실패: ${pruneError.message}`);
}

// ---------------------------------------------------------------------------
// admin_roles / admin_role_permissions 특수 처리 — id 리라이트
// ---------------------------------------------------------------------------

// id 컬럼을 payload에서 빼고 name 충돌 기준으로만 upsert한다 — 그래야 prod에
// 이미 마이그레이션이 심어 둔 admin_roles.id(admin_role_permissions FK가
// 참조 중)가 덮어써지지 않는다. 새 이름(dev에서 신설된 역할)만 새 id를 받는다.
async function handleAdminRoles(prodClient, devRows) {
  const payload = devRows.map(({ id, ...rest }) => rest);
  const { error } = await prodClient
    .from("admin_roles")
    .upsert(payload, { onConflict: "name" });
  if (error) throw new Error(`admin_roles 쓰기 실패: ${error.message}`);
  const { data: prodRoles, error: e2 } = await prodClient
    .from("admin_roles")
    .select("id, name");
  if (e2) throw new Error(`admin_roles 재조회 실패: ${e2.message}`);
  return new Map(prodRoles.map((r) => [r.name, r.id]));
}

async function handleAdminRolePermissions(
  prodClient,
  devRows,
  devRoles,
  nameToProdId,
) {
  const devIdToName = new Map(devRoles.map((r) => [r.id, r.name]));
  const remapped = [];
  const skipped = [];
  for (const row of devRows) {
    const name = devIdToName.get(row.role_id);
    const prodId = name && nameToProdId.get(name);
    if (!prodId) {
      skipped.push(row);
      continue;
    }
    remapped.push({
      role_id: prodId,
      resource_key: row.resource_key,
      level: row.level,
    });
  }
  if (skipped.length)
    console.error(
      `✗ admin_role_permissions: role_id 매핑 실패 ${skipped.length}건 스킵 (dev 역할이 admin_roles 동기화에서 빠졌을 가능성)`,
    );
  await upsertAll(
    prodClient,
    "admin_role_permissions",
    remapped,
    "role_id,resource_key",
  );
  return remapped.length;
}

// ---------------------------------------------------------------------------
// banners 스토리지 미러 — 시딩 대상 테이블 행에서만 참조 수집(전체 스캔 아님)
// ---------------------------------------------------------------------------

const ABS_URL_RE =
  /storage\/v1\/(?:object|render)\/(?:public|sign|authenticated)\/([a-z0-9_-]+)\/([^"'\\\s?]+)/g;

function collectStrings(value, out) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) collectStrings(v, out);
  else if (value && typeof value === "object")
    for (const v of Object.values(value)) collectStrings(v, out);
}

// banners 버킷 참조만 뽑는다(storage-gc.mjs 참조 수집부 축약 재사용).
function scanBannersRefs(str, refs, pathIndex) {
  for (const m of str.matchAll(ABS_URL_RE)) {
    if (m[1] !== "banners") continue;
    let p = m[2];
    try {
      p = decodeURIComponent(p);
    } catch {}
    refs.add(p);
  }
  const bare = str.trim().replace(/^\//, "");
  if (pathIndex.has(bare)) refs.add(bare);
  if (str.length > bare.length || !pathIndex.has(bare)) {
    for (const m of str.matchAll(
      /[\w\-./]+\.(?:png|jpe?g|webp|gif|svg|pdf|mp4|webm)/gi,
    )) {
      const token = m[0].replace(/^\//, "");
      if (pathIndex.has(token)) refs.add(token);
    }
  }
}

const LIST_PAGE = 1000;

async function listBannersBucket(url, key, prefix = "") {
  const out = [];
  for (let offset = 0; ; offset += LIST_PAGE) {
    const res = await fetch(`${url}/storage/v1/object/list/banners`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prefix,
        limit: LIST_PAGE,
        offset,
        sortBy: { column: "name", order: "asc" },
      }),
    });
    if (!res.ok)
      throw new Error(
        `banners 리스팅 실패(${prefix || "/"}): HTTP ${res.status}`,
      );
    const objs = await res.json();
    if (!Array.isArray(objs))
      throw new Error(`banners 리스팅 응답이 배열이 아님(${prefix || "/"})`);
    for (const o of objs) {
      const p = prefix ? `${prefix}/${o.name}` : o.name;
      if (o.id === null) out.push(...(await listBannersBucket(url, key, p)));
      else if (!p.endsWith(".emptyFolderPlaceholder"))
        out.push({ path: p, size: o.metadata?.size ?? 0 });
    }
    if (objs.length < LIST_PAGE) break;
  }
  return out;
}

async function ensureProdBannersBucket(url, key) {
  const res = await fetch(`${url}/storage/v1/bucket/banners`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (res.status === 404) {
    const createRes = await fetch(`${url}/storage/v1/bucket`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id: "banners", name: "banners", public: true }),
    });
    if (!createRes.ok)
      throw new Error(`banners 버킷 생성 실패: HTTP ${createRes.status}`);
    console.log("  banners 버킷을 prod에 생성함(public)");
    return;
  }
  if (!res.ok) throw new Error(`banners 버킷 조회 실패: HTTP ${res.status}`);
}

async function mirrorBanner(devUrl, prodUrl, prodKey, relPath) {
  const encoded = relPath.split("/").map(encodeURIComponent).join("/");
  const downloadRes = await fetch(
    `${devUrl}/storage/v1/object/public/banners/${encoded}`,
  );
  if (!downloadRes.ok) {
    console.error(`✗ 다운로드 실패: ${relPath} (HTTP ${downloadRes.status})`);
    return false;
  }
  const buf = Buffer.from(await downloadRes.arrayBuffer());
  const contentType =
    downloadRes.headers.get("content-type") ?? "application/octet-stream";
  const uploadRes = await fetch(
    `${prodUrl}/storage/v1/object/banners/${encoded}`,
    {
      method: "POST",
      headers: {
        apikey: prodKey,
        Authorization: `Bearer ${prodKey}`,
        "Content-Type": contentType,
        "x-upsert": "true",
      },
      body: buf,
    },
  );
  if (!uploadRes.ok) {
    console.error(`✗ 업로드 실패: ${relPath} (HTTP ${uploadRes.status})`);
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// 최고 관리자 계정 생성 (마지막 단계)
// ---------------------------------------------------------------------------

async function createAdminMaster(prodClient) {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) {
    console.log(
      "\n관리자 계정 생성: SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD 미설정 — 스킵. " +
        "필요하면 두 env를 설정하고 다시 실행하십시오(비밀번호는 코드에 절대 넣지 않음).",
    );
    return;
  }

  const { data: roleRow, error: roleErr } = await prodClient
    .from("admin_roles")
    .select("id")
    .eq("name", "최고 관리자")
    .single();
  if (roleErr || !roleRow)
    throw new Error(
      `prod admin_roles에 '최고 관리자' 행이 없음: ${roleErr?.message ?? "not found"}`,
    );

  const { data: created, error: createErr } =
    await prodClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
  if (createErr) throw new Error(`auth 계정 생성 실패: ${createErr.message}`);
  const userId = created.user.id;

  // prod에는 auth 트리거(handle_new_user)가 없다 — profiles 행을 직접 넣는다.
  const { error: profileErr } = await prodClient
    .from("profiles")
    .insert({ id: userId, email, role: "admin" });
  if (profileErr)
    throw new Error(`profiles 행 생성 실패: ${profileErr.message}`);

  const { error: memberErr } = await prodClient.from("admin_members").insert({
    profile_id: userId,
    role_id: roleRow.id,
    status: "active",
    activated_at: new Date().toISOString(),
  });
  if (memberErr)
    throw new Error(`admin_members 행 생성 실패: ${memberErr.message}`);

  console.log(
    `\n✓ 관리자 계정 생성 완료: ${email} (최고 관리자, profile_id=${userId})`,
  );
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

// 시딩 후 검증(--verify) — 읽기 전용. 세 가지를 본다:
//   1) 테이블별 행수: prod가 dev보다 적으면 실패(초과분은 정보로만 — upsert
//      재실행이나 prod 자체 등록분일 수 있다).
//   2) prod 행 데이터에 dev 도메인 문자열 잔존 0건 (URL 치환 누락 검출).
//   3) dev 행이 참조하는 banners 파일이 prod 버킷에 전부 존재.
// 하나라도 실패하면 exit code 1.
async function verifyMain(dev, prod) {
  const devHost = hostOf(dev.url);
  const prodHost = hostOf(prod.url);
  console.log(`검증 모드(--verify) | dev ${devHost} ↔ prod ${prodHost}`);

  const devClient = createClient(dev.url, dev.key, {
    auth: { persistSession: false },
  });
  const prodClient = createClient(prod.url, prod.key, {
    auth: { persistSession: false },
  });

  const devBannerFiles = await listBannersBucket(dev.url, dev.key);
  const devPathIndex = new Set(devBannerFiles.map((f) => f.path));
  const referencedPaths = new Set();

  let failures = 0;

  for (const table of TABLES) {
    const devRows = await fetchAll(devClient, table.name);
    const prodRows = await fetchAll(prodClient, table.name);

    // 참조 수집은 dev 원본에서 — 시딩이 복사했어야 하는 파일 목록의 기준이다.
    const devStrings = [];
    collectStrings(devRows, devStrings);
    for (const s of devStrings)
      scanBannersRefs(s, referencedPaths, devPathIndex);

    const prodStrings = [];
    collectStrings(prodRows, prodStrings);
    const leaks = prodStrings.filter((s) => s.includes(devHost)).length;

    const short = prodRows.length < devRows.length;
    if (short || leaks > 0) failures++;
    console.log(
      `${short || leaks ? "✗" : "✓"} ${table.name}: dev ${devRows.length} / prod ${prodRows.length}` +
        (prodRows.length > devRows.length ? " (prod 초과분 있음 — 정보)" : "") +
        (leaks ? ` | dev 도메인 잔존 ${leaks}건` : ""),
    );
  }

  console.log("\nbanners 버킷 대조(prod)...");
  const prodBannerFiles = await listBannersBucket(prod.url, prod.key);
  const prodPathIndex = new Set(prodBannerFiles.map((f) => f.path));
  const missingInProd = [...referencedPaths].filter(
    (p) => devPathIndex.has(p) && !prodPathIndex.has(p),
  );
  if (missingInProd.length > 0) {
    failures++;
    console.log(`✗ prod 버킷에 없는 참조 파일 ${missingInProd.length}건:`);
    for (const p of missingInProd.slice(0, 20)) console.log(`   - ${p}`);
  } else {
    console.log(
      `✓ 참조 파일 ${referencedPaths.size}개 전부 prod 버킷에 존재 (prod 총 ${prodBannerFiles.length}파일)`,
    );
  }

  if (failures > 0) {
    console.log(`\n검증 실패: ${failures}건`);
    process.exitCode = 1;
  } else {
    console.log("\n검증 통과: 행수·URL 치환·storage 미러 모두 정상");
  }
}

async function main() {
  const APPLY = process.argv.includes("--apply");
  const VERIFY = process.argv.includes("--verify");

  if (VERIFY) {
    if (APPLY) throw new Error("--verify와 --apply는 함께 쓸 수 없습니다.");
    const dev = loadDevEnv();
    const prod = loadProdEnv();
    if (!prod)
      throw new Error(
        "검증에는 타깃 접속 정보가 필요합니다 — SEED_TARGET_URL/SEED_TARGET_SERVICE_ROLE_KEY 또는 .env.seed.prod.local.",
      );
    if (hostOf(prod.url).split(".")[0] === DEV_PROJECT_REF)
      throw new Error("타깃이 dev 프로젝트와 동일함 — 중단.");
    await verifyMain(dev, prod);
    return;
  }
  const dev = loadDevEnv();
  const prod = loadProdEnv();
  const devHost = hostOf(dev.url);

  console.log(
    `모드: ${APPLY ? "적용(--apply)" : "드라이런"} | dev: ${devHost}`,
  );

  if (prod) {
    const prodHost = hostOf(prod.url);
    const prodRef = prodHost.split(".")[0];
    if (prodRef === DEV_PROJECT_REF)
      throw new Error(
        "타깃이 dev 프로젝트와 동일함 — 자기 자신 시딩 방지, 중단.",
      );
    if (APPLY) {
      console.log(`타깃(prod) URL: ${prod.url}`);
      if (process.env.SEED_CONFIRM !== prodRef)
        throw new Error(
          `SEED_CONFIRM 불일치 — env SEED_CONFIRM=${prodRef} 로 설정해야 --apply가 진행됩니다.`,
        );
    }
  } else if (APPLY) {
    throw new Error(
      "타깃 접속 정보 없음 — SEED_TARGET_URL/SEED_TARGET_SERVICE_ROLE_KEY 또는 .env.seed.prod.local 필요.",
    );
  } else {
    console.log("타깃 미설정 — dev 소스 집계만 수행합니다(드라이런).");
  }

  const devClient = createClient(dev.url, dev.key, {
    auth: { persistSession: false },
  });
  const prodClient = prod
    ? createClient(prod.url, prod.key, { auth: { persistSession: false } })
    : null;
  const prodHost = prod ? hostOf(prod.url) : undefined;
  const hostCounter = { count: 0 };

  // banners 리스팅(참조 대조용) — dev 소스에서만.
  console.log("\nbanners 버킷 리스팅(dev)...");
  const devBannerFiles = await listBannersBucket(dev.url, dev.key);
  const pathIndex = new Set(devBannerFiles.map((f) => f.path));
  const sizeByPath = new Map(devBannerFiles.map((f) => [f.path, f.size]));
  const referencedPaths = new Set();

  const results = [];
  let devRolesCache = null;

  for (const table of TABLES) {
    const rows = await fetchAll(devClient, table.name);

    // 스토리지 참조 수집(치환 전 원본에서).
    const strings = [];
    collectStrings(rows, strings);
    for (const s of strings) scanBannersRefs(s, referencedPaths, pathIndex);

    if (table.name === "admin_roles") devRolesCache = rows;

    if (!APPLY) {
      // 드라이런: 도메인 치환 건수만 카운트(prodHost 없으면 replaceHostDeep이
      // 값은 그대로 두고 건수만 누적한다).
      replaceHostDeep(rows, devHost, prodHost, hostCounter);
      console.log(`[dry-run] ${table.name}: 원본 ${rows.length}행`);
      results.push({ table: table.name, devCount: rows.length });
      continue;
    }

    const replaced = replaceHostDeep(rows, devHost, prodHost, hostCounter);

    if (table.special === "terms") {
      await handleTerms(prodClient, replaced);
    } else if (table.special === "admin_roles") {
      const nameToProdId = await handleAdminRoles(prodClient, replaced);
      console.log(
        `✓ admin_roles: dev ${rows.length}행 → prod ${nameToProdId.size}행 (name 기준 매핑, id는 prod 기존값 유지)`,
      );
      results.push({
        table: table.name,
        devCount: rows.length,
        __adminRoleMap: nameToProdId,
      });
    } else if (table.special === "admin_role_permissions") {
      const mapEntry = results.find((r) => r.__adminRoleMap);
      const n = await handleAdminRolePermissions(
        prodClient,
        replaced,
        devRolesCache,
        mapEntry.__adminRoleMap,
      );
      console.log(
        `✓ admin_role_permissions: dev ${rows.length}행 → prod ${n}행 반영`,
      );
      results.push({ table: table.name, devCount: rows.length, prodCount: n });
      continue;
    } else {
      await upsertAll(prodClient, table.name, replaced, table.pk ?? "id");
    }

    const prodCount = await countRows(prodClient, table.name);
    console.log(
      `✓ ${table.name}: dev ${rows.length}행 → prod 현재 ${prodCount}행`,
    );
    results.push({ table: table.name, devCount: rows.length, prodCount });
  }

  // 스토리지 미러
  let referencedSize = 0;
  const missing = [];
  for (const p of referencedPaths) {
    if (sizeByPath.has(p)) referencedSize += sizeByPath.get(p);
    else missing.push(p);
  }
  console.log(
    `\nbanners 참조 파일: ${referencedPaths.size}개(${(referencedSize / 1024 / 1024).toFixed(1)}MB)` +
      (missing.length
        ? `, 참조는 있으나 실파일 없음 ${missing.length}건(스킵)`
        : ""),
  );
  console.log(
    `URL 치환 대상(${devHost} → ${prodHost ?? "(타깃 미설정)"}): ${hostCounter.count}건`,
  );

  if (APPLY) {
    console.log("\nbanners 버킷 미러링...");
    await ensureProdBannersBucket(prod.url, prod.key);
    let ok = 0;
    for (const p of referencedPaths) {
      if (!sizeByPath.has(p)) continue; // 실파일 없는 참조는 건너뜀
      const success = await mirrorBanner(dev.url, prod.url, prod.key, p);
      if (success) ok++;
    }
    console.log(
      `  ${ok}/${referencedPaths.size - missing.length}개 파일 복사 완료`,
    );

    await createAdminMaster(prodClient);
  } else {
    console.log(
      "\n(드라이런이라 storage 복사·관리자 계정 생성은 실행하지 않았습니다.)",
    );
  }

  console.log(
    `\n완료: 테이블 ${TABLES.length}개 처리${APPLY ? "" : " (드라이런)"}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
