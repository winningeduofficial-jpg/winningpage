import { useCallback, useEffect, useMemo, useState } from 'react';
import { Ban, Check, ChevronLeft, Edit3, History, Plus, RefreshCw, Search, Users, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';

// =====================================================================
// 어드민 "쿠폰관리" — 목록 / 생성·수정 / 사용이력 / void / 발급 관리
//
// 왜 이 화면이 필요한가 (sql/55_coupon_policy.sql 이 남긴 결함 이력)
//   지금까지 쿠폰 운영은 Supabase Studio 직접 조작이 전제였고, 그 전제 때문에
//   결함이 반복됐다: ① max_uses_per_user 를 깜빡 비우면 곧바로 무제한 쿠폰이
//   됐다(그래서 sql/55 0)절이 DEFAULT 를 1로 뒤집었다) ② redemption 되돌림이
//   raw DELETE 였다(그래서 1-b/1-g 절이 voided_at + fn_void_coupon_redemption
//   을 만들었다) ③ id 만 보고 판단해 'signup-6000' 이 실제로 2,000원인 것을
//   놓쳤다(그래서 slug 'signup-2000' 으로 정정) ④ 선착순 이벤트를 is_active
//   수동 토글로 우회했다(그래서 1-b/0-b 절이 max_redemptions 를 추가). 이
//   화면이 그 전제를 없앤다 — 그래서 아래 설계가 전부 그 4건을 겨냥한다.
//
// 왜 CONFIGS 제네릭 CRUD 가 아니라 custom 컴포넌트인가
//   Admin.jsx 의 제네릭 경로(loadRows → AdminTable → AdminForm)로는 4가지가
//   성립하지 않는다.
//     1) 목록의 "사용 건수" 는 다른 테이블(coupon_redemptions)에서 파생된다.
//        loadRows 는 config.table 한 개를 select('*') 할 뿐이다.
//     2) max_uses_per_user / max_redemptions / valid_until 은 NULL=무제한·
//        무기한 규약이라 3상태(미선택 / 무제한 / 값) 입력이 필요하다. 제네릭
//        AdminForm 의 required 검사는 `String(form[key] ?? '').trim() === ''`
//        라 "NULL 을 의도적으로 선택" 과 "안 채움" 을 구분할 수 없다 — 이
//        화면의 핵심 요구(무제한을 고를 때도 명시적으로 고르게 한다)와 정면으로
//        어긋난다.
//     3) slug 중복은 저장 전에 잡아야 한다(DB 23505 원문 노출 금지). 제네릭
//        config.validate 는 동기 함수라 DB 를 조회할 수 없다 — 이미 로드된
//        목록을 아는 이 컴포넌트만 할 수 있다.
//     4) 사용이력 드릴다운 + void RPC 는 행 액션이 2개 필요한데 AdminTable 의
//        액션 칼럼은 수정/삭제로 고정이다. 그리고 이 도메인에는 삭제 버튼을
//        두면 안 된다(아래 참고).
//   그래서 premiumBookPages 선례와 같은 방식(config.custom + CustomComponent)
//   으로 붙이고, 표·폼 마크업은 AdminTable/AdminForm 의 클래스 문자열을 그대로
//   따라 시각 일관성만 맞춘다(Admin.jsx:4584 AdminTable / :4141 AdminForm).
//   두 컴포넌트를 직접 import 하지 않는 이유는 순환 참조다 — Admin.jsx 가 이
//   파일을 import 하므로 역방향 import 를 만들지 않는다.
//
// 삭제 버튼이 없는 이유
//   coupons 는 orders.coupon_id / coupon_redemptions.coupon_id 두 FK 의
//   ON DELETE RESTRICT 대상이다(sql/55 1-c절) — 한 번이라도 주문에 물린 쿠폰은
//   애초에 지울 수 없다. 삭제 버튼을 두면 "쓰인 쿠폰에서만 실패하는" 버튼이
//   된다. 판매 종료의 정본 손잡이는 is_active=false 다. 사용이력(void)도
//   같은 원칙으로 DELETE 가 아니라 voided_at UPDATE 만 한다
//   (fn_void_coupon_redemption 은 절대 DELETE 하지 않는다).
//   RLS 도 이 판단과 짝을 맞춰 for delete 정책을 만들지 않았다
//   (sql/55 1-d-2절 — coupons admin select/insert/update 3개만).
//
// 발급 관리(2026-08-11 추가)
//   coupons.grant_type='granted' 인 발급형 쿠폰은 coupon_grants 에 살아있는
//   발급 행이 있는 사용자만 쓸 수 있다(sql/55 1-h/2-c절). 그 원장을 다루는
//   화면이 이 파일의 네 번째 뷰다 — 쿠폰별 드릴다운이라 사용이력(view
//   'history')과 완전히 같은 형태를 쓴다(뒤로가기 + 쿠폰 식별 헤더 + 표 +
//   행 액션 1개). 새 패턴을 만들지 않는다.
//
//   쓰기는 전부 RPC 다(fn_grant_coupon / fn_revoke_coupon_grant).
//   coupon_grants 에는 insert/update/delete RLS 정책이 아예 없어서
//   PostgREST 로는 어드민도 쓸 수 없다 — 이건 의도된 설계다(sql/55 1-h절).
//   coupon_redemptions 는 어드민 update 정책이 열려 있어 PATCH 한 번으로
//   voided_at 을 되돌릴 수 있다는 지적을 이미 받았고, 새 테이블에서 같은
//   구멍을 반복하지 않았다.
//
//   회수(revoke)도 삭제가 아니다 — revoked_at 만 채운다. 회수된 행은 목록에
//   회색으로 남고 액션 칼럼이 '-' 가 된다(void 와 동일). 되돌리려면 되살리는
//   게 아니라 "다시 발급" 이고, 그러면 새 행이 생겨 회수 이력이 그대로 남는다.
// =====================================================================

// ── 화면 문구 ────────────────────────────────────────────────────────
// 이 프로젝트는 신규 한국어 화면 문구를 창작하지 않는다(문구 조사로 규범이
// 수치로 확정돼 있고 신규 문구는 사용자 승인 대상이다). 아래 열 라벨 23개는
// 팀 리드가 승인한 코퍼스 규범 문자열이다(2026-08-11).
//
// 라벨이 null 인 항목(email)은 아직 승인 대상이 아니다 — DB 컬럼명으로
// 대체하던 폴백은 제거했다(FieldName 참고). 승인되면 이 상수만 채우면 된다.
const FIELD_LABEL = {
  slug: '쿠폰 키', // 값을 바꾸면 시드 멱등성에 영향
  code: '고객 입력 코드',
  title: '쿠폰 이름',
  discount_amount: '할인 금액',
  min_amount: '최소 결제 금액',
  valid_until: '사용 기한',
  is_active: '판매 상태',
  max_uses_per_user: '1인당 사용 횟수',
  max_redemptions: '총 발행 수량',
  stackable: '중복 사용',
  grant_type: '배포 방식',
  grant_on_signup: '가입 시 자동 발급',
  used: '사용 건수', // 파생값(DB 컬럼 아님) — 유효 / 전체(무효화 포함)
  id: '내부 키',
  created_at: '등록 일시',
  // ── 사용이력(coupon_redemptions) ──
  order_id: '주문번호',
  user: '사용자', // 파생값. profiles 조인
  voided_at: '무효화 일시',
  void_reason: '무효화 사유',
  // ── 발급 관리(coupon_grants) ──
  granted_at: '발급 일시',
  granted_by: '발급 출처', // 값 자체는 signup(가입) / admin(직접) / event
  revoked_at: '회수 일시',
  revoke_reason: '회수 사유',
  email: null // "사용자 검색(이메일·이름)" 성격 — 승인 대기, 목록에 없음
};

// 무제한/무기한(NULL 규약)을 고르는 선택지의 라벨. 승인 대기라 폴백은 '∞' —
// 한국어를 지어내지 않으면서 "상한 없음" 을 표현할 수 있는 기호다. 이건
// FIELD_LABEL 의 DB 컬럼명 폴백(제거 완료)과 다른 종류라 남겨 둔다 — '무제한'
// 은 아직 승인되지 않은 신규 문구라, 폴백 없이 지우면 화면이 빈칸이 된다.
const UNLIMITED_LABEL = null; // "무제한 / 무기한" 성격
const UNLIMITED_FALLBACK = '∞';

// 아이콘 전용 액션의 접근성 라벨. null 인 동안은 라벨을 붙이지 않는다 —
// AdminTable 의 기존 수정/삭제 아이콘 버튼도 라벨이 없어(Admin.jsx:4674-4692)
// 임의의 한국어를 새로 넣으면 이 화면만 다른 규범을 갖게 된다.
const HISTORY_ACTION_LABEL = null; // "사용이력 보기" 성격
const VOID_ACTION_LABEL = null; // "사용 취소(무효화)" 성격
const BACK_ACTION_LABEL = null; // "목록으로 돌아가기" 성격
const VOID_REASON_PLACEHOLDER = null; // "무효화 사유 입력" 성격

// fn_void_coupon_redemption 이 구분해 던지는 두 에러(sql/55 1-g절).
// 42501 은 팀 리드가 승인한 문구다(2026-08-11). WC002 는 아직 승인 대상이
// 아니다 — null 인 동안은 아래 alert 가 DB 원문(error.message:
// 'redemption_not_found_or_already_voided')을 그대로 보여준다 — 뭉뚱그리지
// 않는 것이 이 도메인의 관례다(Checkout.jsx:205 참고).
const VOID_ERROR_TEXT = {
  42501: '관리자 권한이 없습니다.',
  WC002: null // "이미 무효화됐거나 없는 이력입니다" 성격 (errcode WC002) — 승인 대기
};

// slug 중복은 저장 전에 막는다(요구사항). 문구가 없는 동안은
//   ① 필드 옆에 충돌한 기존 쿠폰 행을 그대로 보여주고(데이터라서 창작이 아니다)
//   ② 차단 alert 는 AdminForm 의 기존 템플릿을 재사용한다.
const SLUG_DUPLICATE_TEXT = null; // "이미 사용 중인 핸들입니다" 성격

// ── 발급 관리(2026-08-11) 문구 자리 ────────────────────────────────────
const GRANTS_ACTION_LABEL = null; // "발급 관리" 성격 (목록 행 액션)
const REVOKE_ACTION_LABEL = null; // "발급 회수" 성격
const REVOKE_REASON_PLACEHOLDER = null; // "회수 사유 입력" 성격
const USER_SEARCH_PLACEHOLDER = null; // "이메일 또는 이름으로 사용자 검색" 성격
// 이미 발급된 사용자를 검색 결과에서 표시하는 자리. 지금은 발급 버튼 자리에
// 체크 아이콘만 두어(버튼 없음) "이미 가지고 있다"를 구조로 알린다.
const ALREADY_GRANTED_TEXT = null; // "이미 발급됨" 성격

// fn_grant_coupon / fn_revoke_coupon_grant 가 구분해 던지는 에러(sql/55 1-i절).
// 42501 / WC003 은 팀 리드가 승인한 문구다(2026-08-11). WC004 는 아직 승인
// 대상이 아니다 — null 인 동안은 DB 원문(error.message)이 그대로 보인다 —
// void 와 같은 규범이다.
const GRANT_ERROR_TEXT = {
  42501: '관리자 권한이 없습니다.',
  WC003: '이미 회수되었거나 존재하지 않는 발급입니다.',
  WC004: null // "발급형 쿠폰이 아닙니다" 성격 (조건형이거나 없는 쿠폰) — 승인 대기
};

// ── 재사용한 기존 문구 (출처) ──────────────────────────────────────────
//   '쿠폰관리'                        팀 리드 확정 범위 명칭 + sql/55 1-g절 주석
//                                     ('향후 만들어질 어드민 "쿠폰관리" 화면')
//   '사용' / '미사용'                  Admin.jsx AdminInput radioBoolean(:3474-3495),
//                                     formatValue(:3238)
//   '등록' / '초기화' / '저장' / '취소'  Admin.jsx 목록 헤더 + AdminForm 푸터
//   '등록된 데이터가 없습니다.'          Admin.jsx AdminTable(:4610)
//   '데이터를 불러오는 중입니다.'        Admin.jsx(:5216)
//   '전체 N건' / '번호' / '관리'         Admin.jsx AdminTable(:4592/:4599/:4606)
//   '<X> 항목을 입력해주세요.'           Admin.jsx AdminForm submit(:4258).
//                                     X 에 스키마 식별자를 넣는다(창작 아님)
//   '저장 완료'                        Admin.jsx saveRow(:5054)
//   '등록 실패: ' / '수정 실패: ' / ' 조회 실패: '  Admin.jsx saveRow/loadRows
//   'N원'                             Admin.jsx formatValue money(:3240)
const TITLE = '쿠폰관리';

// coupon_redemptions 는 이력 테이블이라 무한히 늘어난다. 목록의 사용 건수는
// (coupon_id, voided_at) 두 컬럼만 받아 클라이언트에서 집계한다 — PostgREST 는
// GROUP BY 를 못 하고, 집계 전용 함수를 새로 만드는 것은 이번 범위의 "sql/ 은
// 필요 최소한" 원칙에 어긋난다. 현재 dev 실측 0행이라 실무 부담이 없고, 이
// 상한에 닿을 볼륨이 되면 그때 집계 RPC 를 만드는 것이 맞다(그 시점에 이 상수가
// 신호가 된다 — 상한에 걸린 집계는 아래에서 별도로 표시한다).
const REDEMPTION_SCAN_LIMIT = 10000;
// 사용이력 드릴다운 1쿠폰당 조회 상한. 서버 페이지네이션은 이번 범위 밖이다.
const REDEMPTION_PAGE_LIMIT = 200;
// 발급 관리 드릴다운 1쿠폰당 조회 상한. 사용이력과 같은 값을 쓴다 — 같은 성격의
// 드릴다운에 서로 다른 상한을 두면 운영자가 어느 화면이 잘렸는지 외워야 한다.
// (PostgREST 의 db-max-rows 아래로 잡아 둔다 — 상한을 그보다 크게 잡으면
//  서버가 먼저 자르고 화면은 잘린 줄 모른다.)
const GRANT_PAGE_LIMIT = 200;
// 사용자 검색 결과 상한. 어드민이 이메일 일부로 좁혀 고르는 용도라 넉넉하다.
const USER_SEARCH_LIMIT = 20;

const INPUT_CLASS =
  'h-9 w-full border border-[#9ca3af] bg-white px-3 text-sm outline-none disabled:bg-gray-100';

function moneyText(value) {
  return `${Number(value || 0).toLocaleString()}원`;
}

// is_active 전용. '사용/미사용' 은 formatValue(Admin.jsx:3238) 가 boolean 컬럼에
// 쓰는 기존 표기이고, is_active 는 실제로 "사용 여부" 라서 의미가 맞다.
function boolText(value) {
  return value ? '사용' : '미사용';
}

// stackable 은 불리언이지만 의미가 "사용 여부" 가 아니라 "다른 쿠폰과 결합 가능"
// 이다 — 여기에 '사용/미사용' 을 쓰면 목록이 거짓말을 한다(폼에서 라벨 없는
// 체크박스를 쓴 것과 같은 이유). 헤더가 컬럼명을 이미 들고 있으므로 값은 기호로만
// 표시한다. 새 한국어 문구를 만들지 않는 쪽의 선택이다.
function flagMark(value) {
  return value ? '✓' : '-';
}

// timestamptz → 'YYYY-MM-DD HH:mm' (Asia/Seoul). Header.jsx:80 / PopupLayer.jsx:7
// 의 명명 존 방식을 따른다 — 오프셋(+9h)을 손으로 더하지 않는다.
function dateTimeText(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date
    .toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' })
    .replace('T', ' ')
    .slice(0, 16);
}

// NULL = 무기한·무제한 규약을 목록에서 표기. 값이 있으면 그대로, NULL 이면 ∞.
function nullableText(value, suffix = '') {
  if (value === null || value === undefined) return UNLIMITED_LABEL ?? UNLIMITED_FALLBACK;
  return `${Number(value).toLocaleString()}${suffix}`;
}

// DB 컬럼명으로 대체하던 폴백은 제거했다 — FIELD_LABEL 을 직접 쓴다. 라벨이
// 아직 승인되지 않은 키(email)는 값 그대로 null 을 반환해 아무것도 그리지
// 않는다(지어낸 문구로 채우지 않는다).
function FieldName({ k }) {
  return FIELD_LABEL[k];
}

const FORM_KEYS = [
  'is_active',
  'slug',
  'code',
  'title',
  'discount_amount',
  'min_amount',
  'valid_until',
  'max_uses_per_user',
  'max_redemptions',
  'stackable',
  'grant_type',
  'grant_on_signup'
];

// coupons_grant_type_check 가 허용하는 값. 라디오 라벨로 이 문자열을 그대로
// (mono 로) 쓴다 — FIELD_LABEL 폴백이 컬럼명을 그대로 보여주는 것과 같은
// 규범이다. '조건형/발급형' 같은 한국어를 여기서 지어내지 않는다.
const GRANT_TYPES = ['auto', 'granted'];

// NULL 을 고를 수 있는 3개 필드. 3상태다:
//   '' = 미선택(신규 등록의 기본값 — 저장이 막힌다)
//   'unlimited' = NULL 을 명시적으로 선택
//   'value' = 값 입력
// max_uses_per_user 를 비운 채 저장되면 다시 무제한 쿠폰이 되므로(이 화면이
// 없애려는 결함 ①) "무제한" 을 고르려면 반드시 골라야 한다. valid_until /
// max_redemptions 도 같은 NULL 규약이라 같은 컨트롤·같은 규칙을 쓴다 — 필드마다
// 다른 규칙을 두면 운영자가 어느 것이 강제인지 외워야 한다.
const NULLABLE_KEYS = ['valid_until', 'max_uses_per_user', 'max_redemptions'];

function emptyForm() {
  return {
    is_active: true,
    slug: '',
    code: '',
    title: '',
    discount_amount: '',
    min_amount: 0,
    stackable: false,
    // DB DEFAULT 와 같은 값으로 시작한다(sql/55 0-e절) — 신규 쿠폰은
    // 조건형이 기본이고, 발급형은 명시적으로 골라야 한다.
    grant_type: 'auto',
    grant_on_signup: false,
    valid_until: '',
    valid_until_mode: '',
    max_uses_per_user: '',
    max_uses_per_user_mode: '',
    max_redemptions: '',
    max_redemptions_mode: ''
  };
}

function rowToForm(row) {
  const form = { ...emptyForm() };

  form.is_active = row.is_active !== false;
  form.slug = row.slug ?? '';
  form.code = row.code ?? '';
  form.title = row.title ?? '';
  form.discount_amount = row.discount_amount ?? '';
  form.min_amount = row.min_amount ?? 0;
  form.stackable = row.stackable === true;
  // 알 수 없는 값이 오면 조건형으로 떨어뜨리지 않고 원본을 그대로 들고 있다가
  // 저장 시 validateForm 이 막는다 — 화면이 조용히 값을 바꿔 저장하면
  // "열어보기만 했는데 정책이 바뀌는" 사고가 된다.
  form.grant_type = row.grant_type ?? 'auto';
  form.grant_on_signup = row.grant_on_signup === true;

  for (const key of NULLABLE_KEYS) {
    const value = row[key];
    form[`${key}_mode`] = value === null || value === undefined ? 'unlimited' : 'value';
    form[key] = value === null || value === undefined ? '' : value;
  }

  return form;
}

function formToPayload(form) {
  const payload = {
    slug: String(form.slug ?? '').trim(),
    // code 는 UNIQUE 인데 NULL 은 다중 허용이다 — 빈 문자열로 저장하면 두 번째
    // 코드 없는 쿠폰이 23505 로 막힌다. 반드시 NULL 로 정규화한다.
    code: String(form.code ?? '').trim() || null,
    title: String(form.title ?? '').trim(),
    discount_amount: Number(form.discount_amount),
    min_amount: Number(form.min_amount),
    is_active: form.is_active === true,
    stackable: form.stackable === true,
    grant_type: form.grant_type,
    // coupons_grant_on_signup_check 가 "granted 가 아니면 켤 수 없다" 를
    // 강제한다 — 폼이 이미 비활성화하지만, 라디오를 되돌린 직후의 잔여값이
    // 그대로 전송돼 23514 원문이 노출되는 걸 여기서도 막는다.
    grant_on_signup: form.grant_type === 'granted' && form.grant_on_signup === true
  };

  for (const key of NULLABLE_KEYS) {
    if (form[`${key}_mode`] === 'unlimited') {
      payload[key] = null;
      continue;
    }
    payload[key] = key === 'valid_until' ? form[key] : Number(form[key]);
  }

  return payload;
}

// 검증 실패한 첫 키를 반환(없으면 null). 문구는 AdminForm 의 기존 템플릿에
// 이 키를 끼워 넣어 만든다 — 새 문구를 만들지 않는다.
function validateForm(form) {
  if (String(form.slug ?? '').trim() === '') return 'slug';
  if (String(form.title ?? '').trim() === '') return 'title';

  const discount = Number(form.discount_amount);
  // DB 에 CHECK 는 없지만 0원/음수 쿠폰은 의미가 없다(fn_redeem_coupons 도
  // 할인 0원을 적용해도 주문 금액이 그대로다). "안 채운 것" 과 같이 취급한다.
  if (!Number.isInteger(discount) || discount <= 0) return 'discount_amount';

  const min = Number(form.min_amount);
  if (!Number.isInteger(min) || min < 0) return 'min_amount';

  // coupons_grant_type_check 를 화면에서 먼저 건다 — 23514 원문 노출 방지.
  if (!GRANT_TYPES.includes(form.grant_type)) return 'grant_type';

  for (const key of NULLABLE_KEYS) {
    const mode = form[`${key}_mode`];
    if (mode !== 'unlimited' && mode !== 'value') return key;
    if (mode !== 'value') continue;

    if (key === 'valid_until') {
      if (String(form[key] ?? '').trim() === '') return key;
      continue;
    }

    const num = Number(form[key]);
    // coupons_max_uses_per_user_check / coupons_max_redemptions_check 가
    // `is null or > 0` 이다 — 여기서 막지 않으면 23514 원문이 노출된다.
    if (!Number.isInteger(num) || num <= 0) return key;
  }

  return null;
}

// 3상태 컨트롤: [∞] / [값] 라디오 + 값 입력. 값 모드가 아니면 입력을 비활성화해
// "무제한인데 숫자가 남아 있는" 화면을 만들지 않는다.
function NullableField({ fieldKey, type, mode, value, onChange }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      <label className="inline-flex items-center gap-2 text-sm font-bold">
        <input
          type="radio"
          name={`${fieldKey}_mode`}
          checked={mode === 'unlimited'}
          onChange={() => onChange({ [`${fieldKey}_mode`]: 'unlimited', [fieldKey]: '' })}
        />
        <span className="text-base leading-none">{UNLIMITED_LABEL ?? UNLIMITED_FALLBACK}</span>
      </label>

      <label className="inline-flex items-center gap-2 text-sm font-bold">
        <input
          type="radio"
          name={`${fieldKey}_mode`}
          checked={mode === 'value'}
          onChange={() => onChange({ [`${fieldKey}_mode`]: 'value' })}
        />
        <span className="w-[10rem]">
          <input
            type={type}
            min={type === 'number' ? 1 : undefined}
            value={value ?? ''}
            disabled={mode !== 'value'}
            onChange={(e) =>
              onChange({
                [fieldKey]: type === 'number' ? e.target.value.replace(/[^0-9]/g, '') : e.target.value
              })
            }
            className={INPUT_CLASS}
          />
        </span>
      </label>
    </div>
  );
}

