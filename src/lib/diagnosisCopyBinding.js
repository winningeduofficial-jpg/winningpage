/**
 * 계산 결과(코드·수치) → 문구 선택/조립 계층 — 명세 §5(문구 바인딩) 전량.
 *
 * 계층 규칙
 *   diagnosisScoring.js(엔진)  : 코드·수치만 낸다. 이 파일을 import 하지 않는다.
 *   diagnosisCopyBinding.js(여기): 코드 → 문구집 조회 + 토큰 치환 + 금지어 검사. 로직만 갖고 문구를 만들지 않는다.
 *   diagnosisReport.js         : 위 둘을 합쳐 ReportData 를 조립한다(§7).
 * 역방향(데이터 모듈이 fill 을 부르거나, 엔진이 문구를 부르는 것)은 금지다 — §5.3 ①의 정적 검사와
 * 엔진 회귀가 한 덩어리로 엉킨다.
 *
 * React 를 import 하지 않는 순수 모듈이다. verify 스크립트가 plain node 로 그대로 돌린다.
 *
 * ── 결측 정책(지시받은 "COPY_FALLBACK 반환"과의 차이를 명시한다) ──
 * 셀렉터는 미커버 조합에서 예외를 던지지 않고 **null** 을 반환한다(+ 개발 모드 경고).
 * COPY_FALLBACK 에는 VALUE_MISSING('미입력') 하나뿐이고(Q-29 확정으로 URGENT_GOAL_REACHED 는
 * 정식 키 card_goal_met.title/sub 로 이관돼 삭제됐다) 특정 슬롯 전용 문장이라, 문구 조회 실패
 * 자리에 되돌리면
 *   (a) 진단 서술 카드에 '미입력'이 렌더되고,
 *   (b) 호출부의 `?? 폴백` 사슬이 조용히 끊긴다(문자열은 truthy 다).
 * 범용 "문구 없음" 문장을 새로 만드는 것도 불가 — §5.3 정적 검사 대상에 창작 문구가 섞이고
 * CASE-10 문구 개수 검산(343+22)이 어긋난다. 따라서 슬롯별 폴백 결정은 전부 buildReport 가 소유하고,
 * 이 파일은 "없다"는 사실만 정확히 전달한다.
 */

// 확장자 .js 를 명시한다. 이 파일은 verify 스크립트가 plain node 로 직접 import 하는데,
// node ESM 은 Vite 와 달리 확장자 생략을 해석하지 못해 ERR_MODULE_NOT_FOUND 로 죽는다.
import {
  AREA_COPY,
  BANNED_PHRASES,
  COMMON_COPY,
  NARRATIVE_COPY,
  NARRATIVE_STATE_LABEL,
  PAGE_GRADE_COPY,
  SERVICE_COPY,
  TEMPLATE_COPY,
  TOKEN_SCOPE
} from '../data/diagnosisCopy.js';

/* ------------------------------------------------------------------ *
 * 0. 개발 모드 경고
 * ------------------------------------------------------------------ */

// Vite 는 프로덕션 번들에서 이 분기를 통째로 접는다. plain node(verify 스크립트)에서는
// import.meta.env 자체가 undefined 라 optional chaining 으로 falsy 가 되고 경고는 나오지 않는다 —
// 스크립트는 findBannedPhrases 를 직접 불러 판정하므로 console 출력에 의존하지 않는다.
const IS_DEV = Boolean(import.meta.env?.DEV);

function devWarn(message, detail) {
  if (!IS_DEV) return;
  if (detail === undefined) console.warn(`[diagnosis-copy] ${message}`);
  else console.warn(`[diagnosis-copy] ${message}`, detail);
}

/* ------------------------------------------------------------------ *
 * 1. 템플릿 치환 (§5.2)
 * ------------------------------------------------------------------ */

// {영역}(SVC_RANK2_PREFIX)은 한글이라 \w 에 걸리지 않는다. 명세의 정규식을 그대로 옮긴다.
const TOKEN_PATTERN = /\{(\w+|영역)\}/g;

