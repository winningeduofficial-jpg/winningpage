import { useEffect, useId, useState } from 'react';
import { supabase } from '../lib/supabase';
import { FALLBACK_NAV_GROUPS, MENU_GROUP_ORDER } from '../data/navigation';

// v4 트리(FALLBACK_NAV_GROUPS 구 버전) 캐시가 남아있지 않도록 신 트리(2016:1796) 전용 키로 교체.
// v3: 콜멘토 링크가 /page/services-content → /services/callmentor 로 바뀌어(callmentor-spec.md)
// 구 캐시에 남은 사용자에게도 즉시 새 경로가 보이도록 키 버전을 올린다.
// v4: 교육칼럼이 /gallery → /info/column 으로 이관(edu-column-renewal-spec.md) — 구 캐시에 남은
// '교육컬럼'/'/gallery' 잔존을 차단하기 위해 다시 bump.
// v5: DB page_contents.menu_label에 '교육컬럼'(오타) 이 저장돼 헤더/푸터에 그대로 노출되던 문제.
// normalizeMenuLabel로 런타임 상시 치환하도록 고쳤지만, 이미 오타를 캐싱한 사용자에게도 즉시
// 반영되도록 키 버전을 한 번 더 bump한다.
const HEADER_NAV_CACHE_KEY = 'winning-header-nav-groups-dynamic-v4-v4-v5';

export function cleanText(value) {
  return String(value || '').trim();
}

