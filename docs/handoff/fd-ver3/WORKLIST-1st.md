# WORKLIST — 무료진단 ver3 **1차(디자인 구현)** 작업 목록

작성일 2026-07-29 · worktree `/Users/hyunsoo/uwellnow/winningpage-free-diagnosis` · 브랜치 `free-diagnosis-ver2` (HEAD `7f8e595`)
소스 변경 0건 (조사 + 문서화만). 상위 문서: [SPEC-fd-ver3.md](./SPEC-fd-ver3.md) · [ASSETS.md](./ASSETS.md) · [DIFF-survey-spec.md](./DIFF-survey-spec.md)

## 0. 이 문서의 전제

| # | 전제 | 출처 |
|---|---|---|
| P1 | **헤더/푸터 완전 제외.** `Header.jsx`(h-84px) / `SiteFooter.jsx` 는 이 브랜치에서 **건드리지 않는다.** 64px 헤더·신규 푸터·로고 SVG 는 `landing-renewal` 소관 | 신규 지시 A |
| P2 | **1차 = 디자인.** 마크업·스타일·정적 렌더링·상태 전환(선택/hover/focus/disabled)까지 | 신규 지시 B |
| P3 | **2차 = 기능.** DB 스키마, 응답 저장, 채점, PDF 생성, 입시 마스터 데이터, 관리자 연동 | 신규 지시 C |
| P4 | 설문 5스텝 분할 (3/5/2/4/5 = 19문항), 라우팅 `/free-diagnosis/survey/:step` | 확정 결정 1 |
| P5 | 12번 = `1889:9866` 두 번째 Q10 (14지, 최대 3). 뱃지 "10"은 오기 | 확정 결정 2 |
| P6 | selected = 배경 `#E9F4FF` / 보더 1px `#013262` / 라벨 `#013262` / 체크 아이콘. 라디오 SVG 2종 재추출 불필요 | 확정 결정 3 |
| P7 | `1889:10355` / `1889:13222` 는 selected 레퍼런스로만, 구현 대상 제외 | 확정 결정 4 |
| P8 | 전역 폭 `max-w-content` 72.75rem, px→rem ÷16 원값, 섹션 pt 소유·pb=0, accent 토큰, Planet 제외, line-height 아티팩트 예외 | 전역 정책 |

---

## 1. 에셋 작업 — 헤더/푸터 제외 재산출

### 1.1 제거된 항목 (P1)

| 기존 판정 | 자산 | node id | 처리 |
|---|---|---|---|
| (C) 8 | 헤더 로고 SVG | `2240:2714` (+인스턴스 `2240:2741` `2240:2794` `2240:2768` `2240:2848` `2240:2822` `2240:2687`) | **범위 밖 — landing-renewal** |
| (C) 9 | 푸터 로고 SVG | `2240:3273` (+인스턴스 `2240:3206` `2240:3139` `2240:3072` `2240:3005` `2240:2938` `2240:2871`) | **범위 밖 — landing-renewal** |
| 참고 | `public/images/winning-logo.png` | — | **손대지 않음** (공유 자산, 충돌 방지) |

→ (C) **9건 → 7건**. `SPEC §6` 의 "실제 신규 추출 대상 6건"도 **로고 2건이 빠져 4건 + 조건부 1건**으로 재계산된다.

### 1.2 (A) 재사용 — 작업 0 · **6건** (기존 5 → +1)

| 자산 | node id | 근거 | 규모 |
|---|---|---|---|
| `landing/hero-browser-v2.png` | `2181:11026` | 비율 2.31465 일치(오차 0.002%) + 내용 픽셀 일치 | — |
| `landing/hero-glow.svg` | `2181:11086` | r=410(지름 820), stdDeviation 100 = blur 200÷2 | — |
| `landing/hero-grain.png` | `2181:11089` | 220 × 0.6090909 = 134.0 타일 일치 | — |
| `radio-unchecked.svg` | `1889:8810` 외 200+ 인스턴스 | `Frame > Vector` 구조 일치 | — |
| **`radio-checked.svg`** | (13222 유래, ver3 대응 노드 없음) | **`docs/handoff/fd-ver3/assets/radio-checked-13222.svg` 와 `cmp` 결과 바이트 동일 확인** → 고아 아님, 정식 재사용 | — |
| 브라우저 크롬 파츠 10종 | `I2181:10910;…` | 통이미지에 합성됨 — 추출 자체 불필요 | — |

> 검증 커맨드 결과: `radio-checked: IDENTICAL` / `radio-unchecked: IDENTICAL`. 확정 결정 3 재확인 완료.

### 1.3 (B) 크롭·리사이즈 — **3건** (변동 없음)

| 자산 | node id | 원본 | 목표 | 작업 | 규모 |
|---|---|---|---|---|---|
| `landing/illustration-strength.png` | `2162:1134` | 1397×1126 (1.2407) | 706×538 (@2x of 353×269) | **크롭** (세로 ~7% 절단, CROP 모드·카드 상단 flush) | S |
| `landing/illustration-weakness.png` | `2240:4236` | 1536×1024 (1.5000) | 706×470 (@2x of 353×235) | 리사이즈만 (오차 0.14%) | S |
| `landing/illustration-trial.png` | `2240:4238` | 1536×1024 | 706×470 | 리사이즈만 | S |

부수 효과: 3장 합계 3.5MB → 약 400KB. Figma 접근 불필요(로컬 `sips` 가공).

### 1.4 (C) 재추출 — **7건 + 조건부 1건** (기존 9+1 → 로고 2 제거)

