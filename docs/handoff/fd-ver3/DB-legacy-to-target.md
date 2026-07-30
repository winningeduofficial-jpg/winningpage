# 무료진단 데이터 계층: legacy(main) → fd-ver3 시안 매핑 분석

- 작성일: 2026-07-29
- 조사 대상(AS-IS): `main` 브랜치 `/Users/hyunsoo/uwellnow/winningpage`
  - `src/pages/FreeDiagnosis.jsx` (559줄)
  - `src/pages/Admin.jsx` L1325~1352(상수), L1621~2217(`FreeDiagnosisAdmin`)
  - `src/App.jsx` L59 (라우트)
- 조사 대상(TO-BE): `docs/handoff/fd-ver3/` 의 landing / survey-8753 / 9045 / 9491 / 9866 / 10656 / 12784
- 성격: READ-ONLY 조사. 코드 변경 없음. DB 는 익명키 기준 **읽기 전용 프로브**(GET)만 수행.
- 표기: 코드/DB 응답으로 **확인된 사실**은 그대로, 근거가 간접적이면 **(추정)** 을 붙였다.

---

## 0. 30초 요약

| 항목 | 결론 |
|---|---|
| legacy 스키마 | 3테이블 · 총 25컬럼. "문항 → 선택지 → 추천 프로그램" 단일 경로만 표현 가능 |
| 마이그레이션 SQL | **repo 에 없음**. `sql/pricing_orders.sql` 하나뿐이고 free_diagnosis 관련 DDL 은 전무 (Supabase 대시보드에서 수기 생성한 것으로 추정) |
| 결과 산출 | 선택된 옵션들의 `program_ids` **합집합(OR)** → 중복 제거 → `sort_order` 정렬. 점수·가중치·분기 없음 |
| 응답 저장 | **전혀 없음**. INSERT 코드 0건, 응답/리드 테이블 0개 (DB 프로브로 부재 확인) |
| 인증 게이트 | 라우트는 public, 컴포넌트 내부 "시작하기" 클릭 시점에만 로그인 확인 |
| 새 시안 수용 가능성 | 19문항 중 **단일선택 10문항만 그대로 수용**. 복수선택은 부분 수용, 나머지 8종은 스키마 확장 없이는 불가 |
| 새 결과화면 | legacy `programs` 매핑은 결과 리포트 전체 중 **§4.5 "추천 지원 서비스" 카드 1개 블록**에만 대응. 나머지(레이더 6축 점수·우선순위표·서술 문단·입결 비교)는 **전부 미대응** |

---

## 1. legacy 스키마 (역추론 + DB 프로브로 확정)

### 1.1 조사 방법

1. `Admin.jsx` 의 insert/update payload 와 `FreeDiagnosis.jsx` 의 select/사용처를 전수 grep
2. PostgREST 로 컬럼 존재 여부 프로브: `GET /rest/v1/<table>?select=<col>&limit=1` → `42703` 이면 부재
3. 타입은 잘못된 값으로 필터해 캐스팅 에러 메시지로 확인: `?id=eq.zzz` → `invalid input syntax for type uuid`

> DB 프로브는 `.env.local` 의 dev 프로젝트 익명키로 수행했다. 세 테이블 모두 존재하나 **dev DB 에는 행이 0건**이라 값 샘플은 얻지 못했다(빈 배열 반환). 컬럼/타입은 에러 메시지 기반이라 신뢰도 높음. NOT NULL·DEFAULT·CHECK·인덱스·RLS 정책은 REST 로 확인 불가 → 해당 항목만 (추정).

### 1.2 `free_diagnosis_questions`

