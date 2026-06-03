import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Save, UserRound } from 'lucide-react';
import { supabase } from '../lib/supabase';

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

export default function MyPage() {
  const navigate = useNavigate();

  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({
    name: '',
    username: '',
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
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;

      if (!alive) return;

      if (!user) {
        navigate('/login', { replace: true });
        return;
      }

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('name, username, email, phone, region, school_type, school_name, member_type')
        .eq('id', user.id)
        .maybeSingle();

      if (!alive) return;

      if (error) {
        setMessage('개인정보를 불러오지 못했습니다.');
        setLoading(false);
        return;
      }

      setUserId(user.id);
      setForm({
        name: profile?.name || '',
        username: profile?.username || '',
        email: profile?.email || user.email || '',
        phone: profile?.phone || '',
        region: profile?.region || '',
        school_type: profile?.school_type || '',
        school_name: profile?.school_name || '',
        member_type: profile?.member_type || ''
      });
      setLoading(false);
    }

    loadProfile();

    return () => {
      alive = false;
    };
  }, [navigate]);

  function updateForm(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (!userId) return;
    if (!form.name.trim()) {
      setMessage('이름을 입력해 주세요.');
      return;
    }

    setSaving(true);
    setMessage('');

    const { error } = await supabase
      .from('profiles')
      .update({
        name: form.name.trim(),
        phone: form.phone.trim(),
        region: form.region,
        school_type: form.school_type,
        school_name: form.school_name.trim(),
        member_type: form.member_type,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    setSaving(false);

    if (error) {
      setMessage('저장에 실패했습니다. 다시 확인해 주세요.');
      return;
    }

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
              className="mt-2 h-13 w-full rounded-2xl border border-[#0D1B2A]/12 bg-[#F8F7F3] px-4 py-3 font-bold outline-none focus:border-[#B88737] focus:bg-white"
              value={form.name}
              onChange={(e) => updateForm('name', e.target.value)}
            />
          </label>

          <label className="block">
            <span className="text-sm font-black">아이디</span>
            <input
              className="mt-2 h-13 w-full rounded-2xl border border-[#0D1B2A]/12 bg-slate-100 px-4 py-3 font-bold text-slate-500 outline-none"
              value={form.username}
              readOnly
            />
          </label>

          <label className="block">
            <span className="text-sm font-black">이메일</span>
            <input
              className="mt-2 h-13 w-full rounded-2xl border border-[#0D1B2A]/12 bg-slate-100 px-4 py-3 font-bold text-slate-500 outline-none"
              value={form.email}
              readOnly
            />
          </label>

          <label className="block">
            <span className="text-sm font-black">휴대전화번호</span>
            <input
              className="mt-2 h-13 w-full rounded-2xl border border-[#0D1B2A]/12 bg-[#F8F7F3] px-4 py-3 font-bold outline-none focus:border-[#B88737] focus:bg-white"
              value={form.phone}
              onChange={(e) => updateForm('phone', e.target.value)}
              placeholder="010-0000-0000"
            />
          </label>

          <label className="block">
            <span className="text-sm font-black">지역</span>
            <select
              className="mt-2 h-13 w-full rounded-2xl border border-[#0D1B2A]/12 bg-[#F8F7F3] px-4 py-3 font-bold outline-none focus:border-[#B88737] focus:bg-white"
              value={form.region}
              onChange={(e) => updateForm('region', e.target.value)}
            >
              <option value="">선택</option>
              {REGION_OPTIONS.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-black">회원 유형</span>
            <select
              className="mt-2 h-13 w-full rounded-2xl border border-[#0D1B2A]/12 bg-[#F8F7F3] px-4 py-3 font-bold outline-none focus:border-[#B88737] focus:bg-white"
              value={form.member_type}
              onChange={(e) => updateForm('member_type', e.target.value)}
            >
              <option value="">선택</option>
              {MEMBER_TYPES.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-black">재학 구분</span>
            <select
              className="mt-2 h-13 w-full rounded-2xl border border-[#0D1B2A]/12 bg-[#F8F7F3] px-4 py-3 font-bold outline-none focus:border-[#B88737] focus:bg-white"
              value={form.school_type}
              onChange={(e) => updateForm('school_type', e.target.value)}
            >
              <option value="">선택</option>
              {SCHOOL_TYPES.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-black">학교명</span>
            <input
              className="mt-2 h-13 w-full rounded-2xl border border-[#0D1B2A]/12 bg-[#F8F7F3] px-4 py-3 font-bold outline-none focus:border-[#B88737] focus:bg-white"
              value={form.school_name}
              onChange={(e) => updateForm('school_name', e.target.value)}
              placeholder="학교명을 입력하세요"
            />
          </label>

          {message && (
            <div className="md:col-span-2 rounded-2xl border border-[#0D1B2A]/10 bg-[#F8F7F3] px-4 py-3 text-sm font-black text-[#0D1B2A]">
              {message}
            </div>
          )}

          <div className="md:col-span-2 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex h-13 items-center gap-2 rounded-2xl bg-[#0D1B2A] px-7 py-3 font-black text-white shadow-[0_16px_34px_rgba(13,27,42,0.22)] transition hover:bg-[#162A40] disabled:opacity-60"
            >
              <Save size={18} />
              {saving ? '저장 중...' : '저장하기'}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
