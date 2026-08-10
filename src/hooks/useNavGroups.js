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
// v6: 무료진단 → 학습진단 DB 마이그레이션(테이블 rename + program_categories/page_contents/banners
// 데이터 값 일괄 치환). 코드측 안전망이던 PROMOTED_PATH_ROUTES의 '/free-diagnosis' 매핑과
// navigation.js의 SERVICE_NAME_OVERRIDES를 제거했다. App.jsx에 영구 리다이렉트가 추가돼 구
// 링크('/free-diagnosis')가 죽지는 않지만, 캐싱된 구 라벨('무료진단')이 화면에 그대로 노출되는
// 것을 막고 리다이렉트 한 홉을 절약하기 위해 키를 bump한다.
const HEADER_NAV_CACHE_KEY = 'winning-header-nav-groups-dynamic-v4-v4-v6';

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
  'premium-apply': '/premium-apply',
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

function ensureLearningDiagnosisInService(groups) {
  const source = Array.isArray(groups) ? groups : [];

  return source.map((group) => {
    if (cleanText(group?.title) !== '서비스') {
      return group;
    }

    const items = Array.isArray(group.items) ? group.items : [];
    const withoutLearningDiagnosis = items.filter((item) => {
      // 신 리터럴('학습진단' / '/learning-diagnosis')과 구 리터럴('무료진단' / '/free-diagnosis')을
      // 모두 걸러낸 뒤, 아래에서 '학습진단' 항목을 항상 맨 앞에 한 번만 주입한다.
      //
      // 신 리터럴은 필수다 —
      // (a) 멱등성: 이 함수가 주입한 항목이 캐시(localStorage)에 저장됐다가 다음 렌더에서
      //     readCachedNavGroups를 통해 다시 들어올 때 재주입되는 것을 막는다. 안 걸러내면
      //     캐시를 거친 두 번째 렌더부터 메뉴에 항목이 두 번 나온다.
      // (b) DB(page_contents)를 신 이름으로 마이그레이션한 뒤 DB 항목과 코드 주입 항목이
      //     중복되지 않도록.
      //
      // 구 리터럴도 남긴다(제거 안 함) — dev DB는 이번에 마이그레이션되지만 운영 DB는 나중에
      // dump 재이관으로 처리되는 별도 일정이고, 그 사이 운영 page_contents에는 '무료진단' /
      // '/free-diagnosis' 항목이 그대로 남아 있다. 캐시 키를 v6으로 bump했어도 DB가 계속
      // 구 값을 내려주면 소용이 없다. 구 리터럴을 지우면 그 항목이 필터를 통과해 코드가
      // 주입하는 '학습진단'과 나란히 메뉴에 중복 노출된다(링크 자체는 App.jsx의
      // '/free-diagnosis' 리다이렉트로 살아 있지만, 같은 메뉴가 두 번 보이는 건 그대로 버그).
      // 두 줄 비용으로 그 창을 막을 수 있어 유지가 이득이다. 운영 DB까지 이관이 끝나면
      // 구 리터럴 두 줄은 제거해도 된다.
      const label = cleanText(item?.label).replace(/\s+/g, '');
      const to = cleanText(item?.to);
      return (
        label !== '무료진단' &&
        label !== '학습진단' &&
        to !== '/free-diagnosis' &&
        to !== '/learning-diagnosis'
      );
    });

    return {
      ...group,
      to: group.to || '/learning-diagnosis',
      items: [{ label: '학습진단', to: '/learning-diagnosis', sortOrder: 0 }, ...withoutLearningDiagnosis]
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

    return applyPromotedSlugRoutes(ensureLearningDiagnosisInService(parsed));
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

  return applyPromotedSlugRoutes(ensureLearningDiagnosisInService(groups));
}

// 헤더 메가메뉴·푸터가 공유하는 내비게이션 그룹 훅.
// page_contents(DB) → 캐시(HEADER_NAV_CACHE_KEY) → FALLBACK_NAV_GROUPS 순으로 소스를 결정하고,
// postgres_changes realtime 구독으로 변경을 즉시 반영한다.
export function useNavGroups() {
  const instanceId = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [navGroups, setNavGroups] = useState(() => {
    return applyPromotedSlugRoutes(
      ensureLearningDiagnosisInService(readCachedNavGroups() || FALLBACK_NAV_GROUPS)
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

  return navGroups;
}
