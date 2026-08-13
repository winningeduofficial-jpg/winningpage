import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { FAKE_ENTITLEMENT_ENABLED, getMockPaidOrders } from '../lib/entitlement';
import MyPageTabs from '../components/mypage/MyPageTabs';
import MyServicesTab from '../components/mypage/MyServicesTab';
import PaymentsTab from '../components/mypage/PaymentsTab';
import ProfileTab from '../components/mypage/ProfileTab';
import ChildrenTab from '../components/mypage/parent/ChildrenTab';
import ParentPaymentsTab from '../components/mypage/parent/ParentPaymentsTab';

function cleanText(value) {
  return String(value || '').trim();
}

function withTimeout(promise, ms, fallbackValue = null) {
  return Promise.race([
    promise,
    new Promise((resolve) => {
      window.setTimeout(() => resolve(fallbackValue), ms);
    })
  ]);
}

async function queryProfile(user) {
  const byId = await withTimeout(
    supabase
      .from('profiles')
      .select('id, name, email, phone, region, school_type, school_name, member_type, role')
      .eq('id', user.id)
      .maybeSingle(),
    3500,
    { data: null, error: new Error('profile_timeout') }
  );

  if (!byId?.error && byId?.data?.name) return byId.data;

  const email = cleanText(user.email).toLowerCase();

  if (email) {
    const byEmail = await withTimeout(
      supabase
        .from('profiles')
        .select('id, name, email, phone, region, school_type, school_name, member_type, role')
        .eq('email', email)
        .maybeSingle(),
      3500,
      { data: null, error: new Error('profile_timeout') }
    );

    if (!byEmail?.error && byEmail?.data?.name) return byEmail.data;
  }

  return byId?.data || {};
}

// 탭 구성 — 회원유형으로 갈린다.
//
// 학생(Figma 3656:374 외): 나의 서비스 / 수강/결제 내역 / 내 정보 수정
// 학부모(Figma 3636:104): 자녀 등록 및 수정 / 수강/결제 내역 / 내 정보 수정
//
// ⚠ 학부모 시안은 리비전마다 탭 수가 다르다 — 2탭(3360:10499), 3탭에 '결제
// 내역'(3610:2365), 3탭에 '수강/결제 내역'(3636:104), 4탭에 '상담 및 문의'
// 추가(3616:2892). 2026-08-13 사용자 확정으로 3636:104(3탭)을 정본으로 삼는다.
// '상담 및 문의'는 내용 디자인도 백엔드도 없어 넣지 않았다.
const STUDENT_TABS = [
  { key: 'services', label: '나의 서비스' },
  { key: 'payments', label: '수강/결제 내역' },
  { key: 'profile', label: '내 정보 수정' }
];

const PARENT_TABS = [
  { key: 'children', label: '자녀 등록 및 수정' },
  { key: 'payments', label: '결제 내역' },
  { key: 'profile', label: '내 정보 수정' }
];