/**
 * 템플릿 문자열의 토큰을 스코프 화이트리스트 안에서만 치환한다.
 *
 * @param {string} tpl      TEMPLATE_COPY / COMMON_COPY 원문
 * @param {Record<string, string|number>} vars 치환 값. 숫자 포맷(등급 2자리·점수 정수)은
 *                          호출부가 이미 맞춘 값을 넘긴다 — 여기서 반올림하면 §4 의 roundHalfUp 이 두 곳이 된다.
 * @param {string} tokenKey TOKEN_SCOPE 의 키(= 문구 키). 'headline', 'card_urgent.sub', 'SVC_RANK2_PREFIX' 등.
 * @returns {string} 치환 결과. 스코프 밖 토큰·값 결측 토큰은 원문(`{gap}`)을 그대로 남긴다.
 *
 * 전역 vars 를 한 번에 넘기지 못하게 tokenKey 를 필수로 받는다 — {type}(전형 유형 ↔ 학생 유형)과
 * {major}(지원 학과 ↔ 희망 진로)가 서로 값을 다투는 것을 구조적으로 막는다(§5.2 네이밍 충돌).
 *
 * 명세는 미치환 토큰에 대해 "dev 빌드 throw"를 적었으나 **의도적으로 경고로 낮췄다.** 이 함수는
 * 렌더 경로에서 호출되고, throw 하면 리포트 전체가 흰 화면이 된다. 사용자 노출 슬롯
 * (headline·section_traits·card_urgent.sub·page2_summary)은 §5.2 폴백 규칙이 buildReport 에서
 * 먼저 적용되므로 토큰 원문이 화면에 도달하지 않는다.
 *
 * 검출 책임은 verify 스크립트가 대신 진다 — S13b 가 buildReport 출력 전체를 훑어 `{gap}`·`{영역}`
 * 같은 미치환 토큰이 0건임을 입결 4조합 × 등급체계 4종에서 단언한다. 이 완화를 되돌리려면
 * 그 단언과 함께 봐야 한다(명세 §5.2/§5.3 ② 문구도 같이 고쳐야 한다 — 개정 대기).
 */
export function fill(tpl, vars = {}, tokenKey) {
  if (typeof tpl !== 'string' || tpl === '') return '';

  // 토큰이 없는 문구는 스코프 미등재가 정상이다(TOKEN_SCOPE 는 토큰 있는 키만 담는다).
  TOKEN_PATTERN.lastIndex = 0;
  if (!TOKEN_PATTERN.test(tpl)) return tpl;

  const scope = TOKEN_SCOPE[tokenKey];
  if (!Array.isArray(scope)) {
    devWarn(`fill: TOKEN_SCOPE 에 없는 문구 키 '${tokenKey}' — 토큰이 있는데 화이트리스트가 없어 전부 원문으로 남긴다`, tpl);
  }
  const allowed = Array.isArray(scope) ? scope : [];

  TOKEN_PATTERN.lastIndex = 0;
  const filled = tpl.replace(TOKEN_PATTERN, (match, token) => {
    if (!allowed.includes(token)) {
      devWarn(`fill: '${tokenKey}' 스코프 밖 토큰 ${match} — 치환하지 않는다`);
      return match;
    }
    const value = vars[token];
    // 빈 문자열도 결측으로 본다 — '{name} 학생, ' 이 ' 학생, ' 으로 렌더되는 것을 막는다(§5.2 name 결측 분기).
    if (value === null || value === undefined || value === '') {
      devWarn(`fill: '${tokenKey}' 의 ${match} 값이 없다 — 원문을 남긴다`);
      return match;
    }
    return String(value);
  });

  // §5.3 ② — fill 반환값 런타임 검사. SVC_RANK2_PREFIX 처럼 구분이 '공통'인 문구도 여기를 지난다.
  // 실제 위험은 admission_headline 의 '{prob}%' 로, prob 이 100 이면 06 금지표현 '100%' 와 문자 그대로 일치한다.
  if (IS_DEV) {
    const hits = findBannedPhrases([filled]);
    if (hits.length > 0) devWarn(`fill: '${tokenKey}' 치환 결과에 금지 표현이 있다`, hits);
  }

  return filled;
}

