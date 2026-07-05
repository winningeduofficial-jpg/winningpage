import { supabase } from './supabase';

const PAID_MESSAGE = '유료결제이후 이용해주세요!';

const PAID_SERVICE_CONFIGS = [
  {
    serviceKey: 'suhaeng',
    serviceName: 'AI 수행평가 서비스',
    match(service = {}) {
      const text = [service.name, service.title, service.label, service.description, service.desc, service.link, service.to, service.slug]
        .map((v) => String(v || '').toLowerCase())
        .join(' ');

      return (
        text.includes('수행') ||
        text.includes('수행평가') ||
        text.includes('assessment') ||
        text.includes('services-ai-performance') ||
        text.includes('services/assessment') ||
        text.includes('services#ai')
      );
    }
  },
  {
    serviceKey: 'goal',
    serviceName: '목표관리 서비스',
    match(service = {}) {
      const text = [service.name, service.title, service.label, service.description, service.desc, service.link, service.to, service.slug]
        .map((v) => String(v || '').toLowerCase())
        .join(' ');

      return (
        text.includes('목표관리') ||
        text.includes('목표 관리') ||
        text.includes('목표') ||
        text.includes('goal') ||
        text.includes('target-main') ||
        text.includes('target') ||
        text.includes('services#goal')
      );
    }
  }
];

export function getPaidServiceConfig(service) {
  return PAID_SERVICE_CONFIGS.find((config) => config.match(service)) || null;
}

function openNormalLink(link) {
  if (!link) return;

  if (/^https?:\/\//i.test(link)) {
    window.location.href = link;
    return;
  }

  window.location.href = link;
}

export async function openPaidServiceOrAlert(event, service) {
  const config = getPaidServiceConfig(service);

  event?.preventDefault?.();
  event?.stopPropagation?.();

  if (!config) {
    openNormalLink(service?.link || service?.to);
    return true;
  }

  try {
    const { data } = await supabase.auth.getSession();
    const session = data?.session;

    if (!session?.user || !session?.access_token) {
      window.alert(PAID_MESSAGE);
      return true;
    }

    const response = await fetch('/api/create-service-ticket', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ service_key: config.serviceKey })
    });

    let result = {};
    try {
      result = await response.json();
    } catch {
      result = {};
    }

    if (!response.ok || !result?.redirect_url) {
      window.alert(result?.detail || PAID_MESSAGE);
      return true;
    }

    window.location.href = result.redirect_url;
    return true;
  } catch (error) {
    console.error('유료 서비스 접근 확인 오류:', error);
    window.alert(PAID_MESSAGE);
    return true;
  }
}