| 컬럼 | 타입(확인) | 용도 | 코드 근거 |
|---|---|---|---|
| `id` | `uuid` | PK | `.eq('id', question.id)` |
| `title` | `text` (추정) | 질문 문구 | Admin `title`, FD `question.title` |
| `description` | `text` (추정) | 질문 보조 설명 | FD L416 조건부 렌더 |
| `input_type` | `text` (추정, **enum 아님**) | `'single'` \| `'multiple'` | Admin Select 2값 고정, FD L238/392 분기 |
| `is_required` | `boolean` | 필수 여부 → 제출 가능 판정 | FD L166~174 |
| `is_active` | `boolean` | 노출 여부 | FD `.eq('is_active', true)` |
| `sort_order` | `integer` | 정렬 1순위 | `.order('sort_order')` |
| `question_key` | 존재 확인, 타입 미확인 | **코드에서 읽지도 쓰지도 않음 — 사표(死表) 컬럼** | grep 0건 |
| `created_at` | `timestamptz` | 정렬 2순위 | `.order('created_at')` |
| `updated_at` | `timestamptz` (추정) | 미사용 | grep 0건 |

`input_type` 은 `?input_type=eq.zzz` 가 에러 없이 통과했으므로 **PostgreSQL enum 타입이 아니다**(= 새 값 저장 시 타입 에러는 안 남). 다만 CHECK 제약 유무는 SELECT 로 확인 불가하므로 "새 값 삽입 가능"은 **(추정)**.

### 1.3 `free_diagnosis_options`

| 컬럼 | 타입(확인) | 용도 | 코드 근거 |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `question_id` | `uuid` | FK → questions.id | Admin insert, FD 그룹핑 L154 |
| `label` | `text` (추정) | 선택지 문구 (**유일한 표시 필드**) | FD L431 |
| `program_ids` | **배열 타입 (text[] 추정)** | 이 선택지 선택 시 노출할 프로그램 id 목록 | `ProgramSelector`, FD L186 |
| `is_active` | `boolean` | 노출 여부 | |
| `sort_order` | `integer` | 정렬 | |
| `question_key` | 존재 확인 | **미사용 사표 컬럼** | grep 0건 |
| `created_at` / `updated_at` | `timestamptz` | 정렬 / 미사용 | |

`program_ids` 프로브 결과:
- `?program_ids=eq.zzz` → `malformed array literal` → **jsonb 아님, PG 배열**
- `?program_ids=cs.{zzz}` → 에러 없음 → 원소 타입이 `zzz` 를 받음 → **`text[]`** (uuid[] 였다면 캐스팅 에러). 즉 `programs.id`(uuid)에 대한 **FK 제약이 없는 느슨한 참조**.

느슨한 참조 때문에 프로그램 삭제 시 dangling id 가 남는데, 코드가 `programById.has(id)` 로 필터해 무시한다(FD L188).

### 1.4 `free_diagnosis_programs`

| 컬럼 | 타입 | 용도 |
|---|---|---|
| `id` | `uuid` | PK |
| `title` | `text`(추정) | 카드 제목 |
| `badge` | `text`(추정) | 카드 상단 배지. 비면 `추천 서비스 N` 로 대체 (FD L505) |
| `description` | `text`(추정) | 카드 본문 |
| `primary_button_text` / `primary_button_link` | `text`(추정) | 주 CTA. link 가 비면 버튼 미렌더 |
| `secondary_button_text` / `secondary_button_link` | `text`(추정) | 보조 CTA. 동일 |
| `icon` | `text`(추정) | `target`/`book`/`chart`/`route` 4값. FD `ICONS` 맵 → lucide 아이콘 |
| `is_active` | `boolean` | 노출 여부 |
| `sort_order` | `integer` | 결과 카드 정렬 |
| `created_at` / `updated_at` | `timestamptz` | |

### 1.5 마이그레이션 SQL / RLS

