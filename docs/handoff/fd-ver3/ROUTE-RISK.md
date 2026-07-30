# ROUTE-RISK — 프로덕션 라우트 점유 문제와 1차 배포 전략

작성 기준: 브랜치 `free-diagnosis-ver2` @ 7f8e595 / 비교 대상 `main` @ 8f161d2
전제: 신규 지시 A(헤더·푸터 작업 범위 제외) / B(1차 = 디자인) / C(2차 = 기능)
본 문서는 조사·판단 문서다. 소스 수정 없음.

---

## 1. 현행 라우트 정의 (사실 확인)

### 1.1 이 브랜치의 라우트 테이블

`src/App.jsx`

| 라인 | 정의 | 대상 |
|---|---|---|
| 25 | `import FreeDiagnosisLanding from './pages/renewal/FreeDiagnosisLanding'` | 신규 랜딩 |
| 26 | `import SurveyPreview from './pages/renewal/SurveyPreview'` | 신규 설문(단일 스크롤) |
| 60 | `<Route path="/free-diagnosis" element={<FreeDiagnosisLanding />} />` | 신규 |
| 61 | `<Route path="/free-diagnosis/survey" element={<SurveyPreview />} />` | 신규 |
| 102 | `<Route path="*" element={<Navigate to="/" replace />} />` | **catch-all → 홈 리다이렉트** |

### 1.2 main 대비 diff (`git diff main..HEAD -- src/App.jsx`)

```
-import FreeDiagnosis from './pages/FreeDiagnosis';
+import FreeDiagnosisLanding from './pages/renewal/FreeDiagnosisLanding';
+import SurveyPreview from './pages/renewal/SurveyPreview';
-        <Route path="/free-diagnosis" element={<FreeDiagnosis />} />
+        <Route path="/free-diagnosis" element={<FreeDiagnosisLanding />} />
+        <Route path="/free-diagnosis/survey" element={<SurveyPreview />} />
```

main 의 `src/App.jsx:59` 는 `<Route path="/free-diagnosis" element={<FreeDiagnosis />} />` 이고,
형제 브랜치 `landing-renewal` 의 `src/App.jsx:12,59` 도 **legacy 를 그대로 유지**한다.
즉 legacy 를 걷어낸 것은 이 브랜치 단독이다.

### 1.3 legacy 도달 불가 재확인 — 확정

- 파일은 살아 있다: `src/pages/FreeDiagnosis.jsx` (이 브랜치 590줄 / main 558줄, 차이는 `d34d363 chore(format)` prettier 적용분 + 형식 정리로 로직 동일).
- 그러나 **참조가 0건이다.** `grep -rn "pages/FreeDiagnosis" src/` → 매치 없음(exit 1). lazy import·동적 import 도 없다.
- 라우트 테이블에 없고, 미매치 경로는 102줄 catch-all 이 `/` 로 **replace 리다이렉트**한다. 404 조차 뜨지 않는다.
- 결론: **어떤 URL 로도 legacy 무료진단에 도달할 수 없다.** `src/pages/FreeDiagnosis.jsx` 는 현재 dead code다.

### 1.4 legacy 가 들고 있던 기능 (사라지는 것)

`src/pages/FreeDiagnosis.jsx`

| 라인 | 기능 |
|---|---|
| 71, 79, 149 | `supabase.auth.getSession()` / `onAuthStateChange` / `isLoggedIn` |
| 218 | `startDiagnosis()` 로그인 게이트 — 비로그인 시 `authNotice` 노출 후 진행 차단 |
| 99, 105, 111 | `free_diagnosis_questions` / `_options` / `_programs` 3테이블 fetch |
| 186–199 | 선택 옵션의 `program_ids` → 추천 프로그램 매핑 |
| 374 계열 | 비로그인 사용자에게 `/signup` · `/login` CTA (가입 퍼널) |
| 513–552 | 결과 카드 렌더 + `primary_button_link` / `secondary_button_link` 로 서비스·요금제 유입 |