/* ------------------------------------------------------------------ *
 * 2. 문구 셀렉터 (§5.1)
 * ------------------------------------------------------------------ */

/**
 * 종합 등급 문구 — PAGE_GRADE_COPY[page][levelOf(overall)].
 * 유형 미판정(Q-05) 동안 page1 이 headlineLines 폴백을 겸한다(§6.2 classifyType 주석).
 *
 * @param {1|2|'page1'|'page2'} page
 * @param {'L1'|'L2'|'L3'|'L4'|'L5'} level levelOf() 결과. stateOf() 4단계 코드를 넣으면 null 이 나온다.
 * @returns {string|null}
 */
export function levelCopy(page, level) {
  const pageKey = page === 1 || page === 'page1' ? 'page1' : page === 2 || page === 'page2' ? 'page2' : null;
  const copy = pageKey ? PAGE_GRADE_COPY[pageKey]?.[level] : undefined;
  if (typeof copy !== 'string') {
    devWarn(`levelCopy: 미커버 조합 (page=${page}, level=${level})`);
    return null;
  }
  return copy;
}

/**
 * 영역 문구 묶음 — levels(L1~L5) · strength · weakness · need(improve/keep) · strategies 4.
 * 우선순위 표의 '필요한 것'은 badge === '유지' 일 때 need.keep 을 쓴다(§5.1 · Q-06).
 *
 * @param {string} areaCode AREA_CODES 12종
 * @returns {{ levels: Record<string,string>, strength: string, weakness: string,
 *             need: { improve: string, keep: string }, strategies: string[] }|null}
 */
export function areaCopy(areaCode) {
  const copy = AREA_COPY[areaCode];
  if (!copy) {
    devWarn(`areaCopy: 미커버 영역 코드 '${areaCode}'`);
    return null;
  }
  return copy;
}

/**
 * 진단 서술 문구 — NARRATIVE_COPY[area][NARRATIVE_STATE_LABEL[state]].
 *
 * 상태 코드를 시트 라벨로 바꾸는 이 한 단계가 §5.1 매핑표의 핵심이다. LOW 의 시트 키는 '보완'이고
 * PAGE1 화면 라벨은 '보완 필요'라, 화면 라벨로 조회하면 LOW 6영역 전부가 undefined 가 되어
 * 주요 학습 특성 카드가 빈다. 그래서 화면 라벨(STATE_LABEL)은 받지 않고 코드만 받는다.
 * PAGE2 6영역은 03 시트에 원문이 없어 항상 null 이다(창작 금지).
 *
 * @param {string} areaCode PAGE1_AREAS 6종
 * @param {'TOP'|'MID'|'LOW'|'WEAK'} state stateOf() 결과 코드
 * @returns {{ title: string, body: string }|null}
 */
export function narrativeCopy(areaCode, state) {
  const sheetKey = NARRATIVE_STATE_LABEL[state];
  if (!sheetKey) {
    devWarn(`narrativeCopy: 미지의 상태 코드 '${state}' — stateOf() 반환값(TOP/MID/LOW/WEAK)만 받는다`);
    return null;
  }
  const copy = NARRATIVE_COPY[areaCode]?.[sheetKey];
  if (!copy) {
    devWarn(`narrativeCopy: 미커버 조합 (area=${areaCode}, state=${state})`);
    return null;
  }
  return copy;
}

/**
 * 서비스 카드 문구 — SERVICE_COPY[code].tiers[tier] + .tags.
 * tags 는 서비스당 4개 단일 세트이고 강도와 무관하다(04 시트에 '태그 4개' 행이 서비스마다 1개씩).
 *
 * @param {string} serviceCode SERVICE_CODES 6종
 * @param {'HIGH'|'MID'|'LOW'|null} tier rankServices 의 tier. null(적합도 50 미만)이면 노출 대상이 아니다.
 * @returns {{ text: string, tags: string[] }|null}
 */