- `find *.sql` 결과 repo 전체에서 `sql/pricing_orders.sql` **1개뿐**이며 free_diagnosis 와 무관.
- `supabase/` 디렉터리에는 `.temp/linked-project.json` 만 존재. `migrations/` 없음.
- → **세 테이블의 DDL 은 버전관리되지 않는다.** 스키마 확장 시 첫 마이그레이션 파일부터 만들어야 한다.
- RLS: 익명키로 SELECT 가 에러 없이 통과했으나 dev DB 가 비어 있어 "정책 통과"인지 "정책 차단 후 빈 배열"인지 구분 불가. 다만 `FreeDiagnosis.jsx` 가 **로그인 전에도** 세 테이블을 fetch 하므로 운영에서 anon SELECT 는 허용된 상태 (추정).
- 질문 삭제 confirm 문구가 "질문을 삭제하면 질문 안의 답변도 함께 삭제됩니다"인데 앱이 options 를 따로 지우지 않는다 → `options.question_id` 에 `ON DELETE CASCADE` 존재 (추정).

---

## 2. legacy 결과 산출 로직 (정확 서술)

`FreeDiagnosis.jsx` L176~199.

```
1) selectedOptions
   selected = { [question.id]: [optionId, ...] }  ← 상태
   전체 선택 id 를 Set 으로 flatten → options 배열(이미 sort_order 정렬)을 필터
   ⇒ 사용자의 클릭 순서가 아니라 options 의 DB 정렬 순서를 따른다

2) orderedIds
   selectedOptions 를 순회하며 normalizeProgramIds(option.program_ids) 를 펼침
   - 이미 본 id 는 skip (첫 등장 순 유지)
   - programById(= is_active=true 인 programs 만 담긴 Map)에 없는 id 는 버림
   ⇒ 집합 연산은 순수 OR(합집합). AND/가중치/최소 일치 개수 없음

3) resultPrograms
   orderedIds → program 객체 → 최종적으로 program.sort_order 오름차순 재정렬
   ⇒ 2)의 등장 순서는 사실상 무의미해지고 sort_order 가 최종 순서를 결정

4) 렌더
   카드 = icon(4종 맵) / badge / title / description / 최대 2개 버튼
   index % 2 로 카드 배경만 교대 (금색/회색)
   resultPrograms 가 0개면 "연결된 추천 프로그램이 없습니다" 안내
```

부가 로직:
- `normalizeProgramIds` 는 배열 / JSON 문자열 / 콤마 구분 문자열 3가지를 모두 수용 — 과거 컬럼 타입이 바뀐 흔적으로 보임 (추정).
- `canSubmit` = `is_required` 인 질문 전부에 1개 이상 선택. 비필수는 검사 안 함.
- `selectedSummary` = `"{질문 title}: {선택 label, ...}"` 문자열 배열. 결과 상단에 그대로 나열.
- 점수, 등급, 영역(dimension), 임계값, 우선순위 개념이 **코드/스키마 어디에도 없다.**

---

## 3. 인증 게이트 · 응답 저장

### 3.1 인증

| 지점 | 동작 |
|---|---|
| 라우트 `/free-diagnosis` (App.jsx L59) | **보호 없음.** `ProtectedRoute` 계열 래핑 안 됨 |
| 마운트 시 | `supabase.auth.getSession()` + `onAuthStateChange` 구독 |
| 설정 fetch | **로그인 여부와 무관하게** 3테이블 즉시 조회 (L92~147) |
| `startDiagnosis()` (L215) | `!isLoggedIn` → `authNotice=true`, 폼 미노출, 상단 스크롤. 로그인/회원가입 링크 안내 |
| 결과 보기 | 추가 인증 없음 (이미 로그인 상태) |

즉 게이트는 **"시작 버튼 클릭 시점의 클라이언트 사이드 1회 체크"** 뿐이다. 로그인해도 `user.id` 를 어디에도 쓰지 않는다.

### 3.2 응답 저장 — 없음

