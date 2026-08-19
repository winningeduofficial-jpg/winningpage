import { useCallback, useEffect, useState } from "react";
import { FAKE_ENTITLEMENT_ENABLED, getMockPaidOrders } from "@/lib/entitlement";
import { supabase } from "@/lib/supabase";
import type { SessionUser } from "./useMyPageProfile";

export type Order = {
  id: string;
  order_name?: string;
  amount: number;
  paid_at?: string;
  status?: string;
  approval_status?: string;
  method?: string;
  vat?: number | string | null;
  is_fake_entitlement?: boolean;
  order_items?: { name: string }[];
};

export type Refund = {
  id: string;
  order_id?: string;
  order_name?: string;
  amount: number;
  gross_amount?: number | null;
  reason?: string;
  status?: string;
  approval_status?: string;
  student_profile_id?: string;
  created_at?: string;
};

// 결제 내역 + 환불 신청 내역. user가 정해지면 1회 로드하고, reloadRefunds는
// PaymentsTab이 환불 신청 접수 후 환불 목록만 다시 불러올 때 쓴다.
export function useMyPageOrders(user: SessionUser | null) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [refunds, setRefunds] = useState<Refund[]>([]);

  const reloadRefunds = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("refund_requests")
      .select(
        "id, order_id, order_name, amount, gross_amount, reason, status, approval_status, student_profile_id, created_at",
      )
      // orders 와 같은 이유로 쌍 두 축을 함께 본다 — refund_requests.user_id 는
      // "신청한 사람"이라, 학부모가 신청한 환불을 학생이 못 보거나 그 반대가 된다.
      // RLS(sql/68 "refund_requests select own")가 이미 두 축(student_profile_id,
      // parent_profile_id)으로 열려 있어 이 조회와 정확히 맞물린다.
      .or(`student_profile_id.eq.${user.id},parent_profile_id.eq.${user.id}`)
      .order("created_at", { ascending: false });
    setRefunds(data || []);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let alive = true;

    (async () => {
      const [{ data: ord }, { data: reqs }] = await Promise.all([
        supabase
          .from("orders")
          // 가상계좌는 승인 직후 paid 가 아니라 waiting_deposit 으로 기록된다
          // (api/confirm-payment.js — 계좌 발급만 끝난 상태). paid 만 조회하면 입금 전
          // 주문이 마이페이지에서 통째로 사라지므로 두 상태를 함께 읽고, 배지·환불 대상
          // 판정을 위해 status 도 가져온다.
          //
          // method / vat 은 결제 상세 내역 모달(PaymentDetailModal, Figma 3665:6278)이
          // 쓴다. 부가세는 우리가 금액에서 역산하지 않고 토스 승인 응답 원본
          // (orders.raw.vat)을 그대로 읽는다 — raw 전체는 행당 수 KB라 목록 조회에
          // 얹으면 무겁기 때문에 PostgREST JSON 경로로 필요한 한 값만 뽑는다.
          .select(
            "id, order_name, amount, paid_at, status, approval_status, method, vat:raw->>vat, order_items(name)",
          )
          // 쌍 구조(sql/68) — orders.user_id 는 **결제한 사람(학부모)** 축이다.
          // 학생은 student_profile_id 에만 박히므로 user_id 로만 조회하면 학생
          // 계정은 자기가 신청해서 이용 중인 주문을 하나도 못 본다(빈 목록).
          // 두 축을 OR 로 함께 본다 — RLS(orders select)가 이미 쌍 당사자만
          // 통과시키므로 남의 주문이 섞일 여지는 없다.
          .or(`user_id.eq.${user.id},student_profile_id.eq.${user.id}`)
          .in("status", [
            "pending",
            "paid",
            "waiting_deposit",
            "canceled",
            "refunded",
          ])
          // waiting_deposit 은 paid_at 이 null 이라 paid_at 정렬에서는 순서가 불안정하다.
          // 주문 생성 시각은 항상 존재하므로(orders.created_at not null) 정렬 키로 쓴다.
          .order("created_at", { ascending: false }),
        supabase
          .from("refund_requests")
          .select(
            "id, order_id, order_name, amount, gross_amount, reason, status, approval_status, student_profile_id, created_at",
          )
          // 위 reloadRefunds 와 같은 쌍 두 축 조회(그쪽 주석 참고) — 두 경로가
          // 다른 결과를 주면 환불 신청 직후 표의 상태 배지가 흔들린다.
          .or(
            `student_profile_id.eq.${user.id},parent_profile_id.eq.${user.id}`,
          )
          .order("created_at", { ascending: false }),
      ]);
      if (!alive) return;

      // 로컬 QA 전용: 이용권을 보유한 것으로 가정하는 가짜 결제 내역을 실제 조회 결과
      // 앞에 합친다. "이용 중인 서비스" 목록에는 보이지만(MyServicesTab), 환불 신청
      // 선택 목록에서는 반드시 제외해야 한다(PaymentsTab의 refundableOrders 필터 참고) —
      // 가짜 주문에 환불을 걸면 실제 refund_requests 행이 DB에 생겨 데이터가 오염된다.
      if (FAKE_ENTITLEMENT_ENABLED) {
        console.info(
          "[entitlement] 로컬 가짜 이용권 주문을 마이페이지에 표시합니다.",
        );
        setOrders([...getMockPaidOrders(), ...(ord || [])]);
      } else {
        setOrders(ord || []);
      }

      setRefunds(reqs || []);
    })();

    return () => {
      alive = false;
    };
  }, [user]);

  return { orders, refunds, reloadRefunds };
}
