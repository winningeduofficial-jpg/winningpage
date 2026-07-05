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


function setGlobalLoadingCursor(isLoading) {
  if (typeof document === 'undefined') return;
  document.documentElement.style.cursor = isLoading ? 'progress' : '';
  document.body.style.cursor = isLoading ? 'progress' : '';
}

function setButtonLoading(target, isLoading, label = '이동 중...') {
  const el = target && target.closest ? target.closest('button, a') : target;
  if (!el || !('style' in el)) return;

  if (isLoading) {
    if (!el.dataset.originalText) el.dataset.originalText = el.textContent || '';
    el.dataset.ssoLoading = 'true';
    el.style.cursor = 'progress';
    el.style.pointerEvents = 'none';
    if (el.tagName === 'BUTTON') el.disabled = true;
    if (el.textContent && el.textContent.trim()) el.textContent = label;
  } else {
    el.style.cursor = '';
    el.style.pointerEvents = '';
    if (el.tagName === 'BUTTON') el.disabled = false;
    if (el.dataset.originalText) el.textContent = el.dataset.originalText;
    delete el.dataset.ssoLoading;
  }
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
  const targetEl = event?.currentTarget || event?.target;

  event?.preventDefault?.();
  event?.stopPropagation?.();

  if (!config) {
    openNormalLink(service?.link || service?.to);
    return true;
  }

  setGlobalLoadingCursor(true);
  setButtonLoading(targetEl, true, '입장 확인 중...');

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

    setButtonLoading(targetEl, true, '이동 중...');
    window.location.href = result.redirect_url;
    return true;
  } catch (error) {
    console.error('유료 서비스 접근 확인 오류:', error);
    window.alert(PAID_MESSAGE);
    return true;
  } finally {
    // 정상 이동은 페이지가 바뀌므로 보이지 않지만, 실패/차단 시 커서를 복구한다.
    setTimeout(() => {
      setGlobalLoadingCursor(false);
      setButtonLoading(targetEl, false);
    }, 600);
  }
}