- `FreeDiagnosis.jsx` 전체에 `insert` / `upsert` / `rpc` 호출 **0건**. `submitDiagnosis()` 는 `setShowResult(true)` + 스크롤이 전부다.
- 새로고침하면 응답 소실. 이력·재조회 불가.
- DB 프로브로 `free_diagnosis_responses` / `_submissions` / `_leads` 모두 `PGRST205`(테이블 없음) 확인. **응답/리드 저장소가 물리적으로 존재하지 않는다.**
- 참고: `profiles` 테이블은 `id, name, email, phone, school_type, school_name, gender, address, memo, role, created_at, updated_at` 을 보유(프로브 확인). **`학년`에 해당하는 컬럼은 없다.**

---

## 4. 【핵심】 새 시안 문항 타입 × 현행 스키마 수용 판정

### 4.1 새 시안의 문항 인벤토리

| 프레임 | 문항 | 타입 |
|---|---|---|
| survey-8753 | Q1, Q2, Q3 | 단일선택 칩 |
| survey-8753 | Q3-A, Q3-B | 조건부 단문 텍스트(placeholder 有) |
| survey-8753 | Q3-C | 조건부 단일선택(추정) |
| survey-9045 | Q4, Q5 | 단일선택 |
| survey-9045 | Q6 | 숫자 그리드 (과목 6+1 × 2세트 = 13필드) |
| survey-9045 | Q7 | 숫자 그리드 (학기 5필드) |
| survey-9045 | Q8 | 단일선택 + 하위 칩 그룹 |
| survey-9491 | Q9 | 리커트 매트릭스 12문장 × 5척도 |
| survey-9491 | Q10 | 복수선택 13지 · **최대 3개** |
| survey-9866 | Q11 | 리커트 매트릭스 12문장 × 5척도 |
| survey-9866 | Q10(중복 번호) | 복수선택 14지 · 최대 3개 |
| survey-9866 | Q13 | 단일선택 |
| survey-9866 | Q14 | 복수선택 10지 · **최대 2개** |
| survey-10656 | Q15 | **4단 캐스케이딩 셀렉트** (대학→학과→전형유형→세부전형명) |
| survey-10656 | Q16, Q17, Q18 | 단일선택 |
| survey-10656 | Q19 | 장문 자유 텍스트 |
| — | Q12 | **시안에 없음** (별도 프레임 or 스킵, 미확인) |

### 4.2 판정표

