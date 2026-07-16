import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { PackageCheck, RotateCcw, Save, UserRound } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatKRW } from '../data/pricingCatalog';
import { COMPANY } from '../data/company';

const REFUND_STATUS = {
  requested: { label: '접수', cls: 'border-amber-200 bg-amber-50 text-amber-700' },
  processing: { label: '처리중', cls: 'border-blue-200 bg-blue-50 text-blue-700' },
  completed: { label: '환불완료', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  rejected: { label: '반려', cls: 'border-rose-200 bg-rose-50 text-rose-700' },
};
function refundStatus(s) {
  return REFUND_STATUS[s] || REFUND_STATUS.requested;
}
const REFUND_EMPTY = { orderId: '', reason: '', bank: '', account: '', holder: '' };

const SCHOOL_TYPES = ['초등학교', '중학교', '고등학교', 'N수생', '기타'];
const MEMBER_TYPES = ['학생', '학부모', '멘토', '기타'];
const REGION_OPTIONS = [
  '서울',
  '부산',
  '대구',
  '인천',
  '광주',
  '대전',
  '울산',
  '세종',
  '경기',
  '강원',
  '충북',
  '충남',
  '전북',
  '전남',
  '경북',
  '경남',
  '제주',
  '기타'
];

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

export default function MyPage() {
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [profileId, setProfileId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const location = useLocation();
  const [orders, setOrders] = useState([]);
  const [refunds, setRefunds] = useState([]);
  const [refundForm, setRefundForm] = useState(REFUND_EMPTY);
  const [refundSaving, setRefundSaving] = useState(false);
  const [refundMsg, setRefundMsg] = useState('');
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    region: '',
    school_type: '',
    school_name: '',
    member_type: ''
  });

  useEffect(() => {
    let alive = true;

    async function loadProfile() {
      setLoading(true);

      try {
        const sessionResult = await withTimeout(
          supabase.auth.getSession(),
          3500,
          { data: { session: null } }
        );
        const currentUser = sessionResult?.data?.session?.user;

        if (!alive) return;

        if (!currentUser) {
          navigate('/login', { replace: true });
          return;
        }

        const profile = await queryProfile(currentUser);

        if (!alive) return;

        setUser(currentUser);
        setProfileId(profile?.id || currentUser.id);

        setForm({
          name: profile?.name || '',
          email: profile?.email || currentUser.email || '',
          phone: profile?.phone || '',
          region: profile?.region || '',
          school_type: profile?.school_type || '',
          school_name: profile?.school_name || '',
          member_type: profile?.member_type || ''
        });
      } catch (error) {
        console.error('마이페이지 로딩 오류:', error);
        setMessage('개인정보를 불러오지 못했습니다.');
      } finally {
        if (alive) setLoading(false);
      }
    }

    loadProfile();

    return () => {
      alive = false;
    };
  }, [navigate]);

  // 결제 내역 + 환불 신청 내역 로드
  useEffect(() => {
    if (!user) return;
    let alive = true;

    (async () => {
      const [{ data: ord }, { data: reqs }] = await Promise.all([
        supabase
          .from('orders')
          .select('id, order_name, amount, paid_at')
          .eq('user_id', user.id)
          .eq('status', 'paid')
          .order('paid_at', { ascending: false }),
        supabase
          .from('refund_requests')
          .select('id, order_id, order_name, amount, reason, status, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
      ]);
      if (!alive) return;
      setOrders(ord || []);
      setRefunds(reqs || []);
    })();

    return () => {
      alive = false;
    };
  }, [user]);

  // /mypage#refund 로 진입 시 환불 섹션으로 스크롤
  useEffect(() => {
    if (loading || location.hash !== '#refund') return;
    const el = document.getElementById('refund');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [loading, location.hash]);

  function updateForm(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateRefund(key, value) {
    setRefundForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submitRefund(e) {
    e.preventDefault();
    if (!user) return;

    const order = orders.find((o) => o.id === refundForm.orderId);
    if (!order) {
      setRefundMsg('환불할 결제 내역을 선택해 주세요.');
      return;
    }
    if (!cleanText(refundForm.reason)) {
      setRefundMsg('환불 사유를 입력해 주세요.');
      return;
    }

    setRefundSaving(true);
    setRefundMsg('');

    const { error } = await supabase.from('refund_requests').insert({
      user_id: user.id,
      order_id: order.id,
      order_name: order.order_name,
      amount: order.amount,
      reason: cleanText(refundForm.reason),
      refund_bank: cleanText(refundForm.bank),
      refund_account: cleanText(refundForm.account),
      refund_holder: cleanText(refundForm.holder),
      status: 'requested',
    });

    setRefundSaving(false);

    if (error) {
      console.error('환불 신청 저장 실패:', error);
      setRefundMsg('환불 신청에 실패했습니다. 잠시 후 다시 시도해 주세요.');
      return;
    }

    setRefundMsg('환불 신청이 접수되었습니다. 환불규정에 따라 검토 후 안내드리겠습니다.');
    setRefundForm(REFUND_EMPTY);

    const { data: reqs } = await supabase
      .from('refund_requests')
      .select('id, order_id, order_name, amount, reason, status, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    setRefunds(reqs || []);
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (!user) return;

    const name = cleanText(form.name);
    const email = cleanText(form.email || user.email).toLowerCase();
    const username = email;

    if (!name) {
      setMessage('이름을 입력해 주세요.');
      return;
    }

    setSaving(true);
    setMessage('');

    const payload = {
      id: profileId || user.id,
      name,
      username,
      email,
      phone: cleanText(form.phone),
      region: form.region,
      school_type: form.school_type,
      school_name: cleanText(form.school_name),
      member_type: form.member_type,
      updated_at: new Date().toISOString()
    };

    const { error } = await supabase
      .from('profiles')
      .upsert(payload, { onConflict: 'id' });

    setSaving(false);

    if (error) {
      console.error('프로필 저장 실패:', error);
      setMessage('저장에 실패했습니다. 다시 확인해 주세요.');
      return;
    }

    try {
      await supabase.auth.updateUser({
        data: {
          name,
          full_name: name,
          member_type: form.member_type
        }
      });
    } catch (metadataError) {
      console.error('인증 메타데이터 저장 오류:', metadataError);
    }

    window.dispatchEvent(new Event('winning-profile-updated'));
    setMessage('개인정보가 저장되었습니다.');
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F7F4EF] pt-[84px] text-[#0D1B2A]">
        <div className="rounded-2xl border border-[#0D1B2A]/10 bg-white px-6 py-4 text-sm font-extrabold shadow-[0_18px_45px_rgba(13,27,42,0.10)]">
          개인정보 불러오는 중...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F7F4EF] px-6 pt-28 pb-20 text-[#0D1B2A]">
      <section className="mx-auto max-w-3xl rounded-[34px] border border-[#0D1B2A]/10 bg-white p-8 shadow-[0_24px_70px_rgba(13,27,42,0.12)]">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0D1B2A] text-white">
            <UserRound size={26} />
          </div>

          <div>
            <p className="text-sm font-black text-[#B88737]">MY PAGE</p>
            <h1 className="mt-1 text-3xl font-black tracking-[-0.04em]">개인정보 수정</h1>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 grid gap-5 md:grid-cols-2">
          <label className="block">
            <span className="text-sm font-black">이름</span>
            <input
              className="mt-2 w-full rounded-2xl border border-[#0D1B2A]/12 bg-[#F8F7F3] px-4 py-3 font-bold outline-none focus:border-[#B88737] focus:bg-white"
              value={form.name}
              onChange={(e) => updateForm('name', e.target.value)}
              placeholder="이름 입력"
            />
          </label>

          <label className="block">
            <span className="text-sm font-black">이메일</span>
            <input
              className="mt-2 w-full rounded-2xl border border-[#0D1B2A]/12 bg-slate-100 px-4 py-3 font-bold text-slate-500 outline-none"
              value={form.email}
              readOnly
            />
          </label>

          <label className="block">
            <span className="text-sm font-black">휴대전화번호</span>
            <input
              className="mt-2 w-full rounded-2xl border border-[#0D1B2A]/12 bg-[#F8F7F3] px-4 py-3 font-bold outline-none focus:border-[#B88737] focus:bg-white"
              value={form.phone}
              onChange={(e) => updateForm('phone', e.target.value)}
              placeholder="010-0000-0000"
            />
          </label>

          <label className="block">
            <span className="text-sm font-black">지역</span>
            <select
              className="mt-2 w-full rounded-2xl border border-[#0D1B2A]/12 bg-[#F8F7F3] px-4 py-3 font-bold outline-none focus:border-[#B88737] focus:bg-white"
              value={form.region}
              onChange={(e) => updateForm('region', e.target.value)}
            >
              <option value="">선택</option>
              {REGION_OPTIONS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-black">재학 구분</span>
            <select
              className="mt-2 w-full rounded-2xl border border-[#0D1B2A]/12 bg-[#F8F7F3] px-4 py-3 font-bold outline-none focus:border-[#B88737] focus:bg-white"
              value={form.school_type}
              onChange={(e) => updateForm('school_type', e.target.value)}
            >
              <option value="">선택</option>
              {SCHOOL_TYPES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-black">학교명</span>
            <input
              className="mt-2 w-full rounded-2xl border border-[#0D1B2A]/12 bg-[#F8F7F3] px-4 py-3 font-bold outline-none focus:border-[#B88737] focus:bg-white"
              value={form.school_name}
              onChange={(e) => updateForm('school_name', e.target.value)}
              placeholder="학교명 입력"
            />
          </label>

          <label className="block">
            <span className="text-sm font-black">회원 유형</span>
            <select
              className="mt-2 w-full rounded-2xl border border-[#0D1B2A]/12 bg-[#F8F7F3] px-4 py-3 font-bold outline-none focus:border-[#B88737] focus:bg-white"
              value={form.member_type}
              onChange={(e) => updateForm('member_type', e.target.value)}
            >
              <option value="">선택</option>
              {MEMBER_TYPES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <div className="md:col-span-2">
            {message && (
              <div className="mb-4 rounded-2xl border border-[#0D1B2A]/10 bg-[#F8F7F3] px-4 py-3 text-sm font-bold text-[#0D1B2A]">
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#0D1B2A] px-7 py-3 text-sm font-black text-white shadow-[0_16px_34px_rgba(13,27,42,0.22)] transition hover:bg-[#162A40] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Save size={18} />
              {saving ? '저장 중...' : '저장하기'}
            </button>
          </div>
        </form>
      </section>

      {/* 이용 중인 서비스 (결제 완료 건) */}
      {orders.length > 0 && (
        <section className="mx-auto mt-8 max-w-3xl rounded-[34px] border border-[#0D1B2A]/10 bg-white p-8 shadow-[0_24px_70px_rgba(13,27,42,0.12)]">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0D1B2A] text-white">
              <PackageCheck size={24} />
            </div>
            <div>
              <p className="text-sm font-black text-[#B88737]">MY SERVICE</p>
              <h2 className="mt-1 text-3xl font-black tracking-[-0.04em]">이용 중인 서비스</h2>
            </div>
          </div>

          <ul className="mt-6 space-y-3">
            {orders.map((o) => (
              <li
                key={o.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-[#0D1B2A]/10 bg-[#F8F7F3] px-5 py-4"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-[#0D1B2A]">{o.order_name}</p>
                  <p className="mt-0.5 text-xs font-bold text-[#8B95A1]">
                    {formatKRW(o.amount)}
                    {o.paid_at ? ` · ${String(o.paid_at).slice(0, 10)} 결제` : ''}
                  </p>
                </div>
                <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
                  결제완료
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50/50 px-5 py-4">
            <p className="text-sm font-black text-[#0D1B2A]">이용 안내</p>
            <p className="mt-1.5 break-keep text-[13px] leading-relaxed text-[#5B6573]">
              담당 매니저가 등록하신 연락처(카카오톡·이메일·전화)로 서비스 이용 방법을 안내드립니다. 서비스별 진행 방식은
              이용약관 및 담당자 안내를 따릅니다.
            </p>
            <p className="mt-2 text-xs font-bold text-[#8B95A1]">
              문의: 카카오톡 {COMPANY.kakao} · 대표전화 {COMPANY.tel} · 센터문의 {COMPANY.centerTel}
            </p>
          </div>
        </section>
      )}

      {/* 환불 신청 */}
      <section
        id="refund"
        className="mx-auto mt-8 max-w-3xl scroll-mt-28 rounded-[34px] border border-[#0D1B2A]/10 bg-white p-8 shadow-[0_24px_70px_rgba(13,27,42,0.12)]"
      >
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0D1B2A] text-white">
            <RotateCcw size={24} />
          </div>
          <div>
            <p className="text-sm font-black text-[#B88737]">REFUND</p>
            <h2 className="mt-1 text-3xl font-black tracking-[-0.04em]">환불 신청</h2>
          </div>
        </div>

        <p className="mt-4 text-sm font-bold leading-6 text-[#5B6573]">
          환불 기준은 서비스별로 상이하며, 자세한 내용은{' '}
          <Link to="/refund" className="text-[#B88737] underline underline-offset-2">
            환불규정
          </Link>
          을 따릅니다. 신청 접수 후 검토 결과를 안내드립니다.
        </p>

        {orders.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-[#0D1B2A]/10 bg-[#F8F7F3] px-5 py-6 text-center text-sm font-bold text-[#5B6573]">
            환불 신청 가능한 결제 내역이 없습니다.
          </div>
        ) : (
          <form onSubmit={submitRefund} className="mt-6 grid gap-5">
            <label className="block">
              <span className="text-sm font-black">환불할 결제 내역</span>
              <select
                className="mt-2 w-full rounded-2xl border border-[#0D1B2A]/12 bg-[#F8F7F3] px-4 py-3 font-bold outline-none focus:border-[#B88737] focus:bg-white"
                value={refundForm.orderId}
                onChange={(e) => updateRefund('orderId', e.target.value)}
              >
                <option value="">결제 내역 선택</option>
                {orders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.order_name} · {formatKRW(o.amount)}
                    {o.paid_at ? ` · ${String(o.paid_at).slice(0, 10)}` : ''}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-black">환불 사유</span>
              <textarea
                rows={3}
                className="mt-2 w-full resize-none rounded-2xl border border-[#0D1B2A]/12 bg-[#F8F7F3] px-4 py-3 font-bold outline-none focus:border-[#B88737] focus:bg-white"
                value={refundForm.reason}
                onChange={(e) => updateRefund('reason', e.target.value)}
                placeholder="환불 사유를 입력해 주세요."
              />
            </label>

            <div>
              <p className="text-sm font-black">환불 계좌 <span className="font-bold text-[#8B95A1]">(현금성 결제·계좌 환불 시)</span></p>
              <div className="mt-2 grid gap-3 sm:grid-cols-3">
                <input
                  className="w-full rounded-2xl border border-[#0D1B2A]/12 bg-[#F8F7F3] px-4 py-3 font-bold outline-none focus:border-[#B88737] focus:bg-white"
                  value={refundForm.bank}
                  onChange={(e) => updateRefund('bank', e.target.value)}
                  placeholder="은행명"
                />
                <input
                  className="w-full rounded-2xl border border-[#0D1B2A]/12 bg-[#F8F7F3] px-4 py-3 font-bold outline-none focus:border-[#B88737] focus:bg-white"
                  value={refundForm.account}
                  onChange={(e) => updateRefund('account', e.target.value)}
                  placeholder="계좌번호"
                />
                <input
                  className="w-full rounded-2xl border border-[#0D1B2A]/12 bg-[#F8F7F3] px-4 py-3 font-bold outline-none focus:border-[#B88737] focus:bg-white"
                  value={refundForm.holder}
                  onChange={(e) => updateRefund('holder', e.target.value)}
                  placeholder="예금주"
                />
              </div>
              <p className="mt-2 text-xs font-bold text-[#8B95A1]">
                ※ 카드 결제 건은 원칙적으로 원결제 취소(카드 취소)로 환불되며, 계좌 정보는 부분·현금 환불 시 사용됩니다.
              </p>
            </div>

            {refundMsg && (
              <div className="rounded-2xl border border-[#0D1B2A]/10 bg-[#F8F7F3] px-4 py-3 text-sm font-bold text-[#0D1B2A]">
                {refundMsg}
              </div>
            )}

            <div>
              <button
                type="submit"
                disabled={refundSaving}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#0D1B2A] px-7 py-3 text-sm font-black text-white shadow-[0_16px_34px_rgba(13,27,42,0.22)] transition hover:bg-[#162A40] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RotateCcw size={18} />
                {refundSaving ? '접수 중...' : '환불 신청'}
              </button>
            </div>
          </form>
        )}

        {refunds.length > 0 && (
          <div className="mt-8 border-t border-[#0D1B2A]/10 pt-6">
            <h3 className="text-lg font-black">환불 신청 내역</h3>
            <ul className="mt-4 space-y-3">
              {refunds.map((r) => {
                const st = refundStatus(r.status);
                return (
                  <li
                    key={r.id}
                    className="rounded-2xl border border-[#0D1B2A]/10 bg-[#F8F7F3] px-5 py-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-[#0D1B2A]">{r.order_name}</p>
                        <p className="mt-0.5 text-xs font-bold text-[#8B95A1]">
                          {formatKRW(r.amount)}
                          {r.created_at ? ` · ${String(r.created_at).slice(0, 10)}` : ''}
                        </p>
                        {r.reason && <p className="mt-1.5 break-keep text-xs font-bold text-[#5B6573]">사유: {r.reason}</p>}
                      </div>
                      <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-black ${st.cls}`}>
                        {st.label}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>
    </main>
  );
}
