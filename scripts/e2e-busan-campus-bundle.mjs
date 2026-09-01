// 부산캠퍼스 9,900원 특별할인 번들 E2E — DB 레벨(시나리오 1~10) + UI 레벨
// (시나리오 11~15), busan-campus-bundle 브랜치 검증용(2026-09-01).
//
// 절대 규칙(e2e-refund-ver10.mjs 관례 그대로):
//   - .env.local 이 가리키는 로컬 Supabase 스택(127.0.0.1:54321)만 대상으로
//     한다 — 다른 host 면 즉시 abort(원격 오조작 방지).
//   - 검증 서버는 5303 고정 포트의 vite 를 그대로 쓴다(재기동하지 않는다):
//     없으면 npm run dev -- --port 5303 --strictPort
//   - Playwright 세션별 격리 — 흐름마다 새 컨텍스트, storageState 공유 금지.
//     세션은 admin generate_link(magiclink) → verify 로 매번 새로 발급해
//     localStorage 에 주입한다. 로컬 스택 storageKey 는
//     `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`
//     (@supabase/supabase-js SupabaseClient.ts:324 기준 — 원격 dev 스크립트의
//     `sb-<project-ref>-auth-token` 과 동일 공식, host 가 IP 라 첫 라벨이
//     "127"이 될 뿐이다).
//
// 실행: node scripts/e2e-busan-campus-bundle.mjs
// 생성한 QA 계정·주문·쿠폰·소속코드 변경은 종료 시 정리한다(실패해도 finally).

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

const REPO_ROOT = new URL("..", import.meta.url).pathname;
const APP_ORIGIN = "http://localhost:5303";
const RUN_TAG = `busan-${Date.now().toString(36)}`;

function loadEnv() {
  const raw = readFileSync(`${REPO_ROOT}.env.local`, "utf8");
  const env = {};
  for (const line of raw.split("\n")) {
    if (!line.includes("=") || line.trim().startsWith("#")) continue;
    const idx = line.indexOf("=");
    env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return env;
}

const env = loadEnv();
const SUPABASE_URL = env.SUPABASE_URL;
const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = env.VITE_SUPABASE_ANON_KEY;

const host = SUPABASE_URL ? new URL(SUPABASE_URL).hostname : "";
if (!(host === "127.0.0.1" || host === "localhost")) {
  console.error(
    `[ABORT] 로컬 스택이 아니다 — 기대 127.0.0.1/localhost, 실제 ${host}. 원격 오조작 방지를 위해 중단합니다.`,
  );
  process.exit(1);
}
const storageKey = `sb-${host.split(".")[0]}-auth-token`;
console.log(`[env] 로컬 스택 확인 완료: ${SUPABASE_URL} (storageKey=${storageKey})`);

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

let failures = 0;
const results = [];
function check(name, cond, detail = "") {
  if (cond) {
    results.push(["PASS", name]);
    console.log(`[PASS] ${name}`);
  } else {
    failures += 1;
    results.push(["FAIL", name, detail]);
    console.error(`[FAIL] ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// ---------------------------------------------------------------------------
// 정리 대상 레지스트리
// ---------------------------------------------------------------------------
const cleanup = {
  userIds: [],
  orderIds: [],
  couponIds: [],
  linkIds: [],
  productPatches: [], // { table, match, restore }
};

async function mkUser(label, memberType, orgCode) {
  const email = `${RUN_TAG}-${label}@winning.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    password: `Busan9900!${RUN_TAG}`,
  });
  if (error) throw new Error(`createUser(${label}) 실패: ${error.message}`);
  const id = data.user.id;
  cleanup.userIds.push(id);
  const { error: pErr } = await admin.from("profiles").upsert({
    id,
    email,
    name: `QA ${label}`,
    role: "user",
    member_type: memberType,
    org_code: orgCode ?? null,
  });
  if (pErr) throw new Error(`profiles upsert(${label}) 실패: ${pErr.message}`);
  return { id, email };
}

async function linkPair(parent, student) {
  const { data, error } = await admin
    .from("parent_child_links")
    .insert({
      parent_id: parent.id,
      student_id: student.id,
      status: "approved",
      responded_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) throw new Error(`parent_child_links insert 실패: ${error.message}`);
  cleanup.linkIds.push(data.id);
}

async function mintSession(email) {
  const glRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ type: "magiclink", email }),
  });
  const glBody = await glRes.json();
  if (!glRes.ok) throw new Error(`generate_link 실패: ${glRes.status} ${JSON.stringify(glBody)}`);
  const tokenHash = glBody.hashed_token || glBody.properties?.hashed_token;

  const vfRes = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "magiclink", token_hash: tokenHash }),
  });
  const session = await vfRes.json();
  if (!vfRes.ok || !session.access_token)
    throw new Error(`verify 실패: ${vfRes.status} ${JSON.stringify(session)}`);

  return {
    storageVal: JSON.stringify({
      access_token: session.access_token,
      token_type: session.token_type || "bearer",
      expires_in: session.expires_in,
      expires_at: session.expires_at,
      refresh_token: session.refresh_token,
      user: session.user,
    }),
    accessToken: session.access_token,
  };
}