| # | 문항 타입 | 판정 | 근거 / 필요 확장 |
|---|---|---|---|
| 1 | **단일선택 칩** (Q1~Q5, Q13, Q16~Q18, Q3-C) | ✅ **표현 가능** | `input_type='single'` + options.label 그대로. 10문항이 무변경 수용 |
| 2 | **보조 안내문**("하나만 선택해 주세요.") | ✅ **표현 가능** | `questions.description` 재사용 |
| 3 | **복수선택 (개수 제한 없음)** | ✅ **표현 가능** | `input_type='multiple'` |
| 4 | **복수선택 + 최대 N개** (Q10=3, Q14=2) | ⚠️ **스키마 확장 필요** | 개수 제약을 담을 컬럼 없음. `questions.max_select int` (+ `min_select int`) 추가. description 문구로만 안내하고 검증을 프론트 하드코딩하면 "관리자에서 문항을 바꿀 수 있다"는 legacy 설계 취지가 깨진다 |
| 5 | **배타 선택지**("해당 없음", "특별히 큰 어려움은 없어요") | ⚠️ **확장 필요** | `options.is_exclusive boolean` 추가 |
| 6 | **단문 텍스트 입력** (Q3-A, Q3-B) | ❌ **불가** | `input_type` 에 text 개념 없고, options 행 없이는 질문이 화면에 렌더돼도 입력 UI 가 없음. placeholder 저장 위치도 없음. → `input_type='text'` + `questions.placeholder text` + 응답 저장소 필요 |
| 7 | **장문 텍스트** (Q19) | ❌ **불가** | 위와 동일 + `maxlength` 저장 위치 없음 |
| 8 | **조건부 노출** (Q3→Q3-A/B, Q8→하위칩, Q1 N수생→Q2) | ❌ **불가** | 분기 조건을 담을 컬럼이 전무. → `questions.depends_on_question_id uuid` + `depends_on_option_ids text[]` (또는 `visible_when jsonb`) |
| 9 | **숫자 그리드** (Q6 13필드, Q7 5필드) | ❌ **불가** | 한 질문 안에 라벨 붙은 다수 숫자 입력칸 = 하위 항목 개념. options 는 "선택지"라 재사용 불가(선택 UI 가 나옴). 소수 자릿수·범위(1~9등급) 제약도 저장 위치 없음. → 하위 항목 테이블 or `questions.config jsonb` |
| 10 | **리커트 매트릭스** (Q9, Q11: 12문장 × 5척도) | ❌ **구조적 불가** | 2차원(문장 × 척도). 현행은 1차원(질문 1 × 선택지 N). 문장 12개를 각각 질문 행으로 쪼개면 24문항이 되어 화면의 "문항 번호 9/11", 잔여 카운터, 카드 그룹핑과 전부 어긋난다. → **하위 항목 테이블 필수** |
| 11 | **캐스케이딩 셀렉트** (Q15 4단) | ❌ **불가 + 외부 마스터 데이터 필요** | 선택지가 상위 선택에 종속. 게다가 대학/학과/전형 목록은 진단 설정이 아니라 **입시 마스터 데이터**다. repo 의 어떤 테이블도 이를 갖고 있지 않다(프로브: `admission_university_resources` 는 `id/created_at/updated_at/university_name` 4컬럼짜리 자료실 테이블) |
| 12 | **카테고리 라벨**("기본정보"/"성적입력") | ⚠️ **확장 필요** | `questions.category` 부재(프로브로 확인). → `category text` |
| 13 | **스텝 번호 뱃지 / 페이지 분할 / 잔여 문항 카운터** | ⚠️ **확장 필요** | `sort_order` 로 번호는 만들 수 있으나 "어느 화면(페이지)에 속하는지"가 없다. 시안은 6프레임으로 나뉜다. → `questions.page_no int` (또는 `section` slug) |
| 14 | **영역별 점수 산출**(결과 6축 레이더) | ❌ **불가** | 선택지에 점수·영역 태그가 없다. → `options.score numeric` + `options.dimension text`(또는 `question.dimension`) + 채점 규칙 |
| 15 | **선택/에러/포커스 상태, hover** | (스키마 무관) | UI 전용 |

**집계: 표현 가능 3 / 확장 필요 4 / 불가 8.**

### 4.3 확장 제안

두 가지 경로. 프로젝트 규칙(KISS > YAGNI > DRY) 기준으로는 **경로 A 를 권장**한다.

#### 경로 A — 3테이블 유지 + 컬럼 추가 + `config jsonb` (권장)

```
free_diagnosis_questions  ADD
  category        text          -- '기본정보' | '성적입력' | ...
  page_no         smallint      -- 화면 분할 (1..6)
  placeholder     text          -- text/textarea 문항용
  max_select      smallint      -- 복수선택 상한 (null=무제한)
  min_select      smallint
  depends_on_question_id uuid   -- 조건부 노출 (단일 조건만)
  depends_on_option_ids  text[] -- 위 질문에서 이 중 하나 선택 시 노출
  dimension       text          -- 결과 6축 중 어디에 기여하는가
  config          jsonb         -- 매트릭스 문장 배열 / 그리드 필드 정의 / 캐스케이드 소스
  input_type 값 확장: 'single'|'multiple'|'text'|'textarea'|'likert'|'grid'|'cascade'

free_diagnosis_options    ADD
  is_exclusive    boolean default false
  score           numeric        -- 리커트/채점용
  value           text           -- 라벨과 분리된 안정적 코드값
  (기존 question_key 사표 컬럼을 value 용도로 재활용 검토)
```