| # | 자산 | node id | 권장 추출 | 사유 / 주의 | 1차 필요 | 규모 |
|---|---|---|---|---|---|---|
| 1 | 맥북 화면 콘텐츠 | `2240:4597` (래퍼 `2240:4584`) | PNG @2x 1536×956 | 현행 `macbook-screen-content.png` 는 다른 페이지("PAGE 2/2"). **대안: 리포트 A4-3 컴포넌트 축소 렌더** → 결정 D6 | ✅ 랜딩 | M |
| 2 | 맥북 Shadow | `2240:4580` | SVG (905×10) | 신규. CSS `filter: blur()` 대체 검토 가능 | ✅ 랜딩 | S |
| 3 | 맥북 Bottom | `2240:4588` | SVG / PNG @2x (1008×30) | 신규. 현행 실버 PNG 로 대체 불가 | ✅ 랜딩 | S |
| 4 | Lock 아이콘 | `2162:1146` **컨테이너 통째** | PNG @3x 300×300 | 현행 1x → 레티나 뭉갬. **하위 벡터(`2162:1147/1148/1149`) 개별 추출 금지** — BACKGROUND_BLUR 글래스 레이어 손실 | ✅ 랜딩 | S |
| 5 | Folder 아이콘 | `2162:1155` 컨테이너 | PNG @3x 300×300 | 상동 | ✅ 랜딩 | S |
| 6 | Security 아이콘 | `2162:1163` 컨테이너 | PNG @3x 300×300 | 상동 | ✅ 랜딩 | S |
| 7 | 셀렉트 chevron | `1889:10716` (= `10725` `10734` `10743`) | SVG 24×24 | Q15 4필드 공용. **단 `lucide-react`(기존 의존성)의 `ChevronDown` 이 이미 쓰이고 있음** → 결정 D4 | ⚠️ 조건부 | S |
| C1 | 체크박스 미선택 | `1889:9733` (9491) / `1889:9082` 하위 (9866) | SVG 24×24 | 다운로드 후 `radio-unchecked.svg` 와 **바이트 비교**. 동일하면 (A) 로 강등 | ⚠️ 판정 필요 | S |

**추출 시 리스크(R10 승계)**: `2162:1147`(Lock/Body) 과 `2240:4597`(맥북 화면) 이 동일 asset id `80e317ee-…` 를 반환. 컨테이너 노드(`2162:1146`)로 추출하면 회피되고, 다운로드 후 바이트 검증 필수.

### 1.5 (D) 에셋 대신 구현 — 2건

| 대상 | node id | 방식 | 1차 | 규모 |
|---|---|---|---|---|
| 맥북 Lid / Dark Screen / Screen | `2240:4582` / `4583` / `4585` | CSS 도형 (816×554 `#1A202C`, 2px `#4A5568`, radius 28/28/4/4, "Macbook Pro" 각인 Inter SemiBold 13px `#A0AEC0`) — 수치는 landing.md 5.4 | ✅ | M |
| 6축 레이더 차트 | `2226:2944` | **SVG 직접 구현** (§3.4 참조). 래스터 도입 금지 | ✅ | L |
| 구분선 전량 | `2162:1151` / `1889:9564` / `2226:2964` 등 | CSS `border` — 에셋 아님 | ✅ | — |

### 1.6 (E) 삭제 대상 — 2건

| 파일 | 시점 |
|---|---|
| `landing/macbook-mockup.png` (931×562 실버·노치) | 맥북 CSS 전환 후 |
| `landing/macbook-screen-content.png` (991×484 "PAGE 2/2") | `2240:4597` 교체 후 (리포트 2페이지 시각 레퍼런스로는 보존 가치 있음) |

> `radio-checked.svg` 는 §1.2 로 이동 — **더 이상 고아 아님.**

### 1.7 집계 (헤더/푸터 제외 기준)

```
(A) 재사용 작업 0        6건   (hero-browser / hero-glow / hero-grain / radio-unchecked / radio-checked / 크롬파츠10)
(B) 로컬 크롭·리사이즈   3건   (illustration ×3)                        Figma 접근 불필요
(C) 재추출               7건   + 조건부 1건 (체크박스)                   ← 기존 9+1 에서 로고 2건 제외
(D) 코드로 구현          2건   (맥북 Lid CSS / 레이더 SVG)
(E) 삭제                 2건
범위 밖(landing-renewal) 2건   (헤더 로고 2240:2714 / 푸터 로고 2240:3273)
```

**Figma MCP 재추출 세션에서 실제로 뽑을 노드 = 7개 + 조건부 1개** (D4 로 chevron 이 빠지면 6+1).

---

## 2. 컴포넌트 인벤토리

> 지시문에 5개로 적혔으나 실제 `src/components/renewal/survey/` 에는 **7개**가 있다 (`QuestionCard`, `SurveyProgress` 누락). 아래는 7개 전량 기준.

### 2.1 분류 요약