### 1.5 링크 진입점 (모두 `/free-diagnosis` 를 가리킴)

| 파일:라인 | 내용 |
|---|---|
| `src/components/Header.jsx:42` | 서비스 그룹 대표 링크 `to: '/free-diagnosis'` |
| `src/components/Header.jsx:44` | FALLBACK 항목 `{ label: '무료진단', to: '/free-diagnosis' }` |
| `src/components/Header.jsx:112–132` | `ensureFreeDiagnosisInService()` — DB 에서 온 nav 든 캐시든 **무조건 무료진단 항목을 제거 후 `/free-diagnosis` 로 재주입** |
| `src/components/Header.jsx:145, 223, 371` | 위 함수의 3개 적용 지점 (캐시 읽기 / DB fetch / fallback) |
| `src/data/company.js:21` | 푸터 `{ label: '무료진단', to: '/free-diagnosis' }` |
| `src/pages/renewal/FreeDiagnosisLanding.jsx:101, 293` | 신규 랜딩 CTA 2개 → `/free-diagnosis/survey` |

**중요:** GNB 의 무료진단 목적지는 DB(관리자 메뉴 관리)로 바꿀 수 없다. `ensureFreeDiagnosisInService()` 가 코드에서 강제 주입한다.
→ 링크 목적지를 바꾸려면 **반드시 Header.jsx 를 편집해야 한다.** (§5에서 이게 결정적 제약이 된다.)

### 1.6 신규 설문의 완성도

`src/pages/renewal/SurveyPreview.jsx` — 19문항 단일 롱스크롤, `useState` 로컬 상태만.
제출 버튼 `src/components/renewal/survey/SurveyProgress.jsx` 는 주석에 명시된 대로 **`onClick` 자체가 없다.**
`disabled` 시각 상태만 반영한다. 즉 제출·저장·결과 이동 경로가 **전무**하다.

### 1.7 관리자 화면 고아화

`src/pages/Admin.jsx:1621` `FreeDiagnosisAdmin()` — 3222줄에서 마운트.
1649~1925 라인에서 `free_diagnosis_questions` / `_options` / `_programs` 를 CRUD 한다.
legacy 페이지가 유일한 소비자였으므로, 배포 후 **관리자가 문항을 수정해도 사이트 어디에도 반영되지 않는다.**
화면은 정상 동작하는 것처럼 보이므로 조용한 오작동(silent failure)이다.

### 1.8 배포 토폴로지

- `vercel.json` = SPA rewrite 만. 라우팅은 전적으로 클라이언트 측.
- 원격 브랜치: `origin/main`, `origin/dev`, `origin/landing-renewal`, `origin/free-diagnosis-ver2`.
- 최근 이력이 `Merge pull request #3 from ...dev` → **dev → main** 흐름. 이 브랜치는 머지 전까지 Vercel preview 배포로만 노출된다.

---

## 2. 1차(디자인만) 배포 시 사용자에게 벌어지는 일

전제: 1차 결과물이 dev/main 으로 머지되어 프로덕션에 나갔다고 가정.

1. **GNB "서비스 > 무료진단" 클릭** (`Header.jsx:44`, 코드 강제 주입 → `/free-diagnosis`)
   → 신규 리뉴얼 랜딩(`FreeDiagnosisLanding`)이 뜬다. 시각적으로는 정상. 여기까지는 문제 없음.
2. **히어로 CTA "지금 시작하기" 클릭** (`FreeDiagnosisLanding.jsx:101`)
   → `/free-diagnosis/survey` → `SurveyPreview`. 19문항이 한 화면에 롱스크롤로 뜬다.
