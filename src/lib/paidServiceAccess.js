import { supabase } from './supabase';

const PAID_MESSAGE = '유료결제이후 이용해주세요!';

const PAID_SERVICE_CONFIGS = [
  {
    programKey: 'suhaeng',
    serviceName: 'AI 수행평가 서비스',
    keyword: '수행',
    targetUrl: import.meta.env.VITE_SUHAENG_SERVICE_URL || 'https://suhaengpyeong-main.vercel.app',
    match(service = {}) {
      const text = [service.name, service.title, service.label, service.description, service.desc, service.link, service.to]
        .map((v) => String(v || '').toLowerCase())
        .join(' ');

      return (
        text.includes('수행') ||
        text.includes('assessment') ||
        text.includes('services-ai-performance') ||
        text.includes('services#ai')
      );
    }
  }
];

function clean(value) {
  return String(value || '').trim();
}

function normalizePaidStatus(value) {
  return clean(value).toLowerCase().replace(/\s/g, '');
}

function isPaidStatus(value) {
  const status = normalizePaidStatus(value);
  return [
    'paid',
    'active',
    '완납',
    '납부완료',
    '결제완료',
    '결제완료됨',
    '결제완료/이용중',
    '이용중'
  ].some((item) => status.includes(item));
}

function isActiveStatus(value) {
  const status = normalizePaidStatus(value);
  if (!status) return true;
  return ['active', '활성', '사용중', '이용중', '정상'].some((item) => status.includes(item));
}

export function getPaidServiceConfig(service) {
  return PAID_SERVICE_CONFIGS.find((config) => config.match(service)) || null;
}

async function checkProgramAccessTable(userId, programKey) {
  const selectors = [
    { column: 'id', value: userId },
    { column: 'user_id', value: userId },
    { column: 'profile_id', value: userId }
  ];

  for (const selector of selectors) {
    try {
      const { data, error } = await supabase
        .from('program_access')
        .select('id, program_key, payment_status, access_status')
        .eq(selector.column, selector.value)
        .eq('program_key', programKey)
        .maybeSingle();

      if (error || !data) continue;

      if (isPaidStatus(data.payment_status) && isActiveStatus(data.access_status)) {
        return true;
      }
    } catch (error) {
      console.warn(`program_access ${selector.column} 확인 실패:`, error);
    }
  }

  return false;
}

async function checkEnrollmentPayment(userId, config) {
  try {
    const { data, error } = await supabase
      .from('admin_enrollments')
      .select('id, profile_id, category_name, program_name, class_name, payment_status, application_status')
      .eq('profile_id', userId)
      .limit(80);

    if (error || !Array.isArray(data)) return false;

    return data.some((row) => {
      const nameText = [row.category_name, row.program_name, row.class_name]
        .map((v) => clean(v))
        .join(' ');
      const serviceMatched = nameText.includes(config.keyword) || nameText.includes(config.serviceName);
      return serviceMatched && isPaidStatus(row.payment_status);
    });
  } catch (error) {
    console.warn('admin_enrollments 결제 확인 실패:', error);
    return false;
  }
}

export async function hasPaidServiceAccess(session, config) {
  const userId = session?.user?.id;
  if (!userId || !config?.programKey) return false;

  const byProgramAccess = await checkProgramAccessTable(userId, config.programKey);
  if (byProgramAccess) return true;

  return checkEnrollmentPayment(userId, config);
}

function buildServiceUrlWithSession(targetUrl, session, programKey) {
  const url = new URL(targetUrl, window.location.origin);
  const params = new URLSearchParams();

  params.set('service', programKey);
  params.set('source', 'winningpage');
  params.set('access_token', session.access_token);
  params.set('refresh_token', session.refresh_token);

  url.hash = params.toString();
  return url.toString();
}

export async function openPaidServiceOrAlert(event, service) {
  const config = getPaidServiceConfig(service);
  if (!config) return false;

  event?.preventDefault?.();
  event?.stopPropagation?.();

  try {
    const { data } = await supabase.auth.getSession();
    const session = data?.session;

    if (!session?.user || !session?.access_token || !session?.refresh_token) {
      window.alert(PAID_MESSAGE);
      return true;
    }

    const allowed = await hasPaidServiceAccess(session, config);

    if (!allowed) {
      window.alert(PAID_MESSAGE);
      return true;
    }

    window.location.href = buildServiceUrlWithSession(config.targetUrl, session, config.programKey);
    return true;
  } catch (error) {
    console.error('유료 서비스 접근 확인 오류:', error);
    window.alert(PAID_MESSAGE);
    return true;
  }
}