async function rpcAsUser(email, fn, args) {
  const { accessToken } = await mintSession(email);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok)
    return { data: null, error: { message: body?.message || `HTTP ${res.status}`, code: body?.code } };
  return { data: body, error: null };
}

// 흐름마다 완전히 새 컨텍스트 — storageState 공유 금지(세션별 격리 원칙).
async function freshPage(browser, email) {
  const { storageVal } = await mintSession(email);
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(
    ([k, v]) => window.localStorage.setItem(k, v),
    [storageKey, storageVal],
  );
  const page = await context.newPage();
  return { context, page };
}

// ---------------------------------------------------------------------------
// DB helper — 상품 조회
// ---------------------------------------------------------------------------
async function getProduct(slug) {
  const { data, error } = await admin
    .from("products")
    .select("id, slug, service_key, name, list_price, price, org_code, sale_ends_at")
    .eq("slug", slug)
    .single();
  if (error) throw new Error(`products(${slug}) 조회 실패: ${error.message}`);
  return data;
}

async function requestEnrollment(orderId, student, parent, product) {
  return admin.rpc("fn_request_enrollment", {
    p_order_id: orderId,
    p_student_profile_id: student.id,
    p_parent_profile_id: parent.id,
    p_customer_email: parent.email,
    p_order_name: product.name,
    p_items: [
      {
        product_id: product.id,
        product_slug: product.slug,
        service_key: product.service_key,
        name: product.name,
        list_price: product.list_price,
        price: product.price,
        quantity: 1,
      },
    ],
    p_list_amount: product.list_price,
    p_subtotal: product.price,
  });
}

async function approveAndPay(orderId, parent) {
  const { error: respErr } = await rpcAsUser(parent.email, "fn_respond_enrollment", {
    p_order_id: orderId,
    p_approve: true,
    p_reject_reason: null,
    p_coupon_ids: null,
  });
  if (respErr) throw new Error(`fn_respond_enrollment 실패: ${respErr.message}`);
  const now = new Date().toISOString();
  const { error: payErr } = await admin
    .from("orders")
    .update({ status: "paid", paid_at: now })
    .eq("id", orderId);
  if (payErr) throw new Error(`주문 paid 전환 실패: ${payErr.message}`);
  return now;
}

