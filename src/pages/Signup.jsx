import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function Signup() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    email: '',
    password: '',
    name: '',
    phone: ''
  });

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    const { data, error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password
    });

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    const user = data.user;

    if (user) {
      await supabase.from('profiles').insert({
        id: user.id,
        name: form.name,
        phone: form.phone,
        role: 'user'
      });
    }

    setLoading(false);
    navigate('/login');
  }

  return (
    <main className="min-h-screen bg-slate-950 px-6 pt-32 text-white">
      <div className="mx-auto max-w-md rounded-3xl border border-white/10 bg-white/10 p-8 backdrop-blur-xl">
        <h1 className="text-3xl font-extrabold">회원가입</h1>
        <p className="mt-2 text-slate-300">위닝에듀 학습 관리 서비스를 시작하세요.</p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <input
            type="text"
            placeholder="이름"
            className="w-full rounded-xl border border-white/10 bg-white/10 px-4 py-3 outline-none"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />

          <input
            type="tel"
            placeholder="연락처"
            className="w-full rounded-xl border border-white/10 bg-white/10 px-4 py-3 outline-none"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />

          <input
            type="email"
            placeholder="이메일"
            className="w-full rounded-xl border border-white/10 bg-white/10 px-4 py-3 outline-none"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />

          <input
            type="password"
            placeholder="비밀번호"
            className="w-full rounded-xl border border-white/10 bg-white/10 px-4 py-3 outline-none"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
          />

          {message && <p className="text-sm text-red-300">{message}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-blue-600 py-3 font-bold hover:bg-blue-500 disabled:opacity-60"
          >
            {loading ? '가입 처리 중...' : '회원가입'}
          </button>
        </form>
      </div>
    </main>
  );
}
