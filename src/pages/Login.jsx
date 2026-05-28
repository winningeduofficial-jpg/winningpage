import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function handleLogin(e) {
    e.preventDefault();

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      alert(error.message);
      return;
    }

    navigate('/');
  }

  return (
    <main className="min-h-screen bg-slate-950 px-6 pt-32 text-white">
      <div className="mx-auto max-w-md rounded-3xl border border-white/10 bg-white/10 p-8 backdrop-blur-xl">
        <h1 className="text-3xl font-extrabold">로그인</h1>

        <form onSubmit={handleLogin} className="mt-8 space-y-4">
          <input
            type="email"
            placeholder="이메일"
            className="w-full rounded-xl border border-white/10 bg-white/10 px-4 py-3 outline-none"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <input
            type="password"
            placeholder="비밀번호"
            className="w-full rounded-xl border border-white/10 bg-white/10 px-4 py-3 outline-none"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <button className="w-full rounded-xl bg-blue-600 py-3 font-bold hover:bg-blue-500">
            로그인
          </button>
        </form>
      </div>
    </main>
  );
}