- 장점: 테이블 수 유지, Admin UI 확장이 점진적, 마이그레이션 1회.
- 단점: `likert`/`grid` 의 하위 항목이 `config` jsonb 안에 들어가 관리자 UI 로 편집하기 번거롭고 무결성 보장이 약하다. 응답을 하위 항목 단위로 조회/집계할 때 jsonb 경로 의존.
- **`input_type` 은 enum 이 아니므로 새 값 저장 시 타입 에러는 없다.** CHECK 제약이 걸려 있으면 그것만 고치면 된다 (제약 유무 미확인 → 확인 필요).

#### 경로 B — 하위 항목 테이블 신설 (매트릭스/그리드를 제대로 다룰 때)

```
free_diagnosis_question_items          -- 리커트 문장 12개, 그리드 셀(국어/수학/1학년1학기…)
  id uuid pk, question_id uuid fk, label text, value text,
  item_type text ('statement'|'numeric_field'), unit text,
  min_value numeric, max_value numeric, decimals smallint,
  sort_order int, is_active bool
```
Q9/Q11 은 `questions` 1행 + `question_items` 12행 + `options` 5행(척도)로 정확히 표현된다. Q6/Q7 도 `question_items` 로 자연스럽게 표현된다. 관리자에서 문장 문구를 개별 수정할 수 있다는 점이 legacy 설계 철학과 더 맞는다.

#### 어느 경로든 반드시 추가되는 것

```
free_diagnosis_submissions
  id uuid pk, user_id uuid (nullable, 비로그인 허용 시),
  status text ('in_progress'|'completed'), started_at, completed_at,
  student_name text, student_grade text, school_type text,   -- 결과 리포트 헤더용
  scores jsonb,        -- 6축 점수 + 종합점수 (결과 재현용 스냅샷)
  report jsonb         -- 서술 문단·우선순위표 등 생성 결과 스냅샷

free_diagnosis_answers
  id uuid pk, submission_id uuid fk, question_id uuid fk,
  item_id uuid null,   -- 경로 B 채택 시 리커트 문장/그리드 셀
  option_id uuid null, -- 선택형
  value_text text null, value_num numeric null,
  created_at
```

#### 경로 A/B 로도 못 덮는 것 — 입시 마스터 데이터

Q15(대학→학과→전형→세부전형)와 결과 리포트 §4.4(입결 비교표: 50%컷 등급 등)는 **진단 설정 테이블의 문제가 아니다.** 별도 마스터가 필요하다.

```
universities / departments(=모집단위) / admission_tracks(=전형) / admission_cutoffs(연도·컷·등급)
```
현재 repo·DB 어디에도 없다. **데이터 소스 확보 자체가 별도 과제이며, 이번 리뉴얼의 최대 리스크**로 본다.

---

## 5. 새 시안의 결과 화면 vs legacy `programs` 매핑

### 5.1 결과 화면 존재 여부: **있다**

`survey-12784` (`1889:12784`, 1920×4286) = "무료 진단 결과 리포트". A4 2페이지 + PDF 다운로드 CTA. 레이어명은 "설문조사 결과"지만 설문 문항은 하나도 없다.

### 5.2 블록별 호환성

