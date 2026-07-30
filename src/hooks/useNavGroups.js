import { useEffect, useId, useState } from 'react';
import { supabase } from '../lib/supabase';
import { FALLBACK_NAV_GROUPS, MENU_GROUP_ORDER } from '../data/navigation';

// v4 트리(FALLBACK_NAV_GROUPS 구 버전) 캐시가 남아있지 않도록 신 트리(2016:1796) 전용 키로 교체.
const HEADER_NAV_CACHE_KEY = 'winning-header-nav-groups-dynamic-v4-v2';

export function cleanText(value) {
  return String(value || '').trim();
}

function safeJsonStringify(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

export function isSameObject(a, b) {
  return safeJsonStringify(a) === safeJsonStringify(b);
}

function resolveMenuLink(slug) {
  const value = cleanText(slug);

  if (!value) return '/';
  if (value.startsWith('http://') || value.startsWith('https://')) return value;
  if (value.startsWith('/')) return value;

  return `/page/${value}`;
}

function ensureFreeDiagnosisInService(groups) {
  const source = Array.isArray(groups) ? groups : [];

  return source.map((group) => {
    if (cleanText(group?.title) !== '서비스') {
      return group;
    }

    const items = Array.isArray(group.items) ? group.items : [];
    const withoutFreeDiagnosis = items.filter((item) => {
      const label = cleanText(item?.label).replace(/\s+/g, '');
      return label !== '무료진단' && cleanText(item?.to) !== '/free-diagnosis';
    });

    return {
      ...group,
      to: group.to || '/free-diagnosis',
      items: [{ label: '무료진단', to: '/free-diagnosis', sortOrder: 0 }, ...withoutFreeDiagnosis]
    };
  });
}

function readCachedNavGroups() {
  try {
    const raw = window.localStorage.getItem(HEADER_NAV_CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed) || parsed.length === 0) {
      return null;
    }

    return ensureFreeDiagnosisInService(parsed);
  } catch {
    return null;
  }
}

function writeCachedNavGroups(groups) {
  try {
    if (!Array.isArray(groups) || groups.length === 0) {
      return;
    }

    window.localStorage.setItem(HEADER_NAV_CACHE_KEY, JSON.stringify(groups));
  } catch {
    // 메뉴 캐시 저장 실패는 무시
  }
}

// menu_group이 비어있는 row는 skip한다 — 과거 '기타' 그룹 편입은 메뉴 제외 페이지가
// 새어 나오는 버그 원인이라 제거했다.
function buildNavGroups(rows) {
  const grouped = new Map();

  (rows || []).forEach((item) => {
    const groupName = cleanText(item.menu_group);
    if (!groupName) return;

    const slug = cleanText(item.slug);

    if (!slug) return;

    const isCompanyIntro = slug === 'company-intro';
    // 라벨은 DB menu_label을 그대로 쓰되(강제 치환 제거), CompanyNews 페이지가 소비하는
    // slug 'company-intro' → '/company-news' 링크 매핑만 유지한다.
    const itemLink = isCompanyIntro ? '/company-news' : resolveMenuLink(slug);
    const savedGroupOrder = Number(item.menu_group_order);
    const groupOrder =
      Number.isFinite(savedGroupOrder) && savedGroupOrder > 0
        ? savedGroupOrder
        : MENU_GROUP_ORDER[groupName] || 99;

    const savedSortOrder = Number(item.sort_order);
    const sortOrder = Number.isFinite(savedSortOrder) && savedSortOrder > 0 ? savedSortOrder : 99;

    if (!grouped.has(groupName)) {
      grouped.set(groupName, {
        title: groupName,
        groupOrder,
        to: itemLink,
        items: []
      });
    }

    const group = grouped.get(groupName);

    if (groupOrder < group.groupOrder) {
      group.groupOrder = groupOrder;
      group.to = itemLink;
    }

    group.items.push({
      label: cleanText(item.menu_label) || cleanText(item.title) || groupName,
      to: itemLink,
      sortOrder
    });
  });

  const groups = Array.from(grouped.values())
    .sort((a, b) => a.groupOrder - b.groupOrder)
    .map((group) => {
      const sortedItems = group.items.sort((a, b) => a.sortOrder - b.sortOrder);

      return {
        title: group.title,
        to: sortedItems[0]?.to || group.to,
        items: sortedItems
      };
    });

  return ensureFreeDiagnosisInService(groups);
}

// 헤더 메가메뉴·푸터가 공유하는 내비게이션 그룹 훅.
// page_contents(DB) → 캐시(HEADER_NAV_CACHE_KEY) → FALLBACK_NAV_GROUPS 순으로 소스를 결정하고,
// postgres_changes realtime 구독으로 변경을 즉시 반영한다.
export function useNavGroups() {
  const instanceId = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [navGroups, setNavGroups] = useState(() => {
    return ensureFreeDiagnosisInService(readCachedNavGroups() || FALLBACK_NAV_GROUPS);
  });

  useEffect(() => {
    let alive = true;

    async function loadNavGroups() {
      const { data, error } = await supabase
        .from('page_contents')
        .select('menu_group, menu_group_order, menu_label, title, slug, sort_order, is_active')
        .eq('is_active', true)
        .order('menu_group_order', { ascending: true })
        .order('sort_order', { ascending: true });

      if (!alive) return;

      if (error) {
        console.error('내비게이션 메뉴 조회 실패:', error);
        return;
      }

      const nextGroups = buildNavGroups(data);

      if (nextGroups.length === 0) {
        return;
      }

      setNavGroups((prev) => {
        if (isSameObject(prev, nextGroups)) {
          return prev;
        }

        writeCachedNavGroups(nextGroups);
        return nextGroups;
      });
    }

    loadNavGroups();

    // 헤더+푸터 두 인스턴스가 동시에 구독해도 채널명이 충돌하지 않도록 useId 기반으로 유니크화.
    const channel = supabase
      .channel(`nav-groups-page-contents-${instanceId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'page_contents' }, () =>
        loadNavGroups()
      )
      .subscribe();

    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [instanceId]);

  return navGroups;
}