// DB page_contents.menu_label에 '컬럼'(오타, 올바른 표기는 '칼럼')이 섞여 들어와도 메뉴 라벨에
// 그대로 노출되지 않도록 상시 치환한다. DB 레코드 수정은 운영자 몫(공통 구현 규칙 — DB 수정
// 금지)이라 PROMOTED_SLUG_ROUTES와 같은 취지로 이 훅에서 안전망을 둔다. '컬럼' 전역 치환은 이
// 파일 밖(테이블/레이아웃 컬럼 등)에서는 절대 하면 안 되고, 메뉴 라벨 문자열에만 좁게 적용한다.
export function normalizeMenuLabel(label) {
  return cleanText(label).replaceAll('컬럼', '칼럼');
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

// 승격된 서비스 페이지 슬러그 → 신규 전용 라우트 매핑 (premium-apply 전례와 동일 취지의
// 일반화 — 이 worktree엔 그 커밋이 없어 매핑 자체를 여기 새로 둔다).
// DB(page_contents)가 구 슬러그(/page/services-goal 등)를 계속 갖고 있어도 헤더 메가메뉴・
// 푸터・캐시가 항상 신규 라우트를 가리키도록 이 훅에서 일괄 치환한다. GNB DB 값 자체를
// /services/* 로 바꾸는 것은 운영자 몫(공통 구현 규칙 — DB 수정 금지) — 이 매핑은 그 전까지의
// 안전망이다. 직접 구 경로로 진입한 경우의 리다이렉트는 App.jsx의 <Navigate replace> 라우트가 담당.
export const PROMOTED_SLUG_ROUTES = {
  'services-goal': '/services/goal',
  'services-ai-performance': '/services/performance',
  'services-self-assessment': '/services/self-assessment',
  'services-in-depth-research': '/services/research',
  'admission-special-highschool-results': '/admission/special-highschool',
  gallery: '/info/column'
};

// 절대경로 구 라우트 → 신 라우트 매핑 (PROMOTED_SLUG_ROUTES는 `/page/<slug>` 패턴만 커버하므로,
// DB slug가 선행 슬래시 절대경로(`/gallery`)로 저장된 경우를 별도로 대비한다).
const PROMOTED_PATH_ROUTES = {
  '/gallery': '/info/column'
};

// 단일 링크 문자열에 대한 승격 매핑 적용 — 헤더/푸터(그룹 트리)뿐 아니라 서비스 카드처럼
// 단일 링크만 다루는 소비처(ServicesSection 등)도 이 함수 하나로 재사용한다.
export function resolvePromotedSlugLink(to) {
  const value = cleanText(to);
  if (PROMOTED_PATH_ROUTES[value]) return PROMOTED_PATH_ROUTES[value];

  const match = value.match(/^\/page\/([^/]+)$/);
  const promoted = match ? PROMOTED_SLUG_ROUTES[match[1]] : null;
  return promoted || to;
}

function applyPromotedSlugRoutes(groups) {
  const source = Array.isArray(groups) ? groups : [];

  return source.map((group) => ({
    ...group,
    to: resolvePromotedSlugLink(group.to),
    items: (Array.isArray(group.items) ? group.items : []).map((item) => ({
      ...item,
      to: resolvePromotedSlugLink(item.to)
    }))
  }));
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

// '성장설계'(/services/growth)를 '서비스' 그룹에 삽입한다. 비로그인 포함 전원에게 노출되며,
// 라우트 접근 통제(있다면)는 App.jsx가 별도로 담당한다. ensureFreeDiagnosisInService와 형태는
// 같지만 적용 지점이 다르다 — page_contents(DB)는 dev 공용이라 여기 슬러그를 추가하면
// 이 라우트가 없는 다른 브랜치 전부에서 메뉴 링크가 뜨고 App.jsx의 path="*"에 걸려 홈으로
// 튕긴다. 그래서 DB를 건드리지 않고 이 훅에서 코드로 주입한다. '수행평가' 다음, '자기평가' 앞이
// 20260806 확정 순서(무료진단·목표관리·콜멘토·수행평가·성장설계·자기평가·심화탐구)이고,
// '자기평가'를 못 찾으면(DB 변경 등) 그룹 끝에 append해 항목 자체가 사라지지 않게 한다.
function insertGrowthPlanningInService(groups) {
  const source = Array.isArray(groups) ? groups : [];
  const growthLink = '/services/growth';

  return source.map((group) => {
    if (cleanText(group?.title) !== '서비스') {
      return group;
    }

    const items = Array.isArray(group.items) ? group.items : [];
    // 재계산(realtime 갱신 등)으로 이 함수가 다시 호출돼도 중복 삽입되지 않도록 기존 항목을
    // 먼저 제거하고 다시 계산한다.
    const withoutGrowth = items.filter((item) => cleanText(item?.to) !== growthLink);

    const selfAssessmentIndex = withoutGrowth.findIndex((item) => {
      const label = cleanText(item?.label).replace(/\s+/g, '');
      return label === '자기평가' || cleanText(item?.to) === '/services/self-assessment';
    });

    const growthItem = { label: '성장설계', to: growthLink, sortOrder: 0 };
    const nextItems = [...withoutGrowth];

    if (selfAssessmentIndex === -1) {
      nextItems.push(growthItem);
    } else {
      nextItems.splice(selfAssessmentIndex, 0, growthItem);
    }

    return {
      ...group,
      items: nextItems
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

    return applyPromotedSlugRoutes(ensureFreeDiagnosisInService(parsed));
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
    // 콜멘토 랜딩 신설(docs/callmentor-spec.md) — DB page_contents의 구 슬러그
    // 'services-content'가 아직 남아 있어도 신규 라우트로 보낸다(DB 레코드 정리는 별도, 이번
    // 범위 제외). App.jsx의 `/page/services-content` → `/services/callmentor` 리다이렉트와 세트.
    const isCallMentor = slug === 'services-content';
    // 라벨은 DB menu_label을 그대로 쓰되(강제 치환 제거), CompanyNews/콜멘토 페이지가 소비하는
    // slug → 전용 라우트 매핑만 유지한다.
    const itemLink = isCompanyIntro
      ? '/company-news'
      : isCallMentor
        ? '/services/callmentor'
        : resolveMenuLink(slug);
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
      label: normalizeMenuLabel(cleanText(item.menu_label) || cleanText(item.title) || groupName),
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

  return applyPromotedSlugRoutes(ensureFreeDiagnosisInService(groups));
}

// 헤더 메가메뉴·푸터가 공유하는 내비게이션 그룹 훅.
// page_contents(DB) → 캐시(HEADER_NAV_CACHE_KEY) → FALLBACK_NAV_GROUPS 순으로 소스를 결정하고,
// postgres_changes realtime 구독으로 변경을 즉시 반영한다.
export function useNavGroups() {
  const instanceId = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [navGroups, setNavGroups] = useState(() => {
    return applyPromotedSlugRoutes(
      ensureFreeDiagnosisInService(readCachedNavGroups() || FALLBACK_NAV_GROUPS)
    );
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

  // '성장설계' 주입은 여기(최종 반환값)에만 적용한다 — writeCachedNavGroups/readCachedNavGroups
  // 경로(즉 DB·캐시)에는 절대 섞지 않는다. page_contents(DB)는 dev의 전 브랜치가 공유하므로
  // DB나 캐시에 넣으면 /services/growth 라우트가 없는 다른 브랜치에서도 메뉴 링크가 뜨고
  // App.jsx의 path="*"에 걸려 홈으로 튕긴다. 같은 파일의 ensureFreeDiagnosisInService가 이미
  // 동일한 방식(최종 반환값에서만 주입)을 쓰고 있다.
  return insertGrowthPlanningInService(navGroups);
}