| 컴포넌트 | 판정 | 핵심 사유 | 규모 |
|---|---|---|---|
| `QuestionCard.jsx` | **그대로 사용** (미세 조정) | 배지 40/r8/`#D7D7D7`·숫자 `#808080`, 라벨 gap 20, 배지행↔질문 12, 질문↔입력 20, 카드 r40 px60 py40 — §3.2-8/10 전부 이미 일치. line-height 정책도 `leading-snug` 로 준수 중 | S |
| `SurveyProgress.jsx` | **수정 필요** (경미) | 치수 전부 일치(60h / r12 / px75 / `#d7d7d7`). 단 **`<button>` 이 아니라 안내 배너**여야 함 → `role="status"` div 로 시맨틱 교체, `label`/`disabled` prop 정리 | S |
| `OptionGroup.jsx` | **수정 필요** | selected 배경 `#F1F8FF` → **`#E9F4FF`**(P6). hover/`maxReached` 스타일이 임의 구현. 배타 선택지 미지원 | M |
| `ConditionalTextInput.jsx` | **수정 필요** | Q19 멀티라인(992×105, items-start) 미지원 → `multiline`/`rows` prop 추가 (결정 #4 = (a)) | S |
| `GradeInputGrid.jsx` | **그대로 사용** (미세 조정) | 100×68 / r8 / gap16 / 라벨 `#808080` 전부 일치. `basis-[6.25rem]`=100px ✅. `outOfRange` 빨강 보더는 시안 근거 없는 자체 구현 → error 정본 결정 후 | S |
| `LikertMatrix.jsx` | **수정 필요** | 폭 4종 혼재(992/990/1000/1058) 정규화, 행 피치 64(현재 48), 구분선 폭 992, 척도 라벨↔라디오 중심 균등 grid | M |
| `CascadingSelect.jsx` | **수정 필요** | 필드 폭 228 고정 / 값 텍스트 폭 140 / chevron gap 24 반영, chevron 소스 결정(D4), placeholder 문구(결정 #17), 하드코딩 `UNIVERSITY_DATA` 는 **1차 유지**(2차에 마스터 데이터로 교체) | M |

### 2.2 수정 상세

**`OptionGroup.jsx`**
- selected: `bg-[#F1F8FF]` → `bg-[#E9F4FF]`, border `#013262` ✅ 유지, 라벨 `#013262` ✅ 유지, `radio-checked.svg` ✅ 유지
- hover/focus/disabled 정본 부재 → **D2** 확정 후 일괄
- `max` 초과 시 `disabled + opacity-50` = 자체 결정 (시안 근거 0). 유지 여부 D2 에 포함
- **신규 prop `exclusiveValues?: string[]`** — Q10(9491) `특별히 큰 어려움은 없어요`, Q10(9866) `현재는 관련 도움이 크게 필요하지 않아요` 배타 처리. UX상 즉시 필요(결정 #19 단서)이며 DB 무관 → **1차**
- chip 행 분리: 시안은 명시적 행(Q13 2행 / Q14 3행 / Q16 2행 / Q17·Q18 3행). 현재 `flex-wrap` → **D10**

**`LikertMatrix.jsx`**
- 현재 `gridTemplateColumns: minmax(0,1fr) repeat(5, 6.5rem)` + `gap-x-4`. 992 컨테이너에서 문장열이 392px 로 계산되나 시안은 **320**(라디오군 520 = 5×104 은 일치)
- 행 pitch: 시안 64 ↔ 현재 `py-3`(12+12+24=48)
- 구분선 1000 → 카드 콘텐츠 992 로 정규화 (§4.4 권장)
- 모바일 카드 분해 블록은 이미 있음 → **유지**(반응형 자체 설계 원칙과 정합)

**`CascadingSelect.jsx`**
- `grid lg:grid-cols-4 lg:gap-5` = gap 20 ✅. 필드 h68/r20/px20 ✅
- disabled(선행 미선택) 이미 구현 — 시안 미정 항목이나 UX상 유지 권장
- 1차에서는 **샘플 6개 대학 하드코딩 유지**. `levels[].options` prop 이 이미 열려 있어 2차 DB 주입 시 컴포넌트 변경 불필요

### 2.3 신규 필요 — props 시그니처 초안

#### 설문 (2건)

```jsx
// src/components/renewal/survey/SurveySubmitButton.jsx   [S]
// 1112×60 / r12 / px75 py16 / disabled bg #D7D7D7 / 활성색은 D3
SurveySubmitButton({
  label = '진단 결과 보기',
  disabled = false,        // 미응답 문항 존재 시
  loading = false,         // 1차는 시각 상태만 (제출 로직 없음)
  onClick,
})
```

```jsx
// src/components/renewal/survey/SurveyStepLayout.jsx   [M]
// 5스텝 공통 셸: 타이틀 블록(596×175 gap20) + 카드 스택(gap 40) + 하단 배너/CTA
SurveyStepLayout({
  step,                    // 1..5
  totalSteps = 5,
  title,                   // 44px Bold — 스텝 공통 '무료 진단으로 …'
  subtitle,                // 24px Regular
  remaining,               // 잔여 문항 수 → SurveyProgress
  isLastStep = false,      // true면 SurveySubmitButton, false면 SurveyProgress
  canSubmit = false,
  onPrev,                  // D11: 시안에 이전 버튼 없음 → 미노출 기본
  onNext,
  children,                // QuestionCard 스택
})
```

#### 결과 리포트 (11건 — 전부 신규)

```jsx
// src/components/renewal/report/ReportPageA4.jsx   [S]
ReportPageA4({ pageNo, totalPages = 2, children })   // 1120 × 1584.94, bg #fff, p60

// src/components/renewal/report/StudentInfoBlock.jsx   [S]
StudentInfoBlock({ name, rows })
// rows: [{ label: '학년', value: '고등학교 2학년' }, …] — 390×180, 라벨91/gap40/값200, pitch 26

// src/components/renewal/report/SummaryCards.jsx   [S]
SummaryCards({ cards })
// cards: [{ label, value, caption }] ×3 — 321×142 r20 border #d7d7d7, 내부 오프셋 19/28, gap 12

// src/components/renewal/report/StatusBadge.jsx   [S]  (원자)
StatusBadge({ label, tone })   // tone: 'red' | 'amber' | 'blue'
// red   bg #ffcdcd / text #991e1e
// amber bg rgba(255,233,155,.8) / text rgba(80,63,0,.8)
// blue  bg #f1f8ff / text #1b5da0
// padding 4/8, r12, 텍스트 폭 40 center

// src/components/renewal/report/ScoreBar.jsx   [S]  (원자 — 우선순위표 + 바그래프 공용)
ScoreBar({ value, max = 100, tone })
// 트랙 231×10 r4 bg #e5e5e5 / fill 동일 h·r 좌측정렬
// fill 색: red #991e1e / amber #736123 / blue #1b5da0
// ⚠️ 시안 fill 폭(68/75.209/87/99/134/190)과 본문 점수가 불일치 → 1차는 fillPx 직접 주입 허용

// src/components/renewal/report/PriorityTable.jsx   [M]
PriorityTable({ rows })
// rows: [{ rank, dimension, fillPx|score, tone, status, action }] ×6
// 헤더행 SemiBold16, 바디 flex gap60 items-center, 행 h28 gap8, pitch 44, 구분선 w992 1px

// src/components/renewal/report/DimensionBarChart.jsx   [S]
DimensionBarChart({ rows })
// rows: [{ label, fillPx|score, tone, status }] ×6 — 485×160, flex-col gap8, 행 h20

// src/components/renewal/report/RadarChart6.jsx   [L]
RadarChart6({ axes, max = 100, size = { w: 446, h: 399 }, rings = 4 })
// axes: [{ label, score }] ×6  (목표설정72/계획설계58/실행지속36/시간관리43/학습피드백61/학습인정39)
// 순수 SVG. 축 순서·최대값·링 개수는 시안 미정 → 1차 기본값 명시 + prop 노출

// src/components/renewal/report/InsightColumns.jsx   [S]
InsightColumns({ strengths, weaknesses })   // 494px 2열, gap 16, list-disc, 들여쓰기 28.5px, 19px/1.3

// src/components/renewal/report/AdmissionCompareTable.jsx   [S]
AdmissionCompareTable({ caption, probability, summary, rows, myRow })
// 510×189 r12 border #d9d9d9, 행 pitch 36, 마지막 행 SemiBold #0b84fd

// src/components/renewal/report/RecommendServiceCard.jsx   [S]
RecommendServiceCard({ rank, title, body, chips })
// 490×201 r12 border #d1e8ff, 내부 좌측 13, 칩 2×2 pitch 36, 칩 bg #f1f8ff text #1b5da0 r12

// src/components/renewal/report/PdfDownloadButton.jsx   [S]
PdfDownloadButton({ onClick, disabled })
// 253×60 r30 bg #013262, 라벨 20px SemiBold #fff — 1차는 마크업+상태만, 생성 로직 2차
```

### 2.4 신규 필요하지 않은 것 (명시)

- `SurveyTextArea` — **신설 안 함.** `ConditionalTextInput` 에 `multiline` 추가 (결정 #4 (a), 사용처 1곳)
- 차트 라이브러리 래퍼 — §3.4 결론에 따라 불필요
- 헤더/푸터 관련 일체 — P1

---

## 3. 결과 리포트 `1889:12784` 구현 요소 분해

A4 컨테이너 1120 × 1584.94 ×2페이지, 페이지 간 100px. 좌우 캔버스 여백 400, 내부 패딩 60.

### 3.1 A4-3 (1페이지)

| # | 블록 | node id | 치수 | 1차 가능 범위 | 2차로 남는 것 | 규모 |
|---|---|---|---|---|---|---|
| 1 | 페이지 표기 `1페이지 / 2페이지` | `2226:2908` | 281×21 | ✅ 전부 | — | S |
| 2 | 헤드라인 3줄 (32px SemiBold, ls -0.64px) | `2226:2943` | 574×135 | ✅ 마크업 + 샘플 문구 | 문구 생성(룰/LLM, 결정 #9) | S |
| 3 | **6축 레이더 차트** | `2226:2944` | 446×399 | ✅ **SVG 컴포넌트 전부** — 축 라벨·링·폴리곤·점수 라벨. 값은 prop | 응답→점수 산출(채점 규칙 #8) | **L** |
| 4 | 학생 기본정보 6행 | `2226:2909` | 390×180 | ✅ 마크업 + 샘플 값 | 실데이터(`submissions` + Q1/Q5 응답) | S |
| 5 | 섹션 타이틀 + 요약 카드 3장 | `2226:3014/3015/3016` | 321×142 ×3 | ✅ 전부. **좌우 간격 19/18 불균등은 20 균등으로 정규화 권장** | 점수 산출 | S |
| 6 | **우선순위표 + 진행바 6행** | `2226:2948` | 1000×283 | ✅ 표·뱃지·트랙·fill 전부. **fill 폭은 1차에서 시안 실측값(68/75.209/87/99/134/190) 직접 주입** | fill↔점수 매핑 규칙, 컷오프, 뱃지 체계(1~4순위/점검/유지) | **M** |
| 7 | 학습특성 서술 3블록 | `2226:3034` | 1002×270 | ✅ 마크업 + 시안 문구 | 문단 생성 로직 | S |

### 3.2 A4-4 (2페이지)

| # | 블록 | node id | 치수 | 1차 가능 범위 | 2차로 남는 것 | 규모 |
|---|---|---|---|---|---|---|
| 8 | 종합점수 행 + 요약 문구 | `2226:3314` / `3315` | 158×20 / 489×42 | ✅ 전부 | 점수 산출 | S |
| 9 | **6영역 바그래프** | `2226:3327` | 485×160 | ✅ 전부 — `ScoreBar` 재사용, 라이브러리 불필요 | 점수·컷오프 | S |
| 10 | 잘하는/보완 2열 불릿 | `2240:1518` / `1520` | 494×133 / 494×203 | ✅ 마크업 + 시안 문구 | 불릿 생성 | S |
| 11 | **목표대학 입결 비교표** | `2240:2546` | 510×189 | ✅ 표 마크업 + 시안 값. **단 결정 #11 이 (d)=범위 제외면 이 블록 자체가 삭제** → **D8** | 입시 마스터 데이터(R1), 합격 가능성 예측 | S |
| 12 | 추천 서비스 2열 카드 | `2240:2570` / `2572` | 490×201 ×2 | ✅ 카드·칩 전부 | `programs` 매핑, 1·2순위 선정 | S |
| 13 | **PDF 다운로드 버튼** | `2181:11685` | 253×60 | ✅ 마크업 + hover/press/disabled 상태만 | **실제 PDF 생성 전량**(클라이언트 렌더 vs 서버) | S |

### 3.3 1차 판정 요약

**13개 블록 중 12개는 1차에서 픽셀 완성 가능.** 막히는 건 값 자체가 아니라 값의 *출처*뿐이라, `src/data/renewalReportSample.js` 에 시안 실측값을 상수로 두고 **전 컴포넌트를 prop-driven 으로 만들면 2차에서 데이터 소스만 갈아끼우면 된다.**
예외 1건 = **입결 비교표(11번)**. 결정 #11 이 (d) 로 확정되면 1차에서 만들지 않는 편이 낫다 (만들면 폐기 비용).

### 3.4 레이더/바그래프 — 차트 라이브러리 vs SVG 직접 구현

**현황**: `package.json` 의존성 8개 (`@supabase/supabase-js`, `@tosspayments/tosspayments-sdk`, `@vitejs/plugin-react`, `lucide-react`, `react`, `react-dom`, `react-router-dom`, `vite`). 차트 라이브러리 **0개**.

| 축 | 라이브러리 추가 (Recharts / Chart.js / Nivo) | **SVG 직접 구현** |
|---|---|---|
| 번들 | Recharts ≈ 480KB min / ~110KB gz (+d3-scale/shape/array 서브패키지). Chart.js+react-chartjs-2 ≈ 200KB min / ~65KB gz. Nivo 는 더 큼 | **+0KB** |
| 시안 재현 정확도 | 축 라벨 위치·링 개수·폴리곤 투명도·바 radius 4px 를 라이브러리 옵션으로 우회 조정 → 원값 승계 원칙(P8-2)과 상시 마찰 | 좌표를 직접 쓰므로 **원값 그대로** |
| 인쇄 / PDF | Chart.js 는 canvas → 확대 시 래스터, 텍스트 선택·검색 불가. PDF 출력이 요구사항이라 치명적 | SVG = 벡터, 인쇄·PDF 무손실 |
| 필요 기능 | 툴팁·범례·줌·애니메이션·반응형 컨테이너 — **이 리포트는 하나도 쓰지 않음** (정적 단일 시리즈 6축) | 필요한 것만 |
| 바그래프 | 라이브러리 도입 시 오히려 231×10 / r4 / 색상 3단 임계값 재현이 번거로움 | **`div` 2개** — 트랙 + fill. 컴포넌트라 부르기도 민망한 수준 |
| 구현 비용 | 학습 + 옵션 튜닝 + 스타일 오버라이드 | 육각 좌표 = `cx + r·cos(θ)`, `θ = -90° + 60°k`. 링 n개 + 축선 6 + 라벨 6 ≈ **100~140줄** |
| 유지보수 | 메이저 업그레이드·React 19 호환·d3 전이 의존성 | 없음 |

> **권장: 라이브러리 추가하지 않고 SVG 직접 구현.**
> 근거 — (1) 필요한 그래프가 **정적 6축 레이더 1개 + 단순 가로 바 12개**뿐, (2) PDF/인쇄가 요구사항이라 canvas 계열은 애초에 탈락, (3) 원값 승계 정책상 라이브러리 기본 렌더를 시안에 맞추는 비용이 직접 그리는 비용보다 크다, (4) 의존성 8개짜리 프로젝트에 110KB gz 를 얹는 건 KISS·YAGNI 양쪽에 위배.
> 만약 향후 차트 종류가 5종 이상으로 늘거나 인터랙티브 요구(툴팁·드릴다운)가 생기면 그때 재평가 — 그 시점에도 **SVG 기반인 Recharts** 가 canvas 기반보다 적합.

`RadarChart6` 1차 기본값 제안 (시안 미정 항목이라 prop 으로 노출):
`max=100`, `rings=4`(25/50/75/100), 축 순서 = 시안 스크린샷 판독 순서(목표 설정 → 계획 설계 → 실행 지속 → 시간 관리 → 학습 피드백 → 학습 인정), 첫 축 12시 방향, 시계방향.

---

## 4. 파일 단위 작업 목록

> 경로는 전부 `/Users/hyunsoo/uwellnow/winningpage-free-diagnosis/` 기준.

### 4.1 라우팅

| 파일 | 구분 | 작업 | 규모 |
|---|---|---|---|
| `src/App.jsx` | **수정** | L60~61 교체 — `/free-diagnosis`(유지) · `/free-diagnosis/survey` → step 1 redirect · **`/free-diagnosis/survey/:step` 신규** · **`/free-diagnosis/result` 신규**(1차는 `:id` 없이 샘플 데이터, 2차에 `/result/:id`) | S |

### 4.2 페이지

| 파일 | 구분 | 작업 | 규모 |
|---|---|---|---|
| `src/pages/renewal/FreeDiagnosisLanding.jsx` | **수정** | 전역 리듬(pt 소유·pb=0) / 헤딩 32px·600(최종 CTA만 44px·700) / 히어로 목업 1090.195·글로우·클립 / 4STEP(D9) / 추천카드 이미지 오프셋 3종 상이 / 얻을것 @3x 아이콘 교체 / **입시좌표 맥북 CSS 재현 + 칩 3개 컨테이너 내 재배치 + radial 글로우 제거** / 최종 CTA. **푸터 섹션은 손대지 않음(P1)** | **L** |
| `src/pages/renewal/SurveyPreview.jsx` | **수정 또는 삭제** | 5스텝 분할 도입 시 롱스크롤 프리뷰의 존치 여부 → **D13**. 존치면 `/free-diagnosis/survey/preview` 로 강등 권장 | S |
| `src/pages/renewal/SurveyStepPage.jsx` | **신규** | `:step` 파라미터 → 해당 스텝 문항 필터 → `SurveyStepLayout` + `QuestionCard` 스택 렌더. 스텝 간 응답은 부모 state(메모리) 보존 | M |
| `src/pages/renewal/DiagnosisReport.jsx` | **신규** | A4 2페이지 + PDF 버튼 조립. 1차는 `renewalReportSample` 주입 | M |

### 4.3 설문 컴포넌트

| 파일 | 구분 | 작업 | 규모 |
|---|---|---|---|
| `src/components/renewal/survey/OptionGroup.jsx` | 수정 | selected `#E9F4FF`, hover/focus/max 정본(D2), `exclusiveValues` prop | M |
| `src/components/renewal/survey/ConditionalTextInput.jsx` | 수정 | `multiline`/`rows` prop (992×105, items-start) | S |
| `src/components/renewal/survey/LikertMatrix.jsx` | 수정 | 폭 992 정규화, 행 pitch 64, 구분선 992, 척도 균등 grid | M |
| `src/components/renewal/survey/CascadingSelect.jsx` | 수정 | 필드 228 / 값 140 / chevron gap 24, chevron 소스(D4), placeholder(#17) | M |
| `src/components/renewal/survey/GradeInputGrid.jsx` | 수정(경미) | error 상태 정본화, 라벨 truncate 재확인 | S |
| `src/components/renewal/survey/QuestionCard.jsx` | 수정(경미) | 질문↔보조문 gap 재확인, 내부 콘텐츠 폭 992 명시 | S |
| `src/components/renewal/survey/SurveyProgress.jsx` | 수정 | `<button>` → `role="status"` 배너, prop 정리 | S |
| `src/components/renewal/survey/SurveySubmitButton.jsx` | **신규** | 제출 CTA (§2.3) | S |
| `src/components/renewal/survey/SurveyStepLayout.jsx` | **신규** | 스텝 셸 (§2.3) | M |

### 4.4 리포트 컴포넌트 (전부 신규 — `src/components/renewal/report/`)

| 파일 | 규모 |
|---|---|
| `ReportPageA4.jsx` | S |
| `StudentInfoBlock.jsx` | S |
| `SummaryCards.jsx` | S |
| `StatusBadge.jsx` | S |
| `ScoreBar.jsx` | S |
| `PriorityTable.jsx` | M |
| `DimensionBarChart.jsx` | S |
| `RadarChart6.jsx` | **L** |
| `InsightColumns.jsx` | S |
| `AdmissionCompareTable.jsx` | S (D8 로 제외 가능) |
| `RecommendServiceCard.jsx` | S |
| `PdfDownloadButton.jsx` | S |

### 4.5 데이터

| 파일 | 구분 | 작업 | 규모 |
|---|---|---|---|
| `src/data/renewalSurveyQuestions.js` | **수정** | ① **12번 문항 편입**(9491 Q10 방해요인 13지, max 3) → 19문항 ② `q13/q16/q17/q18` `radio-row`→`radio-chip`, `q14` `checkbox-row`→`chip-multi` ③ `q19` `text`→`textarea` ④ `(선택입력)` 접미사 제거 ⑤ `page_no`(1~5) 필드 추가 ⑥ 오탈자 교정(결정 #15 (b) 범위) ⑦ 배타 선택지 표시 | **M** |
| `src/data/renewalReportSample.js` | **신규** | 시안 실측값 상수(학생정보·6축 점수·우선순위 6행·바 6행·불릿·입결·추천 2카드). 2차에 실데이터로 교체될 자리 | S |

### 4.6 에셋 파일

| 경로 | 구분 | 작업 | 규모 |
|---|---|---|---|
| `src/assets/renewal/landing/illustration-strength.png` | 수정 | 706×538 크롭 | S |
| `src/assets/renewal/landing/illustration-weakness.png` | 수정 | 706×470 리사이즈 | S |
| `src/assets/renewal/landing/illustration-trial.png` | 수정 | 706×470 리사이즈 | S |
| `src/assets/renewal/landing/icon-lock.png` | 수정 | @3x 300×300 재추출(`2162:1146`) | S |
| `src/assets/renewal/landing/icon-folder.png` | 수정 | @3x 300×300 (`2162:1155`) | S |
| `src/assets/renewal/landing/icon-shield.png` | 수정 | @3x 300×300 (`2162:1163`) | S |
| `src/assets/renewal/landing/macbook-shadow.svg` | **신규** | `2240:4580` | S |
| `src/assets/renewal/landing/macbook-bottom.svg` | **신규** | `2240:4588` | S |
| `src/assets/renewal/landing/macbook-screen.png` | **신규** | `2240:4597` @2x 1536×956 (D6 로 대체 가능) | S |
| `src/assets/renewal/select-chevron.svg` | **신규(조건부)** | `1889:10716` — D4 가 lucide 유지면 불필요 | S |
| `src/assets/renewal/checkbox-unchecked.svg` | **신규(조건부)** | `1889:9733` — 바이트 비교 후 판정 | S |
| `src/assets/renewal/landing/macbook-mockup.png` | **삭제** | CSS 전환 후 | — |
| `src/assets/renewal/landing/macbook-screen-content.png` | **삭제** | 교체 후 | — |
| `src/assets/renewal/radio-checked.svg` / `radio-unchecked.svg` | **무변경** | 바이트 동일 검증 완료 | — |

### 4.7 손대지 않는 파일 (P1 · 명시)

`src/components/Header.jsx` · `src/components/SiteFooter.jsx` · `src/components/MobileNavDrawer.jsx` · `public/images/winning-logo.png` · `tailwind.config.js`(전역 토큰 이미 존재 — `max-w-content`, `accent`, `desktop`)

### 4.8 규모 집계

```
신규 파일  18  (페이지 2 · 설문 컴포넌트 2 · 리포트 컴포넌트 12 · 데이터 1 · 에셋 3~5)
수정 파일  16  (라우팅 1 · 페이지 2 · 설문 컴포넌트 7 · 데이터 1 · 에셋 6)
삭제 파일   2
L: 2 (랜딩 / RadarChart6)   M: 8   S: 나머지
```

---

## 5. 권장 착수 순서 (1차 내부)

```
0. 에셋 세션 1회      (C 7건 + 조건부 1 + B 3건 로컬 가공)          — Figma 접근 필요, 한 번에
1. 설문 공통 컴포넌트  OptionGroup / QuestionCard / SurveyProgress / ConditionalTextInput
2. 데이터 정합화      renewalSurveyQuestions.js (12번 편입 + type 5건 + page_no)
3. 스텝 셸 + 라우팅    SurveyStepLayout / SurveyStepPage / App.jsx
4. 스텝 1~5 순차       8753 → 9045 → 9491 → 9866 → 10656
   (2에서 LikertMatrix·GradeInputGrid·CascadingSelect 를 해당 스텝에서 정밀화)
5. 랜딩               FreeDiagnosisLanding.jsx  ← 1~4와 완전 병렬 가능
6. 리포트             원자(ScoreBar/StatusBadge) → 표·카드 → RadarChart6 → 페이지 조립
7. 반응형 적응         리커트 5열이 최대 난관, A4 1120 축소 규칙
```

랜딩(5)은 설문·리포트에 의존하지 않는다 → **별도 트랙으로 병렬 진행 권장.**

---

## 6. 1차 / 2차 경계

### 1차 (이 브랜치)

설문 5스텝 전 화면 마크업·스타일 · 랜딩 전 섹션 · 결과 리포트 A4 2페이지 정적 렌더 · 선택/hover/focus/disabled 상태 전환 · 최대 선택 개수 · 배타 선택지 · 스텝 간 메모리 상태 보존 · 에셋 (A)(B)(C)(D)(E) 처리 · 라우팅 · 반응형 적응

### 2차 (별도 UoW)

DB 스키마 확장(경로 A 컬럼 추가) · `free_diagnosis_submissions` / `_answers` 신설 · 마이그레이션 베이스라인 덤프 · 응답 저장·조회 API · **6축 채점 로직 + 컷오프 + 우선순위 산출** · 진행바 fill↔점수 매핑 확정 · 서술 문단/불릿 생성 · **PDF 실제 출력** · **입시 마스터 데이터**(Q15 실옵션 · 입결 비교표 · 합격 가능성) · 관리자 문항 편집 범위 조정 · 관리자 응답 조회 · 결과 URL `:id` · 새로고침 시 스텝 상태 영속 · 조건부 노출 분기 12건

---

## 7. 결정 대기 (1차 착수 전)

| ID | 질문 | 선택지 | 권장 | 막는 작업 |
|---|---|---|---|---|
| D1 | 설문 카드 폭 — 시안 1112 vs 전역 `max-w-content` 내부 1100 | (a) 1100 (전역 정책) / (b) 1112 (시안 원값) | **(a)** — 전역 폭 정책이 확정 사항이고 12px 차이로 예외를 두면 랜딩과 좌측 정렬이 어긋난다 | 설문 5화면 전체 마크업, `SurveyStepLayout` |
| D2 | hover / focus / disabled / error 정본 (selected 만 P6 로 확정) | (a) 자체 설계 후 디자이너 사후 확인 / (b) 디자이너 선확정 대기 | **(a)** — selected 계열색(`#E9F4FF`/`#013262`)에서 파생. 대기하면 1차 전체가 블로킹된다 | `OptionGroup`, `CascadingSelect`, `GradeInputGrid`, 버튼 3종 |
| D3 | 최종 CTA `진단 결과 보기` 활성색 (시안엔 비활성 `#D7D7D7` 만) | (a) `#013262` / (b) `text-accent` `#0B84FD` / (c) 비활성만 구현 | **(a)** — 랜딩 CTA·리포트 PDF 버튼이 모두 `#013262` | `SurveySubmitButton` |
| D4 | Q15 chevron — 기존 `lucide-react` `ChevronDown` vs `1889:10716` SVG 재추출 | (a) lucide 유지 / (b) SVG 재추출 | **(a) 우선** — 이미 의존성에 있고 24×24 동일. 스크린샷 육안 대조로 형태가 다를 때만 (b) | `CascadingSelect`, 에셋 세션 범위 |
| D5 | 맥북 목업 구현 | (a) CSS 도형 재현 / (b) PNG @2x 추출 | **(a)** — 수치(색·radius·border·각인) 확보 완료, 반응형·용량 유리. Shadow/Bottom 2건은 어느 쪽이든 필요 | 랜딩 입시좌표 섹션, 에셋 (C) 1·2·3 |
| D6 | 맥북 화면 콘텐츠 소스 | (a) `2240:4597` 래스터 @2x / (b) 리포트 A4-3 컴포넌트 축소 렌더 | **(a) 1차 / (b) 리포트 완성 후 교체** — (b) 는 리포트 선행이 필요해 랜딩을 블로킹한다 | 랜딩, 에셋 (C) 1 |
| D7 | 결과 리포트 1차 데이터 | (a) `renewalReportSample.js` 상수 주입(prop-driven) / (b) 컴포넌트에 문구 하드코딩 | **(a)** — 2차에서 소스만 교체 가능. 비용 차이 거의 없음 | 리포트 컴포넌트 12종 전부 |
| D8 | 입결 비교표(`2240:2546`) 1차 포함 여부 | (a) 1차에 정적 구현 / (b) 결정 #11=(d) 전제로 1차 제외 | **(b)** — 입시 마스터 데이터가 repo·DB 어디에도 없다(R1). 만들면 폐기 비용만 남는다 | `AdmissionCompareTable`, `DiagnosisReport` 2페이지 |
| D9 | 랜딩 4STEP 카드행 1180px (전역 1100 초과 80px, ver2 미결 승계) | (a) 1100 안에서 카드 265 축소 / (b) 1180 예외 / (c) 카드 280 유지 + 패딩 축소 | **(a)** — D1 과 동일 논리 | 랜딩 4STEP 섹션 |
| D10 | 칩 행 분리 — Q13(2행)·Q14(3행)·Q16(2행)·Q17/Q18(3행) | (a) 시안대로 행 하드코딩 / (b) `flex-wrap` | **(b)** — 하드코딩하면 반응형에서 전부 깨진다. 1920 에서 시안과 동일 행 구성이 나오는지 먼저 확인 | `OptionGroup`, 스텝 4·5 |
| D11 | 스텝 이동 UI — 시안 하단에 배너/CTA 하나뿐, **이전 버튼 없음** | (a) 시안대로 이전 버튼 없음 / (b) 이전 버튼 자체 추가 | **(a) + 브라우저 뒤로가기로 커버** — 라우트 분할이라 뒤로가기가 자연히 동작한다 | `SurveyStepLayout` |
| D12 | 리커트 폭 정규화 (시안 992/990/1000/1058 혼재) | (a) 992 기준 통일 / (b) 원값 유지 | **(a)** — 시안 자체 결함(R8). 원값 승계 예외를 §3.2-12/13 처럼 명문화 | `LikertMatrix`, 스텝 3·4 |
| D13 | 기존 `SurveyPreview.jsx`(19문항 롱스크롤) 존치 | (a) 삭제 / (b) `/free-diagnosis/survey/preview` 로 강등 보존 | **(b)** — 5스텝 QA 시 전 문항 한눈 확인용으로 유효. 라우트만 옮기면 유지비 0 | `App.jsx`, 파일 정리 |

### 2차로 넘긴 결정 (1차 착수를 막지 않음)

| ID | 질문 | 권장 |
|---|---|---|
| D14 | 6축 채점 규칙 (축 정의·문항 매핑·리커트 배점·컷오프·진행바 fill↔점수) | 기획 산출물 확보 (결정 #8 (a)). 도메인 로직이지 디자인이 아니다 |
| D15 | 스키마 확장 경로 A(컬럼 추가) vs B(`question_items` 신설) | (a) 경로 A |
| D16 | 입시 마스터 데이터 소스 | 결정 #11 (d) 이번 범위 제외 + (c) 주요 대학 수기 병행 검토 |
| D17 | PDF 생성 방식 (클라이언트 렌더 vs 서버) | 리포트 데이터 확정 후 재평가 |
| D18 | 서술 문단·불릿 생성 (룰 템플릿 vs LLM) | (a) 룰 템플릿 우선 |

---

## 8. 이 문서에서 새로 확인된 사실

1. `radio-checked.svg` / `radio-unchecked.svg` 모두 `docs/handoff/fd-ver3/assets/*-13222.svg` 와 **`cmp` 바이트 동일** — P6 재확인, 라디오 에셋 작업 0건 확정. `radio-checked.svg` 는 ASSETS.md §4 "고아 자산" 에서 §1.2 "(A) 재사용"으로 승격.
2. 컴포넌트는 **5개가 아니라 7개** — `QuestionCard.jsx`, `SurveyProgress.jsx` 가 지시문 목록에서 누락돼 있었다. 둘 다 시안 수치와 거의 일치해 사실상 "그대로 사용".
3. `SurveyPreview.jsx` 의 레이아웃 리듬은 **이미 시안과 일치**한다 — 컨테이너 `lg:py-[7.5rem]`=120 ✅, 섹션 스택 `gap-[3.75rem]`=60 ✅, 카드 간 `gap-10`=40 ✅, 타이틀 `lg:text-[2.75rem] font-bold`=44/700 ✅. 재작업 대상은 폭(D1)과 스텝 분할뿐.
4. `CascadingSelect` 는 이미 `lucide-react` 의 `ChevronDown` 을 쓰고 있다 → chevron 재추출(에셋 C-7)이 **불필요할 가능성**이 높다 (D4).
5. `renewalSurveyQuestions.js` 는 `number` 기준 **17문항**(12번 부재) + embedded 5 = 22 엔트리. P5 대로 12번을 편입하면 정확히 19가 된다.
6. `tailwind.config.js` 에 `max-w-content`(72.75rem) · `accent`(#0B84FD) · `desktop`(90rem) 토큰이 **이미 존재** — 전역 정책 적용에 설정 변경 불필요.
7. 차트 라이브러리 미도입이 정당한 결정적 이유는 번들이 아니라 **PDF/인쇄 요구사항** 이다. canvas 기반(Chart.js)은 벡터 출력이 불가능해 애초에 후보에서 탈락한다.