| 결과 리포트 블록 | 필요한 데이터 | legacy 로 가능? |
|---|---|---|
| 학생 기본정보 6행 (이름/학년/학교유형/희망진로/전체평균내신/성적흐름/진단완료일) | 응답 + profiles + 완료일시 | ❌ 응답 저장 없음, `profiles` 에 학년 컬럼 없음, 완료일 개념 없음 |
| 요약 카드 3장 (학습 실행 역량 51.5점 / 학교생활 준비도 57.4점 / 가장 시급한 영역) | 채점 결과 | ❌ 점수 개념 전무 |
| 6축 레이더 차트 (목표설정 72 / 계획설계 58 / 실행지속 36 / 시간관리 43 / 학습피드백 61 / 학습인정 39) | 영역별 점수 | ❌ `options` 에 dimension·score 없음 |
| 우선순위 표 6행 (1~4순위 + 점검/유지, 게이지, 취약/보완/보통/상위) | 점수 랭킹 + 임계값 | ❌ |
| 학습 특성 서술 3문단 | 룰 기반 또는 LLM 생성 문장 | ❌ 저장/생성 계층 없음 |
| 2페이지 6영역 바 + 잘하는 점/보완할 점 불릿 | 점수 + 문구 매핑 | ❌ |
| 목표 대학 입결 비교표 | 입시 마스터 데이터 | ❌ 테이블 자체 부재 |
| **추천 지원 서비스 2열 카드 (§4.5)** | 서비스 카드 2장 + 카드당 칩 4개 + 설명문 | ⚠️ **부분 호환** |
| PDF 다운로드 | 리포트 스냅샷 | ❌ 저장 없음 |

### 5.3 §4.5 "추천 지원 서비스" 부분 호환 상세

| 시안 요소 | legacy `programs` 대응 |
|---|---|
| 카드 타이틀 | `title` ✅ |
| 카드 본문 설명 | `description` ✅ |
| 카드 하단 **칩 4개** (`주간 실행 계획 설정`, `수행 평가 일정 통합 관리` …) | ❌ 대응 컬럼 없음 → `programs.tags text[]` 필요 |
| 카드 개수 = **정확히 2장** (1·2순위) | ❌ legacy 는 선택지 합집합이라 개수 무제한 · 우선순위 개념 없음 |
| 카드에 CTA 버튼 **없음** | `primary_button_*` / `secondary_button_*` 4컬럼이 시안에서 미사용 (유휴) |
| 상단 배지 없음 | `badge` 유휴 |
| 아이콘 없음 | `icon` 유휴 |
| 테두리 `#d1e8ff`, r12, 490×201 고정 | 스타일 변경 (스키마 무관) |

**결론: `free_diagnosis_programs` 테이블은 살릴 수 있으나, 매핑 방식은 살릴 수 없다.**
legacy 는 `option → program_ids` 직결 OR 합집합인 반면, 새 시안은 `응답 → 영역별 점수 → 취약 영역 랭킹 → 1·2순위 서비스`라는 **채점 경유 2단 매핑**이다. 중간에 점수 계층이 끼는 순간 `program_ids` 다대다 배열은 역할을 잃는다. 대체안은 `programs.dimension text`(어느 취약 영역을 커버하는 서비스인가) + `programs.tags text[]` 이며, 이 편이 시안의 "1순위/2순위 카드" 구조와 정확히 맞는다.

---

## 6. 응답 저장(리드 수집) 부재 vs 새 시안 요구 — 충돌 여부

### **충돌한다. 그것도 치명적으로.**

새 시안이 응답 영속화를 전제한다는 증거:

| 증거 | 출처 |
|---|---|
| 리포트에 `진단 완료일 2025.05.24` 행이 있다 | survey-12784 §3.2 |
| 리포트에 `김주원 학생` 이름이 3곳 이상 박혀 있다 | §3.2, §3.3, §4 |
| **PDF 다운로드 버튼** (`2181:11685`, 253×60, #013262) | survey-12784 §(4) |
| 19문항이 **6개 화면으로 분할**되어 있다 → 이탈/재방문 시 이어하기가 없으면 완주율 붕괴 | survey-8753/9045/9491/9866/10656 |
| 각 화면 하단 "N개 문항이 남았어요" 진행 카운터 | 전 설문 프레임 |
| 결과가 점수·서술·입결 비교로 구성 → 재계산 아닌 스냅샷 보관이 자연스럽다 | §12784 전체 |

legacy 는 이 중 어느 것도 못 한다. 응답이 React state 에만 있고, 새로고침하면 사라지며, 어떤 학생이 무엇을 답했는지 **운영자가 볼 방법이 없다**(Admin 에 응답 조회 화면 자체가 없다 — `FreeDiagnosisAdmin` 은 설정 CRUD 만).

또한 리드 관점에서, legacy 는 로그인을 요구하면서도 `user.id` 를 저장하지 않는다. **"진단 결과를 학생 정보와 연결해 관리하기 위해 로그인이 필요합니다"라는 화면 문구(FreeDiagnosis.jsx L343)가 사실과 다르다** — 실제로는 아무것도 연결하지 않는다. 새 시안은 이 문구를 진짜로 만들어야 하는 요구를 담고 있다.

→ `free_diagnosis_submissions` + `free_diagnosis_answers` 신설은 **선택이 아니라 전제 조건**이다. 6화면 분할 UX 를 유지하려면 `status='in_progress'` 중간 저장까지 필요하다.

---

## 7. 사용자 결정이 필요한 항목

1. **입시 마스터 데이터(대학/학과/전형/입결) 소스** — Q15 캐스케이딩과 결과 §4.4 입결 비교표가 여기 종속. 외부 구매/크롤링/수기 입력 중 무엇인가? 없으면 Q15 와 §4.4 를 이번 범위에서 제외해야 한다.
2. **채점 규칙(scoring)** — 6축 정의, 문항→축 매핑, 리커트 5점 배점, 점수→상태(취약/보완필요/보통/상위) 컷오프. 시안에 값만 있고 규칙이 없다.
3. **학습 특성 서술 3문단 / 강점·보완 불릿 생성 방식** — 룰 기반 템플릿인가 LLM 생성인가. LLM 이면 API 계층이 추가된다.
4. **비로그인 응답 허용 여부** — 허용하면 `submissions.user_id` nullable + 이름/연락처 수집 화면이 필요한데 시안에 없다. 랜딩 CTA(`2181:10907`, `2162:1197`)의 목적지 정책도 미정.
5. **스키마 확장 경로 A(jsonb) vs B(하위 항목 테이블)** — 리커트 문장 12개 × 2세트를 관리자가 수정할 일이 있는지에 따라 갈린다. 수정 요구가 있으면 B.
6. **관리자 문항 편집을 어디까지 유지할 것인가** — 새 시안은 조건부 분기·그리드·캐스케이드가 섞여 있어 "관리자가 문항을 자유롭게 바꾼다"는 legacy 전제를 그대로 가면 Admin UI 공수가 본 화면보다 커진다. 문항을 코드/시드로 고정하고 관리자는 문구만 수정하는 축소안도 검토 대상.
7. **`question_key` 사표 컬럼 처리** — 제거할지, `value` 용 안정 슬러그로 재활용할지.
8. **legacy 3테이블 마이그레이션 파일 부재** — 확장 전에 현행 스키마를 SQL 로 덤프해 `supabase/migrations/` 에 베이스라인으로 커밋할지.
9. **Q12 문항 누락 / Q10 번호 중복** — 시안 자체 오류로 보이며 전체 19문항 확정본이 필요하다.

---

## 8. 부록 — 조사에 사용한 읽기 전용 프로브

```bash
# 컬럼 존재 여부 (42703 = 없음)
curl -s "$URL/rest/v1/free_diagnosis_questions?select=category&limit=1" \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY"
# → {"code":"42703", "message":"column free_diagnosis_questions.category does not exist"}

# 타입 확인
curl -s "$URL/rest/v1/free_diagnosis_options?program_ids=eq.zzz" ...
# → {"code":"22P02","details":"Array value must start with \"{\" ...}  → PG 배열

# 테이블 존재 여부 (PGRST205 = 없음)
curl -s "$URL/rest/v1/free_diagnosis_responses?select=*&limit=1" ...
# → {"code":"PGRST205","message":"Could not find the table 'public.free_diagnosis_responses'"}
```

`GET` 만 사용했고 DB 를 변경하지 않았다. dev 프로젝트 익명키 기준.