3. **19문항을 전부 응답** → 하단 버튼이 회색(#d7d7d7)에서 남색(#013262)으로 활성화된다. 사용자는 "이제 제출된다"고 인지한다.
4. **버튼 클릭 → 아무 일도 일어나지 않는다.** `onClick` 없음. 페이지 이동 없음. 에러도 없음. 완전한 dead end.
   사용자는 자신이 뭘 잘못했는지 알 수 없고, 새로고침하면 19문항 입력이 전부 소실된다.
5. **결과를 볼 수 없다.** legacy 가 제공하던 "추천 서비스 카드 → `/pricing`·서비스 상세로 유입" 경로가 통째로 사라진다.
6. **로그인 게이트가 사라진다.** 기존에는 비로그인 사용자에게 회원가입/로그인 CTA를 노출해 가입 퍼널로 밀었다(`FreeDiagnosis.jsx:218`, `/signup`·`/login`). 1차 배포 후엔 비로그인 사용자가 자유롭게 들어와서 아무 것도 얻지 못하고 이탈한다. **리드 획득이 0이 된다.**
7. **푸터 무료진단 링크**(`company.js:21`)도 같은 dead end 로 간다.
8. **관리자 사이드 이펙트**: 운영자가 Admin 에서 문항·프로그램을 수정해도 사이트에 반영되지 않는다. "왜 안 바뀌냐"는 문의가 발생하고, 원인이 라우팅이라는 걸 코드를 봐야만 안다.
9. **SPEC 의 5스텝 라우팅을 1차에 넣을 경우 추가 사고**: `/free-diagnosis/survey/:step` 을 정의해도 `App.jsx:102` catch-all 이 미정의 경로를 **404 없이 홈으로 replace 리다이렉트**한다. 설문 중간에 새로고침·북마크·뒤로가기 시 조용히 홈으로 튕긴다. (replace 라 뒤로가기로 복귀도 불가.)
10. **비즈니스 관점**: 무료진단은 이 사이트의 최상단 리드 자석이다. 1차 단독 배포는 **작동하는 퍼널을 장식용 막다른 길로 교체**하는 것이다. 디자인 개선의 이득보다 전환 손실이 크다.

---

## 3. 대응 선택지 비교

### (a) legacy 를 `/free-diagnosis` 로 복원 + 신규는 별도 경로

`App.jsx` 에서 `import FreeDiagnosis` 를 되살리고 `/free-diagnosis` → legacy.
신규는 `/free-diagnosis/preview` (또는 §3-f 의 네임스페이스)로 이동. 랜딩 CTA 2곳의 `to` 도 함께 이동.

- **장점**
  - 프로덕션 회귀 0. 퍼널·로그인 게이트·Admin CRUD 전부 살아 있음.
  - **Header.jsx / company.js 를 한 글자도 안 건드린다.** 두 파일이 하드코딩한 `/free-diagnosis` 가 그대로 legacy 를 가리키게 되므로 규칙 A와 충돌 없음.
  - 이해관계자가 실제 URL 로 신규 디자인 리뷰 가능(스크린샷 왕복 불필요).
  - 2차 전환이 `App.jsx` 라인 몇 줄 스왑으로 끝난다. 롤백도 동일.
  - 1차를 실제로 머지·배포할 수 있어 브랜치가 장기화되지 않는다(토큰 커밋 553762e/7f8e595 도 함께 흘러감).
- **단점**
  - 미완성 화면이 공개 URL 로 존재. 어디서도 링크되지 않으므로 발견 가능성은 낮지만 0은 아님.
  - 검색 노출 방지가 필요하면 `public/robots.txt` 신설(현재 없음)로 `Disallow: /free-diagnosis/preview`. SPA라 per-route noindex 는 별도 라이브러리가 필요하므로 robots.txt 가 최소 비용.
  - 무료진단 화면이 한동안 2벌 공존(운영자 혼선 소지 → 인수인계 메모 필요).
- **구현 비용**: `App.jsx` 3줄(import 1 + route 2) + `FreeDiagnosisLanding.jsx` 2줄(CTA `to`) = **5줄, 1파일 반, 30분 미만.** robots.txt 포함 시 +5분.

### (b) 신규 유지 + 설문 진입만 legacy 로 연결

`/free-diagnosis` = 신규 랜딩, CTA → legacy 설문.

- **장점**: 신규 랜딩이 공개 얼굴이 되고, 설문·결과·저장은 legacy 가 계속 처리 → 퍼널 유지.
- **단점**
  - **legacy 를 실제로 수술해야 한다.** legacy 는 랜딩+설문+결과가 한 페이지에 들어간 단독 페이지다. 자체 히어로, `started` 상태 머신, `scrollIntoView('#diagnosis-form')`, `authNotice` 섹션을 전부 소유한다. 2단계로 끼워 넣으려면 페이지 상단부 제거·초기 상태 변경이 필요하다.
  - 이는 **"1차 = 디자인" 원칙 위반**이다. 기능 코드에 손을 대는 순간 회귀 테스트 책임이 1차로 넘어온다.
  - 신규 랜딩(리뉴얼) → 구형 설문 UI 로 넘어가는 시각적 단절이 크다. 디자인 리뷰가 오히려 왜곡된다.
  - 새로 만든 `SurveyPreview` 와 survey 컴포넌트 7종이 갈 곳을 잃어 리뷰 불가.
- **구현 비용**: legacy 리팩터 + 라우트 신설 + 회귀 확인 = **3~6시간, 위험도 중~상.**

### (c) 1차 미배포, 브랜치 보관 (Vercel preview 로만 리뷰)

- **장점**: 프로덕션 위험 0. 라우트 결정 자체를 미룰 수 있음. "1차=디자인"의 문자 그대로의 해석. Vercel 브랜치 preview 가 이미 리뷰 URL 을 제공한다.
- **단점**
  - 2차 전체 기간(스키마·저장·채점·PDF·관리자 = SPEC 상 가장 큰 덩어리) 동안 브랜치가 미머지로 방치된다.
  - **`landing-renewal` 과 충돌 위험이 누적된다.** 그 브랜치는 48커밋 규모로 Header·푸터·토큰을 건드리고 있고, 이 브랜치도 이미 `553762e`/`7f8e595` 로 `tailwind.config.js`·전역 토큰을 손댔다. 두 브랜치가 오래 갈라질수록 머지 비용이 지수적으로 증가한다.
  - 위험을 제거한 게 아니라 **머지 당일로 이연**했을 뿐이다. 라우트 결정은 어차피 그때 해야 한다.
  - 1164px 폭·accent 토큰 같은 공용 개선분이 main 에 못 들어간다.
- **구현 비용**: **0.** 단 (c) 단독으로는 문제를 해결하지 않고 연기한다.

### (d) 환경변수 / 피처 플래그 분기

`VITE_FD_RENEWAL` 로 `/free-diagnosis` 에서 렌더할 컴포넌트를 고른다.

- **장점**: URL 1개 유지. 프로덕션은 legacy, dev/preview 는 신규. 사고 시 env 만 끄면 즉시 롤백.
- **단점**
  - Vercel 환경(dev/preview/production) 별 env 관리 부담. 메모리에 기록된 "vercel env pull 함정"이 있는 프로젝트라 운영 리스크가 실재한다.
  - 라우트 1개를 위한 런타임 분기 = 오버엔지니어링. **Vercel 브랜치 preview 가 이미 환경 분리를 공짜로 제공**하므로 (a) 대비 순증 가치가 거의 없다.
  - 2차에 반드시 제거해야 하는 임시 코드가 생긴다(정리 누락 시 영구 부채).
  - 플래그가 켜진 환경에서는 여전히 §2 의 dead end 가 그대로 재현된다 — 문제를 숨길 뿐 못 고친다.
- **구현 비용**: 코드 10줄 + Vercel env 3환경 설정 + 문서화 = **1~2시간, 운영 부담 지속.**

### (e) [추가안] 공용분 선머지 + 라우트 스왑만 보류

토큰/공용 레이아웃 커밋(`553762e`, `7f8e595`)과 신규 컴포넌트 파일만 먼저 main 에 태우고,
`App.jsx` 라우트 교체 커밋은 브랜치에 남긴다.

- **장점**: 브랜치 장기화의 최대 리스크(공용 토큰·Header 충돌)를 조기에 해소. 프로덕션 변화 없음.
- **단점**: 커밋 분리·체리픽 작업이 필요하고 이력이 어수선해진다. 신규 화면은 여전히 URL 로 리뷰 불가.
- **평가**: 단독안이 아니라 (a) 또는 (c) 와 결합하는 **보조 조치**. (a) 를 택하면 자동으로 달성되므로 별도 실행 불요.

### (f) [추가안, 권장 변형] legacy 복원 + 신규를 최종 구조와 동형인 네임스페이스에 배치

(a) 의 개선판. 신규를 `/free-diagnosis/preview` 같은 임시 이름이 아니라 **SPEC 1.3 의 최종 구조를 한 세그먼트 아래로 미러링**한다.

```
/free-diagnosis                     → pages/FreeDiagnosis.jsx        (legacy 복원, 프로덕션 진입점)
/free-diagnosis/v2                  → renewal/FreeDiagnosisLanding   (신규 랜딩)
/free-diagnosis/v2/survey           → /v2/survey/1 리다이렉트
/free-diagnosis/v2/survey/:step     → 신규 설문 5스텝
/free-diagnosis/v2/result           → 신규 결과 리포트 (2차)
```

- **장점**: (a) 의 장점 전부 + **2차 전환이 "`/v2` 세그먼트 제거"라는 기계적 작업으로 축소**된다. 경로 구조·상대 링크·스텝 라우팅을 1차에서 이미 최종 형태로 검증하게 되므로, 2차에 라우팅을 다시 설계할 일이 없다.
- legacy 는 자식 라우트가 없으므로 `/free-diagnosis/v2` 와 충돌하지 않는다(확인 완료).
- **단점**: (a) 와 동일. 경로 문자열이 조금 길다.
- **구현 비용**: (a) 와 동일 수준(라우트 정의 줄 수만 스텝 수만큼 증가). **1시간 미만.**

---

## 4. 각 안의 GNB / company.js 영향 — 규칙 A(헤더·푸터 제외) 충돌 판정

| 안 | Header.jsx 수정 | company.js 수정 | 규칙 A 충돌 | 비고 |
|---|---|---|---|---|
| (a) | **불필요** | **불필요** | **없음** | `/free-diagnosis` 목적지가 legacy 로 되돌아가므로 하드코딩된 링크가 저절로 정상화 |
| (b) | 불필요 | 불필요 | 없음 | 대신 legacy 페이지 본체를 수술 → "1차=디자인" 원칙 B 위반 |
| (c) | 불필요 | 불필요 | 없음 | 머지 시점에 (a)~(d) 중 하나를 결국 골라야 함 |
| (d) | 불필요 | 불필요 | 없음 | 대신 배포 설정(Vercel env) 부담 |
| (f) | **불필요** | **불필요** | **없음** | (a) 와 동일 |
| — 신규를 공개 진입점으로 삼되 경로를 옮기는 모든 변형 | **필수** | **필수** | **충돌** | 아래 참조 |

**핵심 판정:** GNB 목적지를 바꾸는 순간 `Header.jsx:44`, `:129`(`ensureFreeDiagnosisInService` 의 강제 주입), `:42`, `:128`, 그리고 `company.js:21` 을 편집해야 한다.
그런데 `Header.jsx` 는 **`landing-renewal` 브랜치가 64px 헤더로 대대적으로 고치고 있는 바로 그 파일**이다.
이 브랜치가 같은 파일을 건드리면
1. 신규 지시 A("헤더/푸터는 landing-renewal 소관")를 정면으로 위반하고,
2. 두 브랜치 간 머지 충돌이 확정된다.

→ **결론: 이 브랜치에서는 어떤 안을 택하든 Header.jsx 와 company.js 를 건드리지 않는다.**
이는 자동으로 "`/free-diagnosis` 라는 URL 은 계속 실제 서비스 가능한 페이지를 가리켜야 한다"는 제약을 낳고, 1차가 미완성인 이상 그 페이지는 **legacy 일 수밖에 없다.** 선택지가 사실상 (a)/(f) 로 수렴한다.

---

## 5. 권장안

### 권장: (f) — legacy 를 `/free-diagnosis` 로 복원하고, 신규 1차는 `/free-diagnosis/v2/*` 네임스페이스에 배치

((f) 도입이 부담스러우면 최소판인 (a) 로 낮춰도 결론은 동일 계열이다.)

**근거**

1. **규칙 A 와 유일하게 무마찰이다.** §4 대로 Header.jsx·company.js 를 전혀 건드리지 않고, 하드코딩된 `/free-diagnosis` 링크가 자동으로 정상 목적지를 갖는다. `landing-renewal` 과의 파일 충돌도 0.
2. **규칙 B("1차 = 디자인")를 문자 그대로 지킬 수 있다.** legacy 코드에 손대지 않는다((b)는 손대야 한다). 신규 화면은 마크업·스타일·상태 전환만 구현하고, 제출 핸들러가 없다는 사실이 사용자 피해로 이어지지 않는다 — 그 화면이 공개 퍼널이 아니기 때문이다.
3. **§2 의 10가지 피해가 전부 소멸한다.** 로그인 게이트, 3테이블 연동, 추천 프로그램 → `/pricing` 유입, Admin CRUD 유효성이 모두 살아 있는 상태로 유지된다.
4. **비용이 압도적으로 낮다.** `App.jsx` 라우트 정의 + 랜딩 CTA `to` 2곳. 되돌리기도 같은 비용. (b)의 3~6시간, (d)의 환경 관리 부담과 비교 불가.
5. **브랜치 장기화 리스크를 제거한다.** 1차를 실제로 머지할 수 있으므로 공용 토큰(1164px, accent)이 main 으로 흘러가고 `landing-renewal` 과의 격차가 줄어든다. (c)는 이 리스크를 그대로 안고 간다.
6. **2차 전환 비용이 최소다.** `/v2` 세그먼트만 제거하면 SPEC 1.3 의 최종 구조가 된다. 5스텝 라우팅·상대 링크·상태 보존을 1차에서 최종 형태로 미리 검증하므로 2차에 라우팅을 재설계할 필요가 없다.

**동반 조치 (권장안 채택 시)**

- `public/robots.txt` 신설(현재 없음) → `Disallow: /free-diagnosis/v2`. 미완성 화면의 검색 노출 차단. 5분.
- `App.jsx:102` catch-all 이 미정의 경로를 홈으로 삼키므로, `/free-diagnosis/v2/survey` → `/free-diagnosis/v2/survey/1` **명시적 `<Navigate replace>`** 를 반드시 정의할 것. 없으면 조용히 홈으로 튕긴다.
- 2차 착수 시 `src/pages/FreeDiagnosis.jsx` 의 처리(유지/`/free-diagnosis/legacy` 이관/삭제)를 결정 항목으로 남긴다.

**비권장 사유 요약**

- (b): 1차에 기능 코드 수술을 끌어들여 원칙 B 를 깨고, 리뉴얼↔구형 UI 혼재로 디자인 리뷰 품질까지 떨어뜨린다.
- (c): 위험을 해결하지 않고 머지일로 이연하며, `landing-renewal` 과의 충돌 부채를 키운다.
- (d): Vercel 브랜치 preview 가 이미 주는 환경 분리를 코드로 재구현하는 오버엔지니어링이고, 플래그가 켜진 환경에서는 dead end 가 그대로 재현되어 근본 문제를 못 고친다.
