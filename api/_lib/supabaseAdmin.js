// service_role 키로 만드는 Supabase 관리자 클라이언트.
//
// 기존 api/ 파일들이 각자 같은 코드를 들고 있었는데(create-order.js,
// confirm-payment.js, create-service-ticket.js), 신규 파일부터는 여기로 모은다.
// 기존 파일은 동작 중이라 이 커밋에서 건드리지 않는다.
//
// 이 클라이언트는 RLS를 통째로 우회한다. 그래서 이걸 쓰는 라우트는 "누가
// 무엇을 할 수 있는지"를 스스로 검사해야 한다.

import { createClient } from '@supabase/supabase-js';

export function getEnv(...keys) {
  for (const key of keys) {
    const value = String(process.env[key] || '').trim();
    if (value) return value;
  }
  return '';
}

let cached = null;

export function createSupabaseAdmin() {
  if (cached) return cached;

  const url = getEnv('WINNING_SUPABASE_URL', 'SUPABASE_URL', 'VITE_SUPABASE_URL');
  const key = getEnv(
    'WINNING_SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'WINNING_SUPABASE_KEY',
    'SUPABASE_KEY'
  );

  if (!url || !key) {
    throw new Error(
      'WINNING_SUPABASE_URL / WINNING_SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다.'
    );
  }

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  return cached;
}
