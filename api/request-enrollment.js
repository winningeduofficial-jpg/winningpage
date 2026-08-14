// Vercel 서버리스 함수: 학생 결제 요청(수강신청) 생성
//
// 학생은 여기서 결제를 하지 않는다. "요청"만 만들고, 학부모가 마이페이지에서
// fn_respond_enrollment 로 수락(+쿠폰 적용)해야 실제 결제로 이어진다
// (sql/68·69_payment_flow_hardening.sql, StudentEnrollmentRequest.jsx 상단 주석).
//
// 신뢰 경계 — body 의 parentProfileId·금액류 필드는 전부 무시한다. 학부모는
// parent_child_links(status='approved') 로 서버가 다시 조회하고, 금액은
// products 재조회로 재계산한다(아래 3)·4) — api/create-order.js 의 서버
// 재계산 패턴을 그대로 이식했다. 클라이언트가 무엇을 보내든 위조 이득이 없다.
//
// 필요 환경변수:
//   WINNING_SUPABASE_URL / SUPABASE_URL / VITE_SUPABASE_URL
//   WINNING_SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SERVICE_ROLE_KEY

import crypto from "node:crypto";
import { createSupabaseAdmin } from "./_lib/supabaseAdmin.ts";

function clean(value) {
  return String(value || "").trim();
}

function getBearerToken(req) {
  return clean(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
}

function buildOrderName(products) {
  if (products.length === 0) return "위닝에듀 서비스";
  const first = products[0].name || "위닝에듀 서비스";
  return products.length === 1 ? first : `${first} 외 ${products.length - 1}건`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = req.body || {};
    const rawItems = Array.isArray(body.items) ? body.items : [];

    const productIds = [
      ...new Set(rawItems.map((it) => clean(it?.id)).filter(Boolean)),
    ];
    if (productIds.length === 0) {
      return res.status(400).json({ error: "선택된 상품이 없습니다." });
    }

    const supabaseAdmin = createSupabaseAdmin();

    // 1) 학생 확정 — 요청 토큰으로만 신원을 정한다(body 의 studentProfileId 는 없다).
    const token = getBearerToken(req);
    if (!token) {
      return res.status(401).json({ error: "로그인이 필요합니다." });
    }
    const { data: userData, error: userError } =
      await supabaseAdmin.auth.getUser(token);
    const studentId = userData?.user?.id ?? null;
    const customerEmail = userData?.user?.email ?? null;
    if (userError || !studentId) {
      return res
        .status(401)
        .json({ error: "로그인이 만료되었습니다. 다시 로그인해 주세요." });
    }

    // 2) 회원유형 확인 — api/lookup-child.js 의 회원유형 검사 패턴과 동일.
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("member_type")
      .eq("id", studentId)
      .maybeSingle();

    if (profileError) {
      console.error("profiles 조회 오류:", profileError);
      return res.status(500).json({ error: "결제요청에 실패했습니다." });
    }
    if (profile?.member_type !== "student") {
      return res.status(403).json({ error: "학생 회원만 이용할 수 있습니다." });
    }

    // 3) 학부모 연결 재조회 — body 의 parentProfileId 는 신뢰하지 않고 무시한다.
    const { data: link, error: linkError } = await supabaseAdmin
      .from("parent_child_links")
      .select("parent_id")
      .eq("student_id", studentId)
      .eq("status", "approved")
      .limit(1)
      .maybeSingle();

    if (linkError) {
      console.error("parent_child_links 조회 오류:", linkError);
      return res.status(500).json({ error: "결제요청에 실패했습니다." });
    }
    if (!link?.parent_id) {
      return res.status(409).json({ error: "no_linked_parent" });
    }

    // 4) 상품 조회 (서버 신뢰 가격) — api/create-order.js:73-88 패턴 이식.
    const { data: products, error: productError } = await supabaseAdmin
      .from("products")
      .select("id, slug, service_key, name, list_price, price, is_active")
      .in("id", productIds)
      .eq("is_active", true);

    if (productError) {
      console.error("products 조회 오류:", productError);
      return res
        .status(500)
        .json({ error: "상품 정보를 불러오지 못했습니다." });
    }
    if (!products || products.length !== productIds.length) {
      return res
        .status(400)
        .json({ error: "판매 중이 아닌 상품이 포함되어 있습니다." });
    }

    const listTotal = products.reduce(
      (s, p) => s + Number(p.list_price || p.price || 0),
      0,
    );
    const subtotal = products.reduce((s, p) => s + Number(p.price || 0), 0);

    const orderId = `order_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const orderName = buildOrderName(products);

    // 5) fn_request_enrollment 호출 — 쿠폰 인자는 없다(쿠폰은 학부모 수락 단계에서
    //    fn_respond_enrollment 가 적용한다, 사용자 확정). p_items 매핑은
    //    api/create-order.js:122-130 과 동일한 형태를 따른다.
    const { data: rows, error: rpcError } = await supabaseAdmin.rpc(
      "fn_request_enrollment",
      {
        p_order_id: orderId,
        p_student_profile_id: studentId,
        p_parent_profile_id: link.parent_id,
        p_customer_email: customerEmail,
        p_order_name: orderName,
        p_items: products.map((p) => ({
          product_id: p.id,
          product_slug: p.slug,
          service_key: p.service_key,
          name: p.name,
          list_price: Number(p.list_price || p.price || 0),
          price: Number(p.price || 0),
          quantity: 1,
        })),
        p_list_amount: listTotal,
        p_subtotal: subtotal,
      },
    );

    if (rpcError) {
      // DB 에러 원문을 클라이언트에 흘리지 않는다 — errcode 로만 매핑한다.
      // WC042/WC043 은 sql/71 이 fn_request_enrollment 에 추가하는 신규 게이트
      // (advisory lock + fn_is_linked_pair 판정 + 중복 open 요청 검사)의 코드다.
      if (rpcError.code === "WC043") {
        return res.status(409).json({ error: "duplicate_open_request" });
      }
      if (rpcError.code === "WC042") {
        return res.status(409).json({ error: "no_linked_parent" });
      }
      if (rpcError.code === "WC001") {
        return res
          .status(400)
          .json({ error: "결제 금액이 올바르지 않습니다." });
      }
      console.error("fn_request_enrollment 오류:", rpcError);
      return res.status(500).json({ error: "결제요청에 실패했습니다." });
    }

    const row = rows?.[0] ?? {};
    const amount = Number(row.amount ?? 0);
    if (!amount) {
      console.error("fn_request_enrollment 응답에 amount 없음:", rows);
      return res.status(500).json({ error: "결제요청에 실패했습니다." });
    }

    return res.status(200).json({
      orderId: row.order_id ?? orderId,
      orderName,
      listAmount: listTotal,
      discountAmount: Number(row.discount_amount ?? 0),
      amount,
    });
  } catch (err) {
    console.error("request-enrollment error:", err);
    return res.status(500).json({ error: "결제요청에 실패했습니다." });
  }
}
