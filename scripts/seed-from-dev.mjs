#!/usr/bin/env node

// 로컬 Supabase 스택에 dev 데이터를 주입한다 (그때그때 추출 방식 — 커밋되는 시드 없음).
//
// 사용법:
//   1) supabase start           (로컬 스택 기동)
//   2) supabase db reset        (마이그레이션 + supabase/seed.sql 재생)
//   3) node scripts/seed-from-dev.mjs
//
// 필요: .env.local에 SUPABASE_URL(dev), SUPABASE_SERVICE_ROLE_KEY(dev)
// 로컬 접속 정보는 `supabase status`에서 자동으로 읽는다.
//
// 화이트리스트 테이블만 복사한다 — 유저 데이터(profiles/orders 등)는 절대 포함 금지.

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

// FK 의존 순서 고려: 참조되는 쪽을 먼저.
const TABLES = [
  // 약관
  "terms",
  // 결제 카탈로그
  "programs",
  "products",
  "coupons",
  // 학습진단 카피
  "learning_diagnosis_v2_survey_copy",
  // 랜딩/메뉴
  "page_contents",
  "program_categories",
  "banners",
  "home_mentor_strategies",
  "home_side_banners",
  "popups",
  "app_settings",
  "university_acceptances",
  // 콘텐츠 게시판
  "faqs",
  "galleries",
  "notices",
  "company_news",
  "admission_posts",
  "admission_acceptance_rates",
  "admission_case_logos",
  "special_highschool_acceptance_rates",
  "special_highschool_cases",
  // 멘토 지원 + 수행평가 마스터
  // (performance_topics는 제외 — 2026-08-21 실측 결과 전 행이 performance_sessions
  //  FK 종속 유저 데이터라 마스터가 아니다. RAG 코퍼스도 dev 0행.)
  "mentor_apply_copy",
  "mentor_apply_faqs",
  // 목표관리 정시 컷 (약 13k행)
  "goal_university_cuts",
  // 프리미엄 북
  "premium_book_pages",
];

const PAGE = 1000;

// PK가 id가 아닌 테이블 (upsert 충돌 기준)
const PK_OVERRIDE = { app_settings: "key" };

function loadDevEnv() {
  const envPath = path.join(repoRoot, ".env.local");
  const env = {};
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error(
      ".env.local에 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요",
    );
  return { url, key };
}

function loadLocalEnv() {
  const out = execSync("supabase status -o json", {
    cwd: repoRoot,
    encoding: "utf8",
  });
  const jsonStart = out.indexOf("{");
  const status = JSON.parse(out.slice(jsonStart));
  const url = status.API_URL;
  const key = status.SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error(
      "supabase status에서 API_URL/SERVICE_ROLE_KEY를 읽지 못함 — 스택이 떠 있나?",
    );
  return { url, key };
}

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

async function upsertAll(client, table, rows) {
  for (let i = 0; i < rows.length; i += PAGE) {
    const chunk = rows.slice(i, i + PAGE);
    const { error } = await client
      .from(table)
      .upsert(chunk, { onConflict: PK_OVERRIDE[table] ?? "id" });
    if (error) throw new Error(`${table} 쓰기 실패(${i}~): ${error.message}`);
  }
}

async function main() {
  const dev = loadDevEnv();
  const local = loadLocalEnv();
  if (dev.url.includes("127.0.0.1") || dev.url.includes("localhost")) {
    throw new Error(
      ".env.local의 SUPABASE_URL이 로컬을 가리킴 — dev URL이어야 한다",
    );
  }

  const devClient = createClient(dev.url, dev.key, {
    auth: { persistSession: false },
  });
  const localClient = createClient(local.url, local.key, {
    auth: { persistSession: false },
  });

  let ok = 0,
    failed = [];
  for (const table of TABLES) {
    try {
      const rows = await fetchAll(devClient, table);
      await upsertAll(localClient, table, rows);
      console.log(`✓ ${table}: ${rows.length}행`);
      ok++;
    } catch (e) {
      console.error(`✗ ${table}: ${e.message}`);
      failed.push(table);
    }
  }
  // seed.sql의 약관 동의 블록은 terms가 빈 시점에 돌아 0행이었을 수 있다 — 여기서 백필.
  const QA_USER_IDS = [
    "00000000-0000-4000-8000-000000000001",
    "00000000-0000-4000-8000-000000000002",
    "00000000-0000-4000-8000-000000000003",
  ];
  try {
    const { data: requiredTerms, error } = await localClient
      .from("terms")
      .select("id")
      .eq("is_required", true);
    if (error) throw new Error(error.message);
    // (user_id, term_id) unique 제약이 없어 upsert 불가 — 기존 행 제외하고 insert
    const { data: existing, error: e1 } = await localClient
      .from("user_term_agreements")
      .select("user_id, term_id")
      .in("user_id", QA_USER_IDS);
    if (e1) throw new Error(e1.message);
    const seen = new Set(existing.map((r) => `${r.user_id}:${r.term_id}`));
    const agreements = QA_USER_IDS.flatMap((uid) =>
      requiredTerms.map((t) => ({ user_id: uid, term_id: t.id, agreed: true })),
    ).filter((r) => !seen.has(`${r.user_id}:${r.term_id}`));
    if (agreements.length) {
      const { error: e2 } = await localClient
        .from("user_term_agreements")
        .insert(agreements);
      if (e2) throw new Error(e2.message);
    }
    console.log(
      `✓ user_term_agreements 백필: 신규 ${agreements.length}행 (필수 약관 ${requiredTerms.length}종)`,
    );
  } catch (e) {
    console.error(`✗ user_term_agreements 백필: ${e.message}`);
  }

  console.log(
    `\n완료: ${ok}/${TABLES.length} 테이블${failed.length ? `, 실패: ${failed.join(", ")}` : ""}`,
  );
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