const browser = await chromium.launch();
try {
  // -------------------------------------------------------------------------
  // 서버 확인 — 5303 vite 가 떠 있어야 UI 시나리오 진행 가능.
  // -------------------------------------------------------------------------
  let serverUp = false;
  try {
    const res = await fetch(APP_ORIGIN, { redirect: "manual" });
    serverUp = res.status < 500;
  } catch {
    serverUp = false;
  }
  if (!serverUp) {
    console.error(
      `[ABORT] ${APP_ORIGIN} 응답 없음 — 검증 서버(포트 5303)를 먼저 띄울 것: npm run dev -- --port 5303 --strictPort`,
    );
    process.exit(1);
  }

  const busan = await getProduct("busan-9900");
  const suhaeng1 = await getProduct("suhaeng-1");

  // ===========================================================================
  // 시나리오 3~5, 10 — busan-9900 번들 부여/멱등/전체환불 + 단품 회귀
  // ===========================================================================
  const parent1 = await mkUser("s3-parent", "parent");
  const student1 = await mkUser("s3-student", "student", "위닝부산캠퍼스");
  await linkPair(parent1, student1);
  const order1 = `order_${RUN_TAG}_busan`;

  {
    const { error } = await requestEnrollment(order1, student1, parent1, busan);
    check("S3 fn_request_enrollment(번들) 성공", !error, error?.message);
    cleanup.orderIds.push(order1);
  }

  const paidAt1 = await approveAndPay(order1, parent1);

  {
    const { data: grantRes, error } = await admin.rpc("fn_grant_program_access_for_order", {
      p_order_id: order1,
      p_user_id: parent1.id,
      p_paid_at: paidAt1,
    });
    check("S3 fn_grant_program_access_for_order 성공", !error, error?.message);
    check("S3 granted 3개 program_key", grantRes?.granted?.length === 3, JSON.stringify(grantRes?.granted));
  }

  {
    const { data: grants, error } = await admin
      .from("program_access_grants")
      .select("program_key, paid_amount, expires_at, revoked_at")
      .eq("order_id", order1)
      .is("revoked_at", null);
    check("S3 grant 3행(diagnose/target/suhaeng)", !error && grants?.length === 3, JSON.stringify(grants));
    const keys = (grants || []).map((g) => g.program_key).sort();
    check(
      "S3 program_key 구성 정확",
      JSON.stringify(keys) === JSON.stringify(["diagnose", "suhaeng", "target"]),
      JSON.stringify(keys),
    );
    const sum = (grants || []).reduce((s, g) => s + g.paid_amount, 0);
    check("S3 paid_amount 합계 = 9,900", sum === 9900, `sum=${sum}`);
    check(
      "S3 만료 파생 정상(전부 expires_at 존재)",
      (grants || []).every((g) => g.expires_at),
      JSON.stringify(grants?.map((g) => g.expires_at)),
    );
  }

  // 시나리오 4 — 멱등: 같은 주문 재부여 시 grant 중복 0.
  {
    const { data: grantRes2, error } = await admin.rpc("fn_grant_program_access_for_order", {
      p_order_id: order1,
      p_user_id: parent1.id,
      p_paid_at: paidAt1,
    });
    check("S4 재부여 성공(에러 없음)", !error, error?.message);
    check("S4 ledger_inserted = 0", grantRes2?.ledger_inserted === 0, JSON.stringify(grantRes2));
    const { data: grants2 } = await admin
      .from("program_access_grants")
      .select("id")
      .eq("order_id", order1)
      .is("revoked_at", null);
    check("S4 grant 행수 여전히 3(중복 없음)", grants2?.length === 3, `count=${grants2?.length}`);
  }

  // 시나리오 5 — 기존 단품 회귀: suhaeng-1 주문 부여 시 grant 1행.
  const parent5 = await mkUser("s5-parent", "parent");
  const student5 = await mkUser("s5-student", "student");
  await linkPair(parent5, student5);
  const order5 = `order_${RUN_TAG}_single`;
  {
    const { error } = await requestEnrollment(order5, student5, parent5, suhaeng1);
    check("S5 단품 fn_request_enrollment 성공", !error, error?.message);
    cleanup.orderIds.push(order5);
    const paidAt5 = await approveAndPay(order5, parent5);
    const { data: grantRes, error: gErr } = await admin.rpc("fn_grant_program_access_for_order", {
      p_order_id: order5,
      p_user_id: parent5.id,
      p_paid_at: paidAt5,
    });
    check("S5 단품 grant 성공", !gErr, gErr?.message);
    const { data: grants5 } = await admin
      .from("program_access_grants")
      .select("program_key")
      .eq("order_id", order5)
      .is("revoked_at", null);
    check("S5 단품 grant 1행", grants5?.length === 1, JSON.stringify(grants5));
  }

  // 시나리오 10 — 전체환불: 3행 일괄 revoke.
  {
    const { data: revokeRes, error } = await admin.rpc("fn_revoke_program_access_for_order", {
      p_order_id: order1,
      p_user_id: parent1.id,
      p_payment_status: "refunded",
      p_reason: "qa_full_refund",
      p_order_item_ids: null,
    });
    check("S10 fn_revoke_program_access_for_order 성공", !error, error?.message);
    check("S10 revoked 3개 program_key", revokeRes?.revoked?.length === 3, JSON.stringify(revokeRes?.revoked));
    const { data: revoked } = await admin
      .from("program_access_grants")
      .select("id, revoked_at")
      .eq("order_id", order1);
    check(
      "S10 3행 전부 revoked_at 세팅됨",
      revoked?.length === 3 && revoked.every((r) => r.revoked_at),
      JSON.stringify(revoked),
    );
  }

  // ===========================================================================
  // 시나리오 6 — 1회 제한(WC066): 같은 학생 두 번째 busan-9900 주문.
  // ===========================================================================
  {
    const order6 = `order_${RUN_TAG}_dup`;
    const { error } = await requestEnrollment(order6, student1, parent1, busan);
    check("S6 두 번째 busan-9900 신청 WC066 거부", error?.code === "WC066", JSON.stringify(error));
  }

  // ===========================================================================
  // 시나리오 7 — org 불일치(WC064): org_code 없는 학생.
  // ===========================================================================
  const parent7 = await mkUser("s7-parent", "parent");
  const student7 = await mkUser("s7-student", "student"); // org_code 없음
  await linkPair(parent7, student7);
  {
    const order7 = `order_${RUN_TAG}_orgmismatch`;
    const { error } = await requestEnrollment(order7, student7, parent7, busan);
    check("S7 org 불일치 WC064 거부", error?.code === "WC064", JSON.stringify(error));
  }

  // ===========================================================================
  // 시나리오 8 — 기한(WC065): sale_ends_at 과거로 UPDATE 후 신청, 검증 후 원복.
  // ===========================================================================
  const parent8 = await mkUser("s8-parent", "parent");
  const student8 = await mkUser("s8-student", "student", "위닝부산캠퍼스");
  await linkPair(parent8, student8);
  {
    const { error: updErr } = await admin
      .from("products")
      .update({ sale_ends_at: "2020-01-01T00:00:00Z" })
      .eq("id", busan.id);
    if (updErr) throw new Error(`sale_ends_at UPDATE 실패: ${updErr.message}`);

    const order8 = `order_${RUN_TAG}_expired`;
    const { error } = await requestEnrollment(order8, student8, parent8, busan);
    check("S8 판매 마감 WC065 거부", error?.code === "WC065", JSON.stringify(error));

    const { error: restoreErr } = await admin
      .from("products")
      .update({ sale_ends_at: busan.sale_ends_at })
      .eq("id", busan.id);
    check("S8 sale_ends_at 원복 성공", !restoreErr, restoreErr?.message);
  }

  // ===========================================================================
  // 시나리오 9 — 쿠폰 차단: org 상품 포함 주문에서 쿠폰 배제.
  // ===========================================================================
  const parent9 = await mkUser("s9-parent", "parent");
  const student9 = await mkUser("s9-student", "student", "위닝부산캠퍼스");
  await linkPair(parent9, student9);
  const order9 = `order_${RUN_TAG}_coupon`;
  {
    const { error } = await requestEnrollment(order9, student9, parent9, busan);
    check("S9 신청 성공", !error, error?.message);
    cleanup.orderIds.push(order9);
  }

  const couponCode = `${RUN_TAG}coupon`.toLowerCase();
  {
    const { data: coupon, error } = await admin
      .from("coupons")
      .insert({
        code: couponCode,
        slug: couponCode,
        title: "QA 테스트 쿠폰",
        discount_amount: 1000,
        min_amount: 0,
        is_active: true,
        stackable: true,
        grant_type: "auto",
      })
      .select("id")
      .single();
    if (error) throw new Error(`coupons insert 실패: ${error.message}`);
    cleanup.couponIds.push(coupon.id);

    const { data: usable, error: uErr } = await rpcAsUser(student9.email, "fn_usable_coupons", {
      p_subtotal: busan.price,
      p_student_profile_id: null,
      p_order_id: order9,
    });
    check("S9 fn_usable_coupons RPC 성공", !uErr, JSON.stringify(uErr));
    const row = Array.isArray(usable) ? usable.find((r) => r.id === coupon.id) : null;
    check(
      "S9 fn_usable_coupons eligible=false, reason=org_product_excluded",
      row?.eligible === false && row?.reason === "org_product_excluded",
      JSON.stringify(row),
    );

    const { data: byCode, error: cErr } = await rpcAsUser(student9.email, "fn_coupon_by_code", {
      p_code: couponCode,
      p_subtotal: busan.price,
      p_student_profile_id: null,
      p_order_id: order9,
    });
    check("S9 fn_coupon_by_code RPC 성공", !cErr, JSON.stringify(cErr));
    const codeRow = Array.isArray(byCode) ? byCode[0] : byCode;
    check(
      "S9 fn_coupon_by_code eligible=false, reason=org_product_excluded",
      codeRow?.eligible === false && codeRow?.reason === "org_product_excluded",
      JSON.stringify(codeRow),
    );
  }

  // ===========================================================================
  // UI 시나리오 11 — 게스트 /pricing: 특가 카드 미노출.
  // ===========================================================================
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto(`${APP_ORIGIN}/pricing`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    const badgeVisible = (await page.getByText("부산캠퍼스 특별할인").count()) > 0;
    check("S11 게스트 /pricing 특가 카드 미노출", !badgeVisible);
    await context.close();
  }

  // ===========================================================================
  // UI 시나리오 12 — org 없는 학생: 결제요청 화면 특가 미노출 → 소속코드 저장
  // → 특가 노출.
  // ===========================================================================
  const parent12 = await mkUser("s12-parent", "parent");
  const student12 = await mkUser("s12-student", "student"); // org_code 없음
  await linkPair(parent12, student12);
  {
    const { context, page } = await freshPage(browser, student12.email);
    await page.goto(`${APP_ORIGIN}/checkout`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    const before = (await page.getByText("부산캠퍼스 특별할인").count()) > 0;
    check("S12 org 없는 학생 결제요청 화면 특가 미노출", !before);

    // 마이페이지 → 소속코드 입력·저장.
    await page.goto(`${APP_ORIGIN}/mypage?tab=profile`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    // ProfileTab.tsx — 소속코드 필드의 액션 버튼 라벨은 org_code 미입력 시
    // "입력"(입력 후엔 "변경"). 이 탭에서 "입력"은 소속코드 필드 하나뿐.
    const orgTrigger = page.getByRole("button", { name: "입력" });
    await orgTrigger.click({ timeout: 10000 });
    const orgInput = page.locator('input[placeholder="소속코드가 없으면 입력하지 마세요"]');
    await orgInput.waitFor({ state: "visible", timeout: 10000 });
    await orgInput.fill("위닝부산캠퍼스");
    await page.getByRole("button", { name: "저장" }).click();
    await page.waitForTimeout(1500);

    const { data: profileRow } = await admin
      .from("profiles")
      .select("org_code")
      .eq("id", student12.id)
      .single();
    check("S12 소속코드 DB 저장 확인", profileRow?.org_code === "위닝부산캠퍼스", JSON.stringify(profileRow));

    // 결제요청 화면 재진입 — 특가 섹션 노출.
    await page.goto(`${APP_ORIGIN}/checkout`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    const afterBadge = (await page.getByText("부산캠퍼스 특별할인").count()) > 0;
    check("S12 소속코드 저장 후 특가 섹션 노출", afterBadge);
    const noCouponNotice = (await page.getByText("쿠폰 적용 대상이 아닙니다").count()) > 0;
    check("S12 구성·쿠폰 불가 고지 확인", noCouponNotice);
    await context.close();
  }

  // ===========================================================================
  // UI 시나리오 13 — 학부모 결제 화면: 특가 담긴 주문에서 쿠폰 섹션이
  // 안내문으로 대체.
  // ===========================================================================
  const parent13 = await mkUser("s13-parent", "parent");
  const student13 = await mkUser("s13-student", "student", "위닝부산캠퍼스");
  await linkPair(parent13, student13);
  const order13 = `order_${RUN_TAG}_ui13`;
  {
    const { error } = await requestEnrollment(order13, student13, parent13, busan);
    check("S13 사전 신청 성공(DB)", !error, error?.message);
    cleanup.orderIds.push(order13);

    const { context, page } = await freshPage(browser, parent13.email);
    await page.goto(`${APP_ORIGIN}/checkout?order=${order13}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    const notice = (await page.getByText("본 특가 상품은 쿠폰 적용 대상이 아닙니다.").count()) > 0;
    check("S13 학부모 결제 화면 쿠폰 섹션 안내문 대체", notice);
    await context.close();
  }

  // ===========================================================================
  // UI 시나리오 14 — 학부모 마이페이지 결제 내역: 단일 표, 3종 kind 각각
  // 클릭 시 각 모달 오픈.
  // ===========================================================================
  const parent14 = await mkUser("s14-parent", "parent");
  const student14 = await mkUser("s14-student", "student", "위닝부산캠퍼스");
  await linkPair(parent14, student14);

  // history 행 — busan-9900 paid 주문(구성 3줄 표기 검증도 이 주문 재사용, S15).
  const order14History = `order_${RUN_TAG}_hist`;
  {
    const { error } = await requestEnrollment(order14History, student14, parent14, busan);
    check("S14 history용 신청 성공", !error, error?.message);
    cleanup.orderIds.push(order14History);
    const paidAt = await approveAndPay(order14History, parent14);
    const { error: gErr } = await admin.rpc("fn_grant_program_access_for_order", {
      p_order_id: order14History,
      p_user_id: parent14.id,
      p_paid_at: paidAt,
    });
    check("S14 history용 grant 성공", !gErr, gErr?.message);
  }

  // pending 행 — suhaeng-1 신청만(승인 대기).
  const order14Pending = `order_${RUN_TAG}_pend`;
  {
    const { error } = await requestEnrollment(order14Pending, student14, parent14, suhaeng1);
    check("S14 pending용 신청 성공", !error, error?.message);
    cleanup.orderIds.push(order14Pending);
  }

  // refund 행 — history 주문에 대해 학생이 전액 환불 요청(requested).
  {
    const { data: refundRow, error } = await rpcAsUser(student14.email, "fn_request_refund", {
      p_order_id: order14History,
      p_reason: "단순 변심",
      p_refund_bank: null,
      p_refund_account: null,
      p_refund_holder: null,
      p_order_item_ids: null,
    });
    check("S14 refund용 학생 신청 성공", !error, JSON.stringify(error));
    check(
      "S14 refund 행 approval_status=requested",
      refundRow?.approval_status === "requested",
      JSON.stringify(refundRow),
    );
  }

  {
    const { context, page } = await freshPage(browser, parent14.email);
    await page.goto(`${APP_ORIGIN}/mypage?tab=payments`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);

    const singleTableHeading = await page.getByRole("heading", { name: "지난 결제내역" }).count();
    check("S14 '지난 결제내역' 단일 표 제목 1개", singleTableHeading === 1, `count=${singleTableHeading}`);
    const threeSectionHeadings =
      (await page.getByText("환불요청").count()) + (await page.getByText("결제 신청하기").count());
    check("S14 3섹션(구) 제목 없음", threeSectionHeadings === 0, `count=${threeSectionHeadings}`);

    // refund 행 클릭 → 승인 모달.
    await page
      .getByText(order14History.replace(/^order_/, ""), { exact: false })
      .first()
      .click();
    await page.waitForTimeout(800);
    const approvalModalOpen = (await page.getByRole("button", { name: /환불 승인/ }).count()) > 0;
    check("S14 refund 행 클릭 → 승인 모달 오픈", approvalModalOpen);
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(500);

    // pending 행 클릭 → 결제 요청 확인 모달.
    await page
      .getByText(order14Pending.replace(/^order_/, ""), { exact: false })
      .first()
      .click();
    await page.waitForTimeout(800);
    const enrollmentModalOpen =
      (await page.getByText(/결제 진행하기|결제요청|승인/).count()) > 0;
    check("S14 pending 행 클릭 → 결제 요청 모달 오픈", enrollmentModalOpen);
    await page.keyboard.press("Escape").catch(() => {});

    await context.close();
  }

  // ===========================================================================
  // UI 시나리오 15 — 영수증·결제상세: 번들 주문 구성 3줄 표기.
  //
  // 전용 주문을 새로 쓴다 — order14History 는 S14 에서 환불 신청까지
  // 걸어(kind=refund) rows 배열에 같은 주문번호로 두 행(refund·history)이
  // 뜬다. 텍스트 매칭 .first() 가 refund 행(승인 모달)을 먼저 잡아 결제
  // 상세(PaymentDetailModal)를 못 연다 — 모호성 없는 별도 주문으로 분리한다.
  // ===========================================================================
  const parent15 = await mkUser("s15-parent", "parent");
  const student15 = await mkUser("s15-student", "student", "위닝부산캠퍼스");
  await linkPair(parent15, student15);
  const order15 = `order_${RUN_TAG}_receipt`;
  {
    const { error } = await requestEnrollment(order15, student15, parent15, busan);
    check("S15 사전 신청 성공(DB)", !error, error?.message);
    cleanup.orderIds.push(order15);
    const paidAt15 = await approveAndPay(order15, parent15);
    const { error: gErr } = await admin.rpc("fn_grant_program_access_for_order", {
      p_order_id: order15,
      p_user_id: parent15.id,
      p_paid_at: paidAt15,
    });
    check("S15 grant 성공", !gErr, gErr?.message);
  }

  {
    const { context, page } = await freshPage(browser, parent15.email);
    await page.goto(`${APP_ORIGIN}/mypage?tab=payments`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);

    await page
      .getByText(order15.replace(/^order_/, ""), { exact: false })
      .first()
      .click();
    await page.waitForTimeout(800);

    const diagnoseLine = (await page.getByText("학습진단 1회", { exact: false }).count()) > 0;
    const targetLine = (await page.getByText("목표관리 1개월", { exact: false }).count()) > 0;
    const suhaengLine = (await page.getByText("수행평가 1개월 2회", { exact: false }).count()) > 0;
    check("S15 결제상세 구성 3줄(학습진단 1회)", diagnoseLine);
    check("S15 결제상세 구성 3줄(목표관리 1개월)", targetLine);
    check("S15 결제상세 구성 3줄(수행평가 1개월 2회)", suhaengLine);

    await context.close();
  }
} finally {
  await browser.close();

  // ---------------------------------------------------------------------------
  // 정리 — 이 실행이 만든 QA 데이터만 지운다(RUN_TAG 스코프).
  // ---------------------------------------------------------------------------
  try {
    if (cleanup.orderIds.length > 0) {
      await admin.from("refund_requests").delete().in("order_id", cleanup.orderIds);
      await admin.from("program_access_grants").delete().in("order_id", cleanup.orderIds);
      await admin.from("coupon_redemptions").delete().in("order_id", cleanup.orderIds);
      await admin.from("order_items").delete().in("order_id", cleanup.orderIds);
      // orders 의 PK 는 order_id 가 아니라 id 다(order_items/refund_requests
      // 등 자식 테이블만 order_id 를 FK 로 쓴다) — 처음 이 조건을 order_id 로
      // 잘못 써서 orders 행이 전혀 안 지워지는 채로 조용히 성공 처리되던
      // 버그가 있었다(delete() 에러를 체크하지 않아 무증상).
      await admin.from("orders").delete().in("id", cleanup.orderIds);
    }
    if (cleanup.couponIds.length > 0) {
      await admin.from("coupons").delete().in("id", cleanup.couponIds);
    }
    if (cleanup.linkIds.length > 0) {
      await admin.from("parent_child_links").delete().in("id", cleanup.linkIds);
    }
    for (const uid of cleanup.userIds) {
      await admin.from("program_access").delete().eq("id", uid);
      await admin.auth.admin.deleteUser(uid).catch(() => {});
    }
    console.log(
      `[cleanup] 완료 — orders=${cleanup.orderIds.length}, coupons=${cleanup.couponIds.length}, links=${cleanup.linkIds.length}, users=${cleanup.userIds.length}`,
    );
  } catch (e) {
    console.error(`[cleanup] 실패 — 수동 확인 필요(${RUN_TAG}):`, e.message);
  }
}

console.log(`\n=== 결과 요약 (${results.length}건) ===`);
for (const [status, name] of results) console.log(`[${status}] ${name}`);

if (failures > 0) {
  console.error(`\n[E2E] 실패 ${failures}건`);
  process.exit(1);
}
console.log("\n[E2E] busan-campus-bundle 전체 통과");