export default function MyPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState([]);
  const [refunds, setRefunds] = useState([]);
  // 학부모 탭 배지용 대기 건수(확정 디자인 3967:3944 "결제 요청 1"·"환불 요청 1").
  const [pendingOrderCount, setPendingOrderCount] = useState(0);

  useEffect(() => {
    let alive = true;

    async function loadProfile() {
      setLoading(true);

      try {
        const sessionResult = await withTimeout(supabase.auth.getSession(), 3500, {
          data: { session: null }
        });
        const currentUser = sessionResult?.data?.session?.user;

        if (!alive) return;

        if (!currentUser) {
          navigate('/login', { replace: true });
          return;
        }

        const loadedProfile = await queryProfile(currentUser);

        if (!alive) return;

        setUser(currentUser);
        setProfile({
          ...loadedProfile,
          id: loadedProfile?.id || currentUser.id,
          email: loadedProfile?.email || currentUser.email || ''
        });
      } catch (error) {
        console.error('마이페이지 로딩 오류:', error);
      } finally {
        if (alive) setLoading(false);
      }
    }

    loadProfile();

    return () => {
      alive = false;
    };
  }, [navigate]);

  // 환불 신청 내역 재조회 — PaymentsTab이 환불 신청 접수 후 호출한다.
  const reloadRefunds = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('refund_requests')
      .select('id, order_id, order_name, amount, gross_amount, reason, status, approval_status, student_profile_id, created_at')
      // orders 와 같은 이유로 쌍 두 축을 함께 본다 — refund_requests.user_id 는
      // "신청한 사람"이라, 학부모가 신청한 환불을 학생이 못 보거나 그 반대가 된다.
      // RLS(sql/68 "refund_requests select own")가 이미 두 축(student_profile_id,
      // parent_profile_id)으로 열려 있어 이 조회와 정확히 맞물린다.
      .or(`student_profile_id.eq.${user.id},parent_profile_id.eq.${user.id}`)
      .order('created_at', { ascending: false });
    setRefunds(data || []);
  }, [user]);

  // 결제 내역 + 환불 신청 내역 로드
  useEffect(() => {
    if (!user) return;
    let alive = true;

    (async () => {
      const [{ data: ord }, { data: reqs }] = await Promise.all([
        supabase
          .from('orders')
          // 가상계좌는 승인 직후 paid 가 아니라 waiting_deposit 으로 기록된다
          // (api/confirm-payment.js — 계좌 발급만 끝난 상태). paid 만 조회하면 입금 전
          // 주문이 마이페이지에서 통째로 사라지므로 두 상태를 함께 읽고, 배지·환불 대상
          // 판정을 위해 status 도 가져온다.
          //
          // method / vat 은 결제 상세 내역 모달(PaymentDetailModal, Figma 3665:6278)이
          // 쓴다. 부가세는 우리가 금액에서 역산하지 않고 토스 승인 응답 원본
          // (orders.raw.vat)을 그대로 읽는다 — raw 전체는 행당 수 KB라 목록 조회에
          // 얹으면 무겁기 때문에 PostgREST JSON 경로로 필요한 한 값만 뽑는다.
          .select('id, order_name, amount, paid_at, status, method, vat:raw->>vat')
          // 쌍 구조(sql/68) — orders.user_id 는 **결제한 사람(학부모)** 축이다.
          // 학생은 student_profile_id 에만 박히므로 user_id 로만 조회하면 학생
          // 계정은 자기가 신청해서 이용 중인 주문을 하나도 못 본다(빈 목록).
          // 두 축을 OR 로 함께 본다 — RLS(orders select)가 이미 쌍 당사자만
          // 통과시키므로 남의 주문이 섞일 여지는 없다.
          .or(`user_id.eq.${user.id},student_profile_id.eq.${user.id}`)
          .in('status', ['paid', 'waiting_deposit'])
          // waiting_deposit 은 paid_at 이 null 이라 paid_at 정렬에서는 순서가 불안정하다.
          // 주문 생성 시각은 항상 존재하므로(orders.created_at not null) 정렬 키로 쓴다.
          .order('created_at', { ascending: false }),
        supabase
          .from('refund_requests')
          .select('id, order_id, order_name, amount, gross_amount, reason, status, approval_status, student_profile_id, created_at')
          // 위 reloadRefunds 와 같은 쌍 두 축 조회(그쪽 주석 참고) — 두 경로가
          // 다른 결과를 주면 환불 신청 직후 표의 상태 배지가 흔들린다.
          .or(`student_profile_id.eq.${user.id},parent_profile_id.eq.${user.id}`)
          .order('created_at', { ascending: false })
      ]);
      if (!alive) return;

      // 로컬 QA 전용: 이용권을 보유한 것으로 가정하는 가짜 결제 내역을 실제 조회 결과
      // 앞에 합친다. "이용 중인 서비스" 목록에는 보이지만(MyServicesTab), 환불 신청
      // 선택 목록에서는 반드시 제외해야 한다(PaymentsTab의 refundableOrders 필터 참고) —
      // 가짜 주문에 환불을 걸면 실제 refund_requests 행이 DB에 생겨 데이터가 오염된다.
      if (FAKE_ENTITLEMENT_ENABLED) {
        console.info('[entitlement] 로컬 가짜 이용권 주문을 마이페이지에 표시합니다.');
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

  const memberType = cleanText(profile?.member_type).toLowerCase();
  const isParent = memberType === 'parent';

  // 결제 대기 주문 건수 — 위 orders 조회는 paid/waiting_deposit 만 읽으므로
  // pending 은 여기서 따로 센다(탭 배지 전용, 목록은 ParentPaymentsTab 이 읽는다).
  useEffect(() => {
    if (!user || !isParent) return undefined;
    let alive = true;

    (async () => {
      const { count } = await supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('parent_profile_id', user.id)
        .eq('status', 'pending')
        .in('approval_status', ['requested', 'approved']);
      if (alive) setPendingOrderCount(count || 0);
    })();

    return () => {
      alive = false;
    };
  }, [user, isParent]);

  const refundRequestCount = refunds.filter((r) => r.approval_status === 'requested').length;

  const tabs = (isParent ? PARENT_TABS : STUDENT_TABS).map((tab) =>
    isParent && tab.key === 'payments'
      ? {
          ...tab,
          badges: [
            { label: '결제 요청', count: pendingOrderCount },
            { label: '환불 요청', count: refundRequestCount }
          ]
        }
      : tab
  );

  const requestedTab = searchParams.get('tab');
  const activeTab = tabs.some((tab) => tab.key === requestedTab) ? requestedTab : tabs[0].key;

  // 구 /mypage#refund 진입 호환 — 결제/환불 내역이 있는 payments 탭으로 매핑한다.
  useEffect(() => {
    if (loading || location.hash !== '#refund' || searchParams.get('tab')) return;
    const next = new URLSearchParams(searchParams);
    next.set('tab', 'payments');
    setSearchParams(next, { replace: true });
  }, [loading, location.hash, searchParams, setSearchParams]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white pt-16 text-ink">
        <div className="rounded-2xl border border-line bg-white px-6 py-4 text-sm font-semibold shadow-[0_18px_45px_rgba(13,27,42,0.10)]">
          개인정보 불러오는 중...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white pt-16">
      <div className="mx-auto w-full max-w-content px-5 py-[7.5rem] sm:px-8">
        <h1 className="text-[2rem] font-semibold leading-[1.3] tracking-[-0.02em] text-ink">
          MY 페이지
        </h1>

        <div className="-mt-[1.0625rem]">
          <MyPageTabs tabs={tabs} activeTab={activeTab} />
        </div>

        <div className="mt-[6.25rem]">
          {activeTab === 'services' && <MyServicesTab orders={orders} />}

          {activeTab === 'children' && <ChildrenTab />}

          {activeTab === 'payments' && (
            <>
              {/* 학부모만 — 학생이 만든 결제요청을 발견하는 경로(handoff 작업 1·2).
                  학생 화면에는 인박스 개념 자체가 없다(요청을 만드는 쪽이라서). */}
              {isParent ? (
                <ParentPaymentsTab
                  orders={orders}
                  refunds={refunds}
                  onRefundSubmitted={reloadRefunds}
                />
              ) : (
                <PaymentsTab orders={orders} refunds={refunds} onRefundSubmitted={reloadRefunds} />
              )}
            </>
          )}

          {activeTab === 'profile' && (
            <ProfileTab user={user} profile={profile} memberType={memberType} />
          )}
        </div>
      </div>
    </main>
  );
}