export default function CouponAdmin() {
  const [view, setView] = useState('list'); // list | create | edit | history | grants
  const [coupons, setCoupons] = useState([]);
  const [redemptionStats, setRedemptionStats] = useState({ byCoupon: {}, truncated: false });
  const [loading, setLoading] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(() => emptyForm());
  const [saving, setSaving] = useState(false);

  const [historyCoupon, setHistoryCoupon] = useState(null);
  const [historyRows, setHistoryRows] = useState([]);
  const [historyProfiles, setHistoryProfiles] = useState({});
  const [historyLoading, setHistoryLoading] = useState(false);
  const [voidingId, setVoidingId] = useState(null);
  const [voidReason, setVoidReason] = useState('');
  // 진행 중 표시. 아이콘 버튼은 더블클릭이 쉬워서(피드백이 alert 뿐이다) 두 번째
  // 호출이 WC002/WC003 알럿을 띄운다 — 요청 중에는 액션을 잠근다.
  const [actionBusy, setActionBusy] = useState(false);

  // ── 발급 관리 ──
  const [grantCoupon, setGrantCoupon] = useState(null);
  const [grantRows, setGrantRows] = useState([]);
  const [grantProfiles, setGrantProfiles] = useState({});
  const [grantLoading, setGrantLoading] = useState(false);
  const [revokingId, setRevokingId] = useState(null);
  const [revokeReason, setRevokeReason] = useState('');
  const [userQuery, setUserQuery] = useState('');
  const [userResults, setUserResults] = useState(null); // null = 아직 검색 안 함
  const [userSearching, setUserSearching] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);

    // 정렬은 slug 오름차순 — sql/55 3)절 fn_usable_coupons 의 `order by c.slug`
    // 와 같은 기준이라 "어드민에서 보이는 순서 = 판정 순회 순서" 가 된다.
    const [couponRes, redemptionRes] = await Promise.all([
      supabase.from('coupons').select('*').order('slug', { ascending: true }),
      supabase
        .from('coupon_redemptions')
        .select('coupon_id, voided_at')
        .limit(REDEMPTION_SCAN_LIMIT)
    ]);

    setLoading(false);

    if (couponRes.error) {
      console.error(couponRes.error);
      alert(`${TITLE} 조회 실패: ${couponRes.error.message}`);
      setCoupons([]);
      return;
    }

    setCoupons(couponRes.data || []);

    if (redemptionRes.error) {
      // 쿠폰 목록 자체는 살린다 — 사용 건수만 못 보는 상태로 열화시킨다.
      console.warn('사용 건수 조회 실패:', redemptionRes.error.message);
      setRedemptionStats({ byCoupon: {}, truncated: false });
      return;
    }

    const byCoupon = {};
    for (const row of redemptionRes.data || []) {
      const bucket = (byCoupon[row.coupon_id] ||= { active: 0, total: 0 });
      bucket.total += 1;
      if (row.voided_at === null) bucket.active += 1;
    }

    setRedemptionStats({
      byCoupon,
      truncated: (redemptionRes.data || []).length >= REDEMPTION_SCAN_LIMIT
    });
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const slugIndex = useMemo(() => {
    const map = new Map();
    for (const row of coupons) map.set(row.slug, row);
    return map;
  }, [coupons]);

  // 입력 중인 slug 가 다른 쿠폰과 충돌하는지. 충돌 쿠폰 행 자체를 반환해
  // 화면에 그대로 보여준다(문구 창작 없이 상황을 전달하는 방법).
  const slugConflict = useMemo(() => {
    const slug = String(form.slug ?? '').trim();
    if (!slug) return null;
    const found = slugIndex.get(slug);
    if (!found) return null;
    if (view === 'edit' && found.id === editingId) return null;
    return found;
  }, [form.slug, slugIndex, view, editingId]);

  function patch(values) {
    setForm((prev) => ({ ...prev, ...values }));
  }

  function openCreate() {
    setForm(emptyForm());
    setEditingId(null);
    setView('create');
  }

  function openEdit(row) {
    setForm(rowToForm(row));
    setEditingId(row.id);
    setView('edit');
  }

  function closeForm() {
    setView('list');
    setEditingId(null);
    setForm(emptyForm());
  }

  async function save() {
    const invalidKey = validateForm(form);
    if (invalidKey) {
      alert(`${invalidKey} 항목을 입력해주세요.`);
      return;
    }

    if (slugConflict) {
      // 사전 검증 — DB 23505(coupons_slug_key) 원문을 사용자에게 보이지 않는다.
      alert(SLUG_DUPLICATE_TEXT ?? 'slug 항목을 입력해주세요.');
      return;
    }

    const payload = formToPayload(form);
    setSaving(true);

    const { error } =
      view === 'create'
        ? await supabase.from('coupons').insert(payload)
        : await supabase.from('coupons').update(payload).eq('id', editingId);

    setSaving(false);

    if (error) {
      alert(`${view === 'create' ? '등록' : '수정'} 실패: ${error.message}`);
      return;
    }

    alert('저장 완료');
    closeForm();
    await loadList();
  }

  async function openHistory(row) {
    setHistoryCoupon(row);
    setHistoryRows([]);
    setHistoryProfiles({});
    setVoidingId(null);
    setVoidReason('');
    setView('history');
    await loadHistory(row.id);
  }

  async function loadHistory(couponId) {
    setHistoryLoading(true);

    const { data, error } = await supabase
      .from('coupon_redemptions')
      .select('*')
      .eq('coupon_id', couponId)
      .order('created_at', { ascending: false })
      .limit(REDEMPTION_PAGE_LIMIT);

    if (error) {
      setHistoryLoading(false);
      console.error(error);
      alert(`${TITLE} 조회 실패: ${error.message}`);
      setHistoryRows([]);
      return;
    }

    const rows = data || [];
    setHistoryRows(rows);

    // coupon_redemptions.user_id 는 auth.users 를 참조하므로 PostgREST 임베딩으로
    // profiles 를 끌어올 수 없다(profiles 로 가는 FK 가 없다) — 별도 조회한다.
    // 게스트 결제는 user_id 가 NULL 이라 빠진다.
    const userIds = [...new Set(rows.map((row) => row.user_id).filter(Boolean))];

    if (userIds.length > 0) {
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('id, name, email')
        .in('id', userIds);

      if (profileError) {
        // 이력 자체는 살린다 — 사용자 이름만 못 보는 상태로 열화시킨다.
        console.warn('사용자 조회 실패:', profileError.message);
      } else {
        const map = {};
        for (const profile of profiles || []) map[profile.id] = profile;
        setHistoryProfiles(map);
      }
    }

    setHistoryLoading(false);
  }

  async function submitVoid(row) {
    if (actionBusy) return;
    setActionBusy(true);

    const { error } = await supabase.rpc('fn_void_coupon_redemption', {
      p_redemption_id: row.id,
      p_reason: voidReason.trim() || null
    });

    if (error) {
      setActionBusy(false);
      // 42501(관리자 아님)과 WC002(없음/이미 무효화)를 뭉뚱그리지 않는다.
      // 문구가 승인되기 전까지는 DB 원문(error.message)을 그대로 보여준다.
      alert(`수정 실패: ${VOID_ERROR_TEXT[error.code] ?? error.message}`);
      return;
    }

    setVoidingId(null);
    setVoidReason('');
    alert('저장 완료');
    await loadHistory(row.coupon_id);
    // 목록의 사용 건수(유효/전체)도 갱신돼야 한다.
    await loadList();
    setActionBusy(false);
  }

  // ── 발급 관리 ──────────────────────────────────────────────────────
  async function openGrants(row) {
    setGrantCoupon(row);
    setGrantRows([]);
    setGrantProfiles({});
    setRevokingId(null);
    setRevokeReason('');
    setUserQuery('');
    setUserResults(null);
    setView('grants');
    await loadGrants(row.id);
  }

  async function loadGrants(couponId) {
    setGrantLoading(true);

    const { data, error } = await supabase
      .from('coupon_grants')
      .select('*')
      .eq('coupon_id', couponId)
      .order('granted_at', { ascending: false })
      .limit(GRANT_PAGE_LIMIT);

    if (error) {
      setGrantLoading(false);
      console.error(error);
      alert(`${TITLE} 조회 실패: ${error.message}`);
      setGrantRows([]);
      return;
    }

    const rows = data || [];
    setGrantRows(rows);

    // coupon_grants.user_id 는 auth.users FK 라 profiles 를 임베딩할 수 없다 —
    // 사용이력(loadHistory)과 같은 방식으로 따로 조회한다.
    const userIds = [...new Set(rows.map((row) => row.user_id).filter(Boolean))];

    if (userIds.length > 0) {
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('id, name, email')
        .in('id', userIds);

      if (profileError) {
        // 발급 목록 자체는 살린다 — 사용자 이름만 못 보는 상태로 열화시킨다.
        console.warn('사용자 조회 실패:', profileError.message);
      } else {
        const map = {};
        for (const profile of profiles || []) map[profile.id] = profile;
        setGrantProfiles(map);
      }
    }

    setGrantLoading(false);
  }

  // 이미 살아있는 발급을 가진 사용자 id 집합. 검색 결과에서 발급 버튼을 감추는
  // 데 쓴다 — fn_grant_coupon 은 멱등이라 눌러도 안전하지만, 버튼이 있으면
  // "눌렀는데 아무 일도 안 일어난다" 로 읽힌다.
  const grantedUserIds = useMemo(
    () => new Set(grantRows.filter((row) => row.revoked_at === null).map((row) => row.user_id)),
    [grantRows]
  );

  async function searchUsers() {
    // PostgREST 의 or 필터는 콤마·괄호로 절을 구분한다 — 검색어에 그 문자가
    // 있으면 필터 문법이 깨진다(주입이 아니라 파싱 오류). 미리 걷어낸다.
    const query = userQuery.trim().replace(/[,()*"\\]/g, '');
    if (!query) {
      setUserResults(null);
      return;
    }

    setUserSearching(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, email')
      .or(`email.ilike.%${query}%,name.ilike.%${query}%`)
      .limit(USER_SEARCH_LIMIT);
    setUserSearching(false);

    if (error) {
      console.error(error);
      alert(`${TITLE} 조회 실패: ${error.message}`);
      setUserResults([]);
      return;
    }

    setUserResults(data || []);
  }

  async function submitGrant(profile) {
    if (actionBusy || !grantCoupon) return;
    setActionBusy(true);

    // 쓰기는 RPC 전용이다 — coupon_grants 에는 insert 정책이 없다(sql/55 1-h절).
    const { error } = await supabase.rpc('fn_grant_coupon', {
      p_coupon_id: grantCoupon.id,
      p_user_id: profile.id
    });

    if (error) {
      setActionBusy(false);
      alert(`등록 실패: ${GRANT_ERROR_TEXT[error.code] ?? error.message}`);
      return;
    }

    alert('저장 완료');
    await loadGrants(grantCoupon.id);
    setActionBusy(false);
  }

  async function submitRevoke(row) {
    if (actionBusy) return;
    setActionBusy(true);

    const { error } = await supabase.rpc('fn_revoke_coupon_grant', {
      p_grant_id: row.id,
      p_reason: revokeReason.trim() || null
    });

    if (error) {
      setActionBusy(false);
      alert(`수정 실패: ${GRANT_ERROR_TEXT[error.code] ?? error.message}`);
      return;
    }

    setRevokingId(null);
    setRevokeReason('');
    alert('저장 완료');
    await loadGrants(row.coupon_id);
    setActionBusy(false);
  }

  // ── 목록 ────────────────────────────────────────────────────────────
  if (view === 'list') {
    return (
      <>
        <div className="mb-6 bg-white px-6 py-5 shadow">
          <div className="flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={loadList}
              className="inline-flex h-9 items-center gap-2 border border-gray-500 bg-white px-4 text-sm font-bold"
            >
              <RefreshCw size={14} />
              초기화
            </button>
          </div>

          <div className="mt-4 flex items-center justify-between gap-4">
            <h1 className="text-xl font-black">{TITLE}</h1>

            <button
              type="button"
              onClick={openCreate}
              className="inline-flex h-9 shrink-0 items-center gap-1 whitespace-nowrap bg-[#2348ff] px-4 text-sm font-black text-white"
            >
              <Plus size={14} />
              등록
            </button>
          </div>
        </div>

        {loading ? (
          <div className="bg-white p-12 text-center text-sm font-bold text-gray-500 shadow">
            데이터를 불러오는 중입니다.
          </div>
        ) : (
          <div className="bg-white p-6 shadow">
            <div className="mb-4 text-sm font-bold text-gray-500">
              전체 <span className="text-blue-600">{coupons.length}</span>건
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[71.25rem] border-collapse text-sm">
                <thead>
                  <tr className="border-y border-gray-300">
                    <th className="w-14 px-3 py-3 text-left">번호</th>
                    {[
                      'slug',
                      'title',
                      'discount_amount',
                      'min_amount',
                      'valid_until',
                      'max_uses_per_user',
                      'max_redemptions',
                      'stackable',
                      'grant_type',
                      'grant_on_signup',
                      'used',
                      'is_active'
                    ].map((key) => (
                      <th key={key} className="px-3 py-3 text-left">
                        <FieldName k={key} />
                      </th>
                    ))}
                    {/* 관리 칼럼을 sticky 로 고정한다. 칼럼이 12개라 1440 이하에서
                        표가 컨테이너보다 넓어지는데(페이지 가로 스크롤은 0 이지만
                        표 안에서 잘린다), 액션이 오른쪽 끝에 있어 기본 화면에서
                        보이지 않으면 발급·이력 진입점이 없는 화면이 된다. */}
                    <th className="sticky right-0 w-28 bg-white px-3 py-3 text-center">관리</th>
                  </tr>
                </thead>

                <tbody>
                  {coupons.length === 0 ? (
                    <tr>
                      <td colSpan={14} className="py-12 text-center text-gray-400">
                        등록된 데이터가 없습니다.
                      </td>
                    </tr>
                  ) : (
                    coupons.map((row, index) => {
                      const used = redemptionStats.byCoupon[row.id] || { active: 0, total: 0 };

                      return (
                        <tr
                          key={row.id}
                          className={`border-b border-gray-100 ${
                            row.is_active ? '' : 'bg-[#fafafa] text-gray-400'
                          }`}
                        >
                          <td className="px-3 py-3">{index + 1}</td>

                          {/* slug 단독으로 판단하지 않도록 금액을 같은 셀에 붙여
                              보여준다 — 'signup-6000' 이 실제로 2,000원이던
                              사고(sql/55 P1-2)가 여기서 반복되지 않게 하는 지점이다. */}
                          <td className="px-3 py-3">
                            <div className="font-mono text-[0.8125rem] font-bold">{row.slug}</div>
                            <div className="text-xs font-bold text-blue-600">
                              {moneyText(row.discount_amount)}
                            </div>
                            {row.code && (
                              <div className="font-mono text-xs text-gray-500">{row.code}</div>
                            )}
                          </td>

                          <td className="px-3 py-3">{row.title}</td>
                          <td className="px-3 py-3">{moneyText(row.discount_amount)}</td>
                          <td className="px-3 py-3">{moneyText(row.min_amount)}</td>
                          <td className="px-3 py-3">
                            {row.valid_until ?? (UNLIMITED_LABEL ?? UNLIMITED_FALLBACK)}
                          </td>
                          <td className="px-3 py-3">{nullableText(row.max_uses_per_user)}</td>
                          <td className="px-3 py-3">{nullableText(row.max_redemptions)}</td>
                          <td className="px-3 py-3">{flagMark(row.stackable)}</td>

                          {/* 값(auto/granted)을 그대로 보여준다 — 폼의 라디오
                              라벨과 같은 문자열이라 화면 사이에서 말이 바뀌지 않는다. */}
                          <td className="px-3 py-3 font-mono text-[0.8125rem]">{row.grant_type}</td>
                          <td className="px-3 py-3">{flagMark(row.grant_on_signup)}</td>

                          {/* 유효 건수 / 전체 건수(무효화 포함)를 둘 다 보여준다 —
                              void 한 이력이 사라지지 않는 것이 이 도메인의 원칙이라
                              전체만 보이면 "왜 소진인데 쓸 수 있나" 를, 유효만 보이면
                              "되돌린 기록" 을 각각 놓친다. */}
                          <td className="px-3 py-3 font-mono text-[0.8125rem]">
                            {used.active} / {used.total}
                            {redemptionStats.truncated && '+'}
                          </td>

                          <td className="px-3 py-3">{boolText(row.is_active)}</td>

                          <td
                            className={`sticky right-0 px-3 py-3 ${
                              row.is_active ? 'bg-white' : 'bg-[#fafafa]'
                            }`}
                          >
                            <div className="flex justify-center gap-3">
                              {/* 수정 아이콘은 AdminTable(:4674)의 기존 액션과
                                  같은 아이콘·같은 무라벨 규범을 그대로 따른다. */}
                              <button
                                type="button"
                                onClick={() => openEdit(row)}
                                className="text-gray-500 hover:text-black"
                              >
                                <Edit3 size={17} />
                              </button>

                              <button
                                type="button"
                                onClick={() => openHistory(row)}
                                aria-label={HISTORY_ACTION_LABEL ?? undefined}
                                className="text-gray-500 hover:text-blue-600"
                              >
                                <History size={17} />
                              </button>

                              {/* 발급 관리는 발급형에만 의미가 있다. 조건형에
                                  버튼을 두면 "눌렀는데 아무도 없는" 빈 화면이
                                  열리거나, 발급 시 WC004 로만 실패하는 버튼이
                                  된다 — 아예 그리지 않는다. */}
                              {row.grant_type === 'granted' && (
                                <button
                                  type="button"
                                  onClick={() => openGrants(row)}
                                  aria-label={GRANTS_ACTION_LABEL ?? undefined}
                                  className="text-gray-500 hover:text-blue-600"
                                >
                                  <Users size={17} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </>
    );
  }

  // ── 사용이력 ────────────────────────────────────────────────────────
  if (view === 'history') {
    return (
      <>
        <div className="mb-6 bg-white px-6 py-5 shadow">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setView('list');
                setHistoryCoupon(null);
              }}
              aria-label={BACK_ACTION_LABEL ?? undefined}
              className="inline-flex h-9 w-9 items-center justify-center border border-gray-500 bg-white"
            >
              <ChevronLeft size={15} />
            </button>

            <h1 className="text-xl font-black">{TITLE}</h1>
          </div>

          {/* 어느 쿠폰의 이력인지 — 값(데이터)만으로 식별한다. */}
          {historyCoupon && (
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-bold">
              <span className="font-mono text-[0.8125rem]">{historyCoupon.slug}</span>
              <span>{historyCoupon.title}</span>
              <span className="text-blue-600">{moneyText(historyCoupon.discount_amount)}</span>
              <span className="text-gray-500">{boolText(historyCoupon.is_active)}</span>
            </div>
          )}
        </div>

        {historyLoading ? (
          <div className="bg-white p-12 text-center text-sm font-bold text-gray-500 shadow">
            데이터를 불러오는 중입니다.
          </div>
        ) : (
          <div className="bg-white p-6 shadow">
            <div className="mb-4 text-sm font-bold text-gray-500">
              전체 <span className="text-blue-600">{historyRows.length}</span>건
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[62.5rem] border-collapse text-sm">
                <thead>
                  <tr className="border-y border-gray-300">
                    <th className="w-14 px-3 py-3 text-left">번호</th>
                    {['order_id', 'user', 'discount_amount', 'created_at', 'voided_at', 'void_reason'].map(
                      (key) => (
                        <th key={key} className="px-3 py-3 text-left">
                          <FieldName k={key} />
                        </th>
                      )
                    )}
                    <th className="w-24 px-3 py-3 text-center">관리</th>
                  </tr>
                </thead>

                <tbody>
                  {historyRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-gray-400">
                        등록된 데이터가 없습니다.
                      </td>
                    </tr>
                  ) : (
                    historyRows.map((row, index) => {
                      const profile = row.user_id ? historyProfiles[row.user_id] : null;
                      const voided = row.voided_at !== null;

                      return (
                        <tr
                          key={row.id}
                          className={`border-b border-gray-100 ${voided ? 'text-gray-400' : ''}`}
                        >
                          <td className="px-3 py-3">{historyRows.length - index}</td>

                          <td className="px-3 py-3 font-mono text-xs">{row.order_id}</td>

                          <td className="px-3 py-3">
                            {row.user_id ? (
                              <>
                                <div className="font-bold">{profile?.name || profile?.email || '-'}</div>
                                <div className="font-mono text-xs text-gray-500">{row.user_id}</div>
                              </>
                            ) : (
                              '-'
                            )}
                          </td>

                          <td className="px-3 py-3">{moneyText(row.discount_amount)}</td>
                          <td className="px-3 py-3">{dateTimeText(row.created_at)}</td>
                          <td className="px-3 py-3">{dateTimeText(row.voided_at)}</td>
                          <td className="px-3 py-3">{row.void_reason || '-'}</td>

                          <td className="px-3 py-3">
                            {voided ? (
                              <div className="text-center text-gray-300">-</div>
                            ) : voidingId === row.id ? (
                              // 2단계 액션. 확인 문구(window.confirm)를 쓰려면 새
                              // 한국어 문구가 필요한데 '정말 삭제하시겠습니까?' 는
                              // void 가 삭제가 아니라서 거짓말이 된다. 대신 사유
                              // 입력을 한 단계 끼워 오조작을 구조로 막는다.
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={voidReason}
                                  placeholder={VOID_REASON_PLACEHOLDER ?? undefined}
                                  onChange={(e) => setVoidReason(e.target.value)}
                                  className={`${INPUT_CLASS} w-[12rem]`}
                                />
                                <button
                                  type="button"
                                  onClick={() => submitVoid(row)}
                                  disabled={actionBusy}
                                  className="text-red-600 hover:text-red-800 disabled:opacity-40"
                                >
                                  <Check size={17} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setVoidingId(null);
                                    setVoidReason('');
                                  }}
                                  className="text-gray-500 hover:text-black"
                                >
                                  <X size={17} />
                                </button>
                              </div>
                            ) : (
                              <div className="flex justify-center">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setVoidingId(row.id);
                                    setVoidReason('');
                                  }}
                                  aria-label={VOID_ACTION_LABEL ?? undefined}
                                  className="text-gray-500 hover:text-red-600"
                                >
                                  <Ban size={17} />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </>
    );
  }

  // ── 발급 관리 ────────────────────────────────────────────────────────
  if (view === 'grants') {
    return (
      <>
        <div className="mb-6 bg-white px-6 py-5 shadow">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setView('list');
                setGrantCoupon(null);
              }}
              aria-label={BACK_ACTION_LABEL ?? undefined}
              className="inline-flex h-9 w-9 items-center justify-center border border-gray-500 bg-white"
            >
              <ChevronLeft size={15} />
            </button>

            <h1 className="text-xl font-black">{TITLE}</h1>
          </div>

          {/* 어느 쿠폰의 발급인지 — 사용이력 헤더와 같은 형태. valid_until 을
              함께 보여준다: 발급받아도 쿠폰 자신의 기한이 지나면 못 쓰기
              때문이다(발급별 만료일은 두지 않았다 — sql/55 1-h절). */}
          {grantCoupon && (
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-bold">
              <span className="font-mono text-[0.8125rem]">{grantCoupon.slug}</span>
              <span>{grantCoupon.title}</span>
              <span className="text-blue-600">{moneyText(grantCoupon.discount_amount)}</span>
              <span className="text-gray-500">
                {grantCoupon.valid_until ?? (UNLIMITED_LABEL ?? UNLIMITED_FALLBACK)}
              </span>
              <span className="text-gray-500">{boolText(grantCoupon.is_active)}</span>
            </div>
          )}
        </div>

        {/* 개별 발급 — 사용자를 찾아서 준다. 이메일·이름 검색은 profiles 를
            직접 조회한다(profiles_admin_select_all 정책). 발급 자체는 RPC 다. */}
        <div className="mb-6 bg-white p-6 shadow">
          <div className="mb-3 text-sm font-black">
            <FieldName k="email" />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="w-[20rem] max-w-full">
              <input
                type="text"
                value={userQuery}
                placeholder={USER_SEARCH_PLACEHOLDER ?? undefined}
                onChange={(e) => setUserQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') searchUsers();
                }}
                className={INPUT_CLASS}
              />
            </span>
            <button
              type="button"
              onClick={searchUsers}
              className="inline-flex h-9 items-center gap-2 border border-gray-500 bg-white px-4 text-sm font-bold"
            >
              <Search size={14} />
              조회
            </button>
          </div>

          {userSearching && (
            <div className="mt-4 text-sm font-bold text-gray-500">데이터를 불러오는 중입니다.</div>
          )}

          {!userSearching && userResults !== null && (
            <div className="mt-4 border-t border-gray-200">
              {userResults.length === 0 ? (
                <div className="py-6 text-center text-sm text-gray-400">
                  등록된 데이터가 없습니다.
                </div>
              ) : (
                userResults.map((profile) => {
                  const already = grantedUserIds.has(profile.id);

                  return (
                    <div
                      key={profile.id}
                      className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 py-3"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-bold">{profile.name || '-'}</div>
                        <div className="font-mono text-xs text-gray-500">{profile.email}</div>
                      </div>

                      {already ? (
                        // 이미 살아있는 발급이 있으면 버튼 대신 상태 표시만 둔다.
                        <span
                          className="text-green-600"
                          title={ALREADY_GRANTED_TEXT ?? undefined}
                          aria-label={ALREADY_GRANTED_TEXT ?? undefined}
                        >
                          <Check size={17} />
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => submitGrant(profile)}
                          disabled={actionBusy}
                          className="inline-flex h-9 shrink-0 items-center gap-1 whitespace-nowrap bg-[#2348ff] px-4 text-sm font-black text-white disabled:opacity-50"
                        >
                          <Plus size={14} />
                          등록
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {grantLoading ? (
          <div className="bg-white p-12 text-center text-sm font-bold text-gray-500 shadow">
            데이터를 불러오는 중입니다.
          </div>
        ) : (
          <div className="bg-white p-6 shadow">
            <div className="mb-4 text-sm font-bold text-gray-500">
              전체 <span className="text-blue-600">{grantRows.length}</span>건
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[62.5rem] border-collapse text-sm">
                <thead>
                  <tr className="border-y border-gray-300">
                    <th className="w-14 px-3 py-3 text-left">번호</th>
                    {['user', 'granted_by', 'granted_at', 'revoked_at', 'revoke_reason'].map(
                      (key) => (
                        <th key={key} className="px-3 py-3 text-left">
                          <FieldName k={key} />
                        </th>
                      )
                    )}
                    <th className="w-24 px-3 py-3 text-center">관리</th>
                  </tr>
                </thead>

                <tbody>
                  {grantRows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-gray-400">
                        등록된 데이터가 없습니다.
                      </td>
                    </tr>
                  ) : (
                    grantRows.map((row, index) => {
                      const profile = grantProfiles[row.user_id];
                      const revoked = row.revoked_at !== null;

                      return (
                        <tr
                          key={row.id}
                          className={`border-b border-gray-100 ${revoked ? 'text-gray-400' : ''}`}
                        >
                          <td className="px-3 py-3">{grantRows.length - index}</td>

                          <td className="px-3 py-3">
                            <div className="font-bold">{profile?.name || profile?.email || '-'}</div>
                            <div className="font-mono text-xs text-gray-500">{row.user_id}</div>
                          </td>

                          <td className="px-3 py-3 font-mono text-[0.8125rem]">{row.granted_by}</td>
                          <td className="px-3 py-3">{dateTimeText(row.granted_at)}</td>
                          <td className="px-3 py-3">{dateTimeText(row.revoked_at)}</td>
                          <td className="px-3 py-3">{row.revoke_reason || '-'}</td>

                          <td className="px-3 py-3">
                            {revoked ? (
                              // 회수된 행은 사라지지 않는다(원장). 다시 회수할 수도
                              // 없다 — 되돌리려면 "다시 발급"(새 행)이다.
                              <div className="text-center text-gray-300">-</div>
                            ) : revokingId === row.id ? (
                              // void 와 같은 2단계 게이트. window.confirm 을 쓰면
                              // 새 한국어 문구가 필요해진다.
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={revokeReason}
                                  placeholder={REVOKE_REASON_PLACEHOLDER ?? undefined}
                                  onChange={(e) => setRevokeReason(e.target.value)}
                                  className={`${INPUT_CLASS} w-[12rem]`}
                                />
                                <button
                                  type="button"
                                  onClick={() => submitRevoke(row)}
                                  disabled={actionBusy}
                                  className="text-red-600 hover:text-red-800 disabled:opacity-40"
                                >
                                  <Check size={17} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setRevokingId(null);
                                    setRevokeReason('');
                                  }}
                                  className="text-gray-500 hover:text-black"
                                >
                                  <X size={17} />
                                </button>
                              </div>
                            ) : (
                              <div className="flex justify-center">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setRevokingId(row.id);
                                    setRevokeReason('');
                                  }}
                                  aria-label={REVOKE_ACTION_LABEL ?? undefined}
                                  className="text-gray-500 hover:text-red-600"
                                >
                                  <Ban size={17} />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </>
    );
  }

  // ── 생성 · 수정 ──────────────────────────────────────────────────────
  const editingRow = view === 'edit' ? coupons.find((row) => row.id === editingId) : null;

  return (
    <div>
      <h1 className="mb-5 text-2xl font-black text-[#111827]">
        {TITLE} {view === 'create' ? '등록' : '수정'}
      </h1>

      <div className="bg-white shadow">
        {editingRow && (
          <div className="grid grid-cols-[13.75rem_1fr] border-b border-[#edf0f4]">
            <div className="bg-[#fafafa] px-5 py-3 text-sm font-black">
              <FieldName k="id" />
            </div>
            <div className="px-5 py-3 font-mono text-xs">
              {editingRow.id}
              <span className="ml-3 font-sans text-xs font-bold text-gray-500">
                {dateTimeText(editingRow.created_at)}
              </span>
            </div>
          </div>
        )}

        {FORM_KEYS.map((key) => (
          <div key={key} className="grid grid-cols-[13.75rem_1fr] border-b border-[#edf0f4]">
            <div className="bg-[#fafafa] px-5 py-3 text-sm font-black">
              <FieldName k={key} />
              {/* 필수 표시는 AdminForm 과 같은 규범(빨간 별표). NULL 을 고를 수
                  있는 3필드도 "선택 자체" 가 필수다 — 비워둘 수 없다. code 는
                  비워도 되고(코드 없는 쿠폰), stackable 은 불리언이라 항상 값이
                  있다(기본 false) — 둘만 별표가 없다. */}
              {key !== 'code' && key !== 'stackable' && key !== 'grant_on_signup' && (
                <span className="ml-1 text-red-500">*</span>
              )}
            </div>

            <div className="px-5 py-3">
              {key === 'is_active' && (
                <div className="flex items-center gap-6">
                  <label className="inline-flex items-center gap-2 text-sm font-bold">
                    <input
                      type="radio"
                      name="is_active"
                      checked={form.is_active === true}
                      onChange={() => patch({ is_active: true })}
                    />
                    사용
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm font-bold">
                    <input
                      type="radio"
                      name="is_active"
                      checked={form.is_active === false}
                      onChange={() => patch({ is_active: false })}
                    />
                    미사용
                  </label>
                </div>
              )}

              {key === 'stackable' && (
                // 불리언이지만 '사용/미사용' 의미가 아니라(결합 가능 여부) 그
                // 문구를 재사용하면 거짓말이 된다 — 라벨 없는 체크박스로 둔다.
                // 기본은 배타(false)다: sql/55 0-c절.
                <input
                  type="checkbox"
                  checked={form.stackable === true}
                  onChange={(e) => patch({ stackable: e.target.checked })}
                />
              )}

              {key === 'grant_type' && (
                // 값(auto/granted)을 그대로 라벨로 쓴다 — FIELD_LABEL 폴백이
                // 컬럼명을 그대로 보여주는 것과 같은 규범이고, 목록 셀에도 같은
                // 문자열이 뜬다. is_active 의 '사용/미사용' 을 재사용하면
                // "배포 방식" 이 "사용 여부" 로 읽혀 화면이 거짓말을 한다.
                <div className="flex items-center gap-6">
                  {GRANT_TYPES.map((value) => (
                    <label key={value} className="inline-flex items-center gap-2 text-sm font-bold">
                      <input
                        type="radio"
                        name="grant_type"
                        checked={form.grant_type === value}
                        onChange={() =>
                          patch(
                            // 조건형으로 되돌리면 grant_on_signup 도 함께 끈다 —
                            // coupons_grant_on_signup_check 가 그 조합을 금지한다.
                            value === 'granted'
                              ? { grant_type: value }
                              : { grant_type: value, grant_on_signup: false }
                          )
                        }
                      />
                      <span className="font-mono text-[0.8125rem]">{value}</span>
                    </label>
                  ))}
                </div>
              )}

              {key === 'grant_on_signup' && (
                // stackable 과 같은 라벨 없는 체크박스. 발급형이 아니면 켤 수
                // 없으므로(DB CHECK) 비활성화한다 — "켰는데 저장이 23514 로
                // 실패하는" 화면을 만들지 않는다.
                <input
                  type="checkbox"
                  checked={form.grant_on_signup === true}
                  disabled={form.grant_type !== 'granted'}
                  onChange={(e) => patch({ grant_on_signup: e.target.checked })}
                />
              )}

              {key === 'slug' && (
                <>
                  <input
                    type="text"
                    value={form.slug}
                    onChange={(e) => patch({ slug: e.target.value })}
                    className={`${INPUT_CLASS} font-mono ${
                      slugConflict ? 'border-red-500' : ''
                    }`}
                  />
                  {slugConflict && (
                    // 문구를 지어내지 않고 "충돌한 기존 쿠폰 행" 을 그대로 보여준다.
                    <div className="mt-2 border border-red-300 bg-red-50 px-3 py-2 text-xs font-bold">
                      {SLUG_DUPLICATE_TEXT && (
                        <div className="mb-1 text-red-600">{SLUG_DUPLICATE_TEXT}</div>
                      )}
                      <span className="font-mono">{slugConflict.slug}</span>
                      <span className="mx-2">{slugConflict.title}</span>
                      <span className="text-blue-600">
                        {moneyText(slugConflict.discount_amount)}
                      </span>
                      <span className="ml-2 text-gray-500">{boolText(slugConflict.is_active)}</span>
                    </div>
                  )}
                </>
              )}

              {(key === 'code' || key === 'title') && (
                <input
                  type="text"
                  value={form[key]}
                  onChange={(e) => patch({ [key]: e.target.value })}
                  className={`${INPUT_CLASS} ${key === 'code' ? 'font-mono' : ''}`}
                />
              )}

              {(key === 'discount_amount' || key === 'min_amount') && (
                <div className="flex items-center gap-3">
                  <span className="w-[10rem]">
                    <input
                      type="number"
                      min={key === 'discount_amount' ? 1 : 0}
                      value={form[key]}
                      onChange={(e) => patch({ [key]: e.target.value.replace(/[^0-9]/g, '') })}
                      className={INPUT_CLASS}
                    />
                  </span>
                  {/* 금액을 사람이 읽는 형태로 함께 보여준다 — 자릿수 오입력
                      (2,000 ↔ 20,000)이 이 도메인의 실제 사고 유형이었다. */}
                  <span className="text-sm font-bold text-blue-600">
                    {moneyText(form[key] === '' ? 0 : form[key])}
                  </span>
                </div>
              )}

              {NULLABLE_KEYS.includes(key) && (
                <NullableField
                  fieldKey={key}
                  type={key === 'valid_until' ? 'date' : 'number'}
                  mode={form[`${key}_mode`]}
                  value={form[key]}
                  onChange={patch}
                />
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={closeForm}
          className="h-10 bg-[#4b5563] px-5 text-sm font-black text-white"
        >
          취소
        </button>

        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="h-10 bg-[#2348ff] px-5 text-sm font-black text-white disabled:opacity-50"
        >
          저장
        </button>
      </div>
    </div>
  );
}