export function serviceCopy(serviceCode, tier) {
  const entry = SERVICE_COPY[serviceCode];
  const text = entry?.tiers?.[tier];
  if (typeof text !== 'string') {
    devWarn(`serviceCopy: 미커버 조합 (service=${serviceCode}, tier=${tier})`);
    return null;
  }
  return { text, tags: entry.tags };
}

/**
 * 05 시트 '공통' 문구 19종 조회.
 * SVC_RANK2_PREFIX 만 토큰({영역})을 가지므로 반환값을 그대로 렌더하면 안 되고 fill() 을 한 번 더 태운다 —
 * "COMMON_COPY 는 fill 불필요"로 최적화하면 화면에 {영역} 리터럴이 노출된다(§5.2).
 *
 * @param {string} key COMMON_COPY 키
 * @returns {string|null}
 */
export function commonCopy(key) {
  const copy = COMMON_COPY[key];
  if (typeof copy !== 'string') {
    devWarn(`commonCopy: 미커버 키 '${key}'`);
    return null;
  }
  return copy;
}

/**
 * 05 시트 '템플릿' 문구 18종 조회. 토큰이 남아 있는 원문을 그대로 돌려준다 —
 * 치환은 호출부가 vars 를 확정한 뒤 fill(templateCopy(key), vars, key) 로 수행한다.
 *
 * @param {string} key TEMPLATE_COPY 키('card_exec.sub' 처럼 점이 든 시트 표기를 그대로 쓴다)
 * @returns {string|null}
 */
export function templateCopy(key) {
  const copy = TEMPLATE_COPY[key];
  if (typeof copy !== 'string') {
    devWarn(`templateCopy: 미커버 키 '${key}'`);
    return null;
  }
  return copy;
}

/* ------------------------------------------------------------------ *
 * 3. 금지어 검사 (§5.3)
 * ------------------------------------------------------------------ */

// 검사 대상은 문구 모듈만이 아니라 '화면에 노출되는 모든 문자열'이다(§5.3). AREA_LABEL·SERVICE_LABEL·
// STATE_LABEL·BADGES·LEVEL_LABEL 같은 라벨 상수 객체를 그대로 넘길 수 있게 중첩 구조를 풀어서 받는다.
// 깊이 상한은 순환 참조 방어용이다(문구 모듈은 순수 리터럴이라 실제로 도달할 일이 없다).
const MAX_COLLECT_DEPTH = 8;

function collectStrings(value, depth, out) {
  if (depth > MAX_COLLECT_DEPTH) return out;
  if (typeof value === 'string') {
    if (value !== '') out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, depth + 1, out);
    return out;
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectStrings(item, depth + 1, out);
  }
  return out;
}

/**
 * 06_금지어 22표현 위반 목록을 반환한다(빈 배열이면 통과).
 *
 * 판정만 하고 throw 하지 않는다 — 실행 주체는 verify 스크립트(§5.3 ①·④)이고, 런타임에서는
 * fill() 이 개발 모드에서만 이 결과를 경고로 흘린다(②). 프로덕션은 조용히 통과한다.
 * 부분 문자열 포함 검사이므로 한 문자열이 여러 표현에 걸리면 항목이 여러 개 나온다.
 *
 * @param {unknown} values 문자열, 또는 문자열을 품은 배열/객체(중첩 허용)
 * @returns {Array<{ text: string, type: string, phrase: string }>}
 */
export function findBannedPhrases(values) {
  const texts = collectStrings(values, 0, []);
  const hits = [];
  for (const text of texts) {
    for (const group of BANNED_PHRASES) {
      for (const phrase of group.phrases) {
        if (text.includes(phrase)) hits.push({ text, type: group.type, phrase });
      }
    }
  }
  return hits;
}
