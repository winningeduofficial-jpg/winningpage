# 위닝에듀 랜딩페이지 리뉴얼 기술 명세서

- 작성일: 2026-07-24
- 대상 브랜치: main 기준 신규 작업 브랜치 (worktree)
- 스택: React 18.3 + Vite 6 + React Router 6.28 + Tailwind 3.4 + Supabase 2.48 (`package.json` 확인 완료)
- **최종 디자인 반영: 2026-07-26** (Figma 루트 노드 `1479:4220` 최종본 재확인 — 페이지 실높이 5529px, 이하 수치·카피·구조는 본 갱신이 최신 정답)
- **2026-07-27 갱신**: 히어로 좌측 배너·멘토 카드 **통이미지 방식** 전환 (결정 14) — 텍스트는 디자이너가 이미지에 포함해 관리자 업로드. 3.1·3.4·5·6·7·11절 반영

---

## 1. 개요

### 1.1 목적

메인 랜딩페이지(`/` → `src/pages/Home.jsx`)의 컨텐츠 6개 섹션을 2026-07 Figma 시안 기준으로 전면 리뉴얼한다.

### 1.2 범위

| 구분 | 내용 |
|---|---|
| 포함 | 랜딩 컨텐츠 6개 섹션: 히어로 / 합격생 / 서비스 / 멘토 / 학교리스트 / 공지사항 |
| 포함 | 관련 DB 신규·필드 추가, Admin CONFIGS 추가·수정, 공용 캐러셀 훅, 에셋 export |
| 제외 | 헤더 / 푸터 |
| 제외 | AdmissionBoard 등 서브 페이지, popups(팝업 관리 — 모달 오버레이라 랜딩 구조와 비결합, `Admin.jsx:86-123`, `Home.jsx:652,933` 확인) |

### 1.3 AS-IS / TO-BE 한 줄 요약

- AS-IS: DB 기반 배너/카드 섹션들이 화살표 버튼 중심 캐러셀 + 사이드바형 공지로 구성.
- TO-BE: 화살표 전면 제거(자동 롤링 + 터치/휠 스와이프), 신규 합격생 대학 테이블·학교리스트 정적 섹션 추가, 멘토 텍스트 오버레이 카드 스트립, 공지 독립 풀폭 섹션화.

### 1.4 Figma

- fileKey: `hsokTD6OilcNEXyCR24sn4`
- 루트 노드: `1479:4220` — "1920 - 랜딩 - 메인"
- 주의: Figma MCP 에셋 URL은 7일 후 만료 → 구현 전 에셋 일괄 다운로드 필수 (7절 참조)
- 페이지 총높이(2026-07-26 최종본 재실측): **5863 → 5529px** — 헤더 148 + 히어로 629 + 합격생 781 + 서비스 974 + 멘토 784 + 학교리스트 490 + 공지사항 1055 + 푸터 668

---

## 2. 확정 결정사항 로그 (사용자 승인)

| # | 결정 |
|---|---|
| 1 | 범위: 랜딩 컨텐츠 6개 섹션만 — 헤더/푸터 제외 |
| 2 | 화살표 버튼 전체 삭제 (히어로/합격생/멘토) — 캐러셀은 자동 롤링 + 터치/휠 스와이프만 |
| 3 | 히어로: 좌측 = 고정 이미지 1장 (`banners` 재사용, 캐러셀 제거), 우측 = 자동 전환 캐러셀 + 이미지 하단 클릭 가능 pill 인디케이터 + 스와이프 (`home_side_banners` 재사용) |
| 4 | 합격생: 신규 테이블 `university_acceptances` + Admin CONFIGS 신규 + 탭 필터. 기존 AcceptanceCarousel 무한 롤링 로직 재사용. `admission_posts`는 AdmissionBoard용으로 유지 |
| 5 | 서비스: `program_categories` 유지 + `icon_image_url` 필드 추가 + 6항목 데이터 교체 (무료진단/목표관리/콜멘토/수행평가/자기평가/심화탐구). `ServiceCards.jsx`(dead) 삭제 |
| 6 | 멘토: 텍스트 필드 분리안 ⓐ 확정 — `home_mentor_strategies`에 `mentor_name`/`badge_text`/`affiliation` 폼 필드 추가(2026-07-26 최종본 확인으로 `mentor_generation`/`mentor_university` 2필드안에서 조정), 풀폭 사진 스트립 + 텍스트 오버레이 |
| 7 | 학교리스트: 신규 정적 섹션 (로고 14개 확정, 정적 에셋 — 테이블 없음) |
| 8 | 공지사항: 리스타일만 — `notices`/`company_news` 데이터·admin 불변, 멘토 옆 사이드바 → 독립 풀폭 섹션 이동 |
| 9 | 공용 무한 롤링 캐러셀 훅 추출 (3반복 + normalize + rAF + hover/focus/pointerdown pause) — 합격생·멘토 공용. pointerdown pause는 신규 개선 |
| 10 | Admin guideText 수정 3곳 (banners / side_banners / mentor) |
| 11 | 반응형: 1920 시안만 존재 — 모바일/태블릿은 기존 페이지 반응형 패턴 따라 자체 판단 |
| 12 | 공수: 약 5~5.5일 (1인) — 10절 참조 |
| 13 | 디자인 최종본 확정 (2026-07-26) — 이후 수치·카피는 본 문서 기준 |
| 14 | (2026-07-27) 히어로 좌측 배너·멘토 카드 통이미지 방식 전환 — 텍스트는 이미지에 포함해 관리자 업로드. 결정 6의 ⓐ(텍스트 필드 분리) 및 히어로 텍스트 오버레이 방안 폐기 |
| 15 | (2026-07-27) 합격생 카드 서브라벨 count → subtitle 자유 텍스트 전환 — 의약학·특수계열 카드(시안 `1685:1452`)는 "N명 합격"이 아닌 학과명(의예과 등) 표기. `university_acceptances.subtitle text` 추가, `count` nullable 완화. 렌더는 subtitle 우선, 없으면 count 기반 'N명 합격' 폴백 |

---

## 3. 섹션별 명세

### 3.1 히어로

**Figma**: `1479:4256`, y=148, 1920×629 (2026-07-26 최종본 — 이전 707px에서 축소). 콘텐츠 폭 1330×429, 중앙 배치(x≈295), 카드 2장 가로 flex gap 40px

#### TO-BE 디자인

| 항목 | 값 |
|---|---|
| 좌측 카드 | 969 × 429px, **통이미지 1장** — 헤드라인·CTA 텍스트를 포함한 완성 이미지를 디자이너가 제작, 관리자로 업로드 (2026-07-27 결정 14) |
| 헤드라인 (이미지 포함 내용) | "학습 기록이 쌓이면,\n입시 전략이 더 정교해집니다" — Pretendard Bold, `#FFFFFF`. Figma 텍스트 레이어는 이미지 제작 시 포함할 내용의 소스 |
| CTA (이미지 포함 내용) | "무료 입시 진단하기 →" — SemiBold, `#45A5FF`. '→'는 텍스트 문자 (이미지에 포함) |
| 우측 카드 | 321 × 429px 단일 카드 ("위닝 콜멘토 서비스 전격 출시") |
| 카드 간격 | 40px |

**주의**: 결정사항 3번(우측 자동 전환 + pill 인디케이터 + 스와이프)의 pill이 최종 시안에 그려져 있지 않음 — 결정은 유지하되 "pill 시각 스타일 디자이너 확인 필요"를 미결에 추가 (11절 반영).

구현 노트: 우측 배너는 429h 단일 카드로 축소(콜멘토 서비스 출시 안내). 치수는 rem 환산(÷16) + 근사 정수화.

#### AS-IS 현황

| 항목 | 근거 |
|---|---|
| 좌측: `banners` 테이블 캐러셀, 10s 자동 전환 | `Home.jsx:580-585` fetch, `:812-815` setTimeout 10000 (`heroReady && banners.length > 1` 조건 `:810`) |
| 좌측 화살표 | `:992-999` prev / `:1000-1007` next — `banners.length > 1`일 때만 (`:990`) |
| 좌측 dot 인디케이터 | `:1009-1021` (활성 `w-9 bg-white` pill / 비활성 `w-2.5 bg-white/45`) |
| banners fetch 조건 | `.eq('is_active', true)` + `.order('sort_order')` (`:583-585`), image_url 없는 항목 클라이언트 filter (`:595-597`) |
| 우측: `home_side_banners`, 6s 자동 전환 | fetch `:688-694` (is_active + start/end_date KST 기간 필터 + sort_order), 타이머 `:824-827` |
| 우측 화살표 / 인디케이터 | `:1078-1093` / `:1095-1109` — `sideBanners.length > 1`일 때만 (`:1076`) |
| 타이머 리셋 | prev/next/dot 클릭 시 `resetBannerTimer()`/`resetSideBannerTimer()` (`:852-892`) |
| 모바일 이미지 | 사이드 배너 `mobile_image_url` 있으면 picture/source 768px 분기 (`:1041-1053`), subtitle 표시 (`:1068-1072`) |
| 슬롯 예약 / 폭 분기 | placeholder 예약 (`:845`, `:1026-1032`), 사이드 배너 없으면 좌측이 `lg:grid-cols-1` 전체 폭 (`:942-946`) |

> **정정 반영**: 화살표는 좌(메인)/우(사이드) **양쪽 모두** 코드에 구현되어 있으며, 각각 항목 2개 이상일 때만 렌더링된다. 스크린샷에서 우측만 ‹›가 보인 것은 당시 `banners` 활성 배너가 1개, `home_side_banners`가 2개 이상이었기 때문 (데이터 개수에 따른 동적 렌더링).

#### 변경 내용

1. 좌측: 캐러셀 제거 → `banners` 활성 1건(sort_order 최상위)만 고정 렌더. 자동 전환 타이머·화살표·dot 삭제. `heroReady` preload 로직(`:792-807`)은 첫 이미지 로딩용으로 유지 검토.
2. 우측: 화살표 삭제, 자동 전환(6s) 유지, **이미지 하단 클릭 가능 pill 인디케이터** + 터치/휠 스와이프 추가. 스와이프/클릭 시 타이머 리셋 유지.
3. 좌측 배너는 **통이미지**로 운영 (2026-07-27 결정 14): 헤드라인·CTA 텍스트를 포함한 완성 이미지를 디자이너가 제작, admin(`banners`)으로 업로드. 코드 텍스트 오버레이 방안 폐기.

#### 인터랙션

- 우측 캐러셀: 6s 자동 전환, hover 시 일시정지(선택), pill 클릭 즉시 이동 + 타이머 리셋, 터치 스와이프/트랙패드 휠 좌우 이동.
- `prefers-reduced-motion`: 자동 전환 비활성.

#### 데이터 소스 / Admin 영향

- `banners`: 유지, 운영상 "1장만 사용" 안내로 guideText 수정 (6절).
- `home_side_banners`: 유지 (스키마 변경 없음), guideText 수정 (6절).

---

### 3.2 합격생

**Figma**: `1496:760`, y=777, 1920×781 (2026-07-26 최종본). 흰 배경 섹션. 헤더 + 탭 행 + 카드 행(중앙 정렬, 좌우 블리드 -130px 시작 → 뷰포트 초과 = 무한 롤링 의도)

#### TO-BE 디자인

| 항목 | 값 |
|---|---|
| 타이틀 | "인서울부터 과기원까지" (`#af9364` 골드) / "합격생 선배님들의 압도적 선택" (`#525252`) — 2줄, 44px Bold, lh 1.4, ls -0.88px (**정정**: 기존 문서의 "합격생 선배님들이 위닝에듀을 선택하는 이유" 카피는 폐기) |
| 탭 | "일반계열"(활성 `#525252` SemiBold) \| 세로 구분선 1×30px \| "의약학 · 특수계열"(비활성 `#d7d7d7` Medium) — 24px, gap 40px. 구분선은 이미지 대신 CSS border |
| 카드 | 200 × 300px, radius 32px, 배경 `#f9fafb`, gap 20px, 좌우 블리드(-130px 시작) |
| 카드 내부 | padding-top ~52px(통일), flex column gap 24px 중앙 정렬: 엠블럼 120×120 중앙 → 대학명 20px Medium(예: 중앙대학교) → 서브라벨 16px Regular (첫 카드만 14px은 Figma 불일치 → 16px 통일). 서브라벨은 `subtitle` 자유 텍스트 — 일반계열 "N명 합격", 의약학·특수계열 학과명 (결정 15) |
| 초기 데이터 (일반계열) | 시안 샘플 10개: 중앙대 7 / 한양대 7 / 고려대 7 / 한국외대 6 / 부산대 5 / 유니스트 5 / 성균관대 5 / 건국대 5 / 연세대 4 / 서강대 2 — 합격 인원 내림차순 |
| 초기 데이터 (의약학·특수계열) | 시안 `1685:1452` 카드 10개: 고려대 의예과 / 한양대 의예과 / 경북대 의예과 / 고신대 의과대학 / 가톨릭관동대 의과대학 / 부산대 치의예과 / 동의대 한의예과 / 원광대 한의예과 / 해군사관학교 84기 / 고려대 삼성전자 연계. 엠블럼 일부는 시안 placeholder — 운영에서 관리자 교체 예정 |

주의: 건국대 로고만 Figma에서 106% 확대 크롭 → object-cover 또는 재크롭.

#### AS-IS 현황

| 항목 | 근거 |
|---|---|
| 현 데이터 소스: `admission_posts` | `Home.jsx:695-702` (category in susi/jungsi, is_active, show_on_home) → `:744-759` acceptanceCards 매핑 → `:1139` `<AcceptanceCarousel items={...}>` |
| 캐러셀 로직 | 3배 반복 `:213-216`, normalizePosition `:224-235` (cycleWidth = scrollWidth/3), rAF `scrollLeft += delta*0.025` ≈ 25px/s `:283-301` |
| pause | hover `:321-326`, focus `:327-332`, manual 700ms `:241-252`. **touch/pointer pause 없음** (grep 0건 — 모바일 터치 중에도 자동 스크롤 지속) |
| 화살표 | `:334-343` / `:357-366` (move(-1)/move(1)), `safeItems.length > 1` 조건 |
| reduced-motion | `:278-279` rAF effect 조기 반환 (mount 1회 체크, change 리스너 없음) |
| `admission_posts` 타 사용처 | `AdmissionBoard.jsx:99-102`(목록), `:128-133`(상세); 라우팅 `App.jsx:68-80`; `Admin.jsx:562,612,656,700` CRUD → **테이블 유지 필수** |

#### 변경 내용

1. 데이터 소스 교체: `admission_posts` → 신규 `university_acceptances` (DDL 5절). 계열구분 탭 필터(`track` 컬럼: `general` \| `medical_special`).
2. 화살표 버튼 2개 삭제, 무한 롤링 로직은 공용 훅으로 추출 재사용 (4절).
3. `admission_posts` fetch(`:695-702`)·acceptanceCards 매핑·AcceptanceCard/AcceptanceCarousel 기존 카드 마크업은 랜딩에서 제거. `admission_posts` 테이블·AdmissionBoard·Admin config는 불변.
4. 잔존 기능 처리: 랜딩에서 캐러셀만 제거하면 `show_on_home` 컬럼/Admin UI가 죽은 기능이 됨 — Admin에서 해당 필드 숨김 또는 안내문 갱신 검토 (9절).

#### 인터랙션

- 무한 자동 롤링 (~25px/s) + 터치/휠 스와이프. hover/focus/pointerdown pause. reduced-motion 시 정지.
- 탭 클릭 시 track 필터 전환 (클라이언트 필터, 캐러셀 위치 리셋).

#### 데이터 소스 / Admin 영향

- 신규 `university_acceptances` 테이블 + Admin CONFIGS 신규 항목 (6절).

---

### 3.3 서비스

**Figma**: `1479:4345`, y=1558, 1920×974 (2026-07-26 최종본 — 이전 1230px에서 축소). 흰 배경, 헤더(골드 eyebrow + 2줄 대제목) + **3열×2행** 카드 그리드 (**정정**: 기존 문서의 2열×3행 그리드는 폐기)

#### TO-BE 디자인

| 항목 | 값 |
|---|---|
| Eyebrow | "핵심 서비스" — 20px SemiBold, `#af9364` |
| 대제목 | "진학의 순간들을 막막하지 않도록. 필요한 만큼만." — 44px Bold, lh 1.4, ls -0.88px, `#525252` (**정정**: 기존 문서의 "입시 준비의 순간들을 막막하지 않도록. 필요한 만큼만." 카피는 폐기) |
| 그리드 | 3열×2행, 카드 427 × 217px, radius 30px, 흰 배경, 그림자 `0 2px 4px 2px rgba(215,215,215,0.25)`, 열 x=280/747/1214 (열간 40px), 행 y≈380/637 (행간 40px) |
| 배치 | 1행: 무료진단 · 목표관리 · 콜멘토 / 2행: 수행평가 · 자기평가 · 심화탐구 |
| 카드 텍스트 | 좌측 내측 40px: 제목 24px SemiBold + gap 30px + 설명 20px Medium, `#525252` |
| 아이콘 | 카드 우측에 겹쳐 돌출(카드 경계 밖 오버플로) + 하단 그림자/받침 이미지 별도 레이어(~136×29). 에셋 export 시 아이콘+그림자 세트로 함께 |
| 6항목 카피 확정 | 무료진단 "무료로 경험하는 위닝 AE시스템" / 목표관리 "목표 대학과 진로에 맞춘 관리 서비스" / 콜멘토 "필요한 순간에 멘토와 바로 연결" / 수행평가 "수행평가를 함께 완성" / 자기평가 "문항 해석부터 구조 설계까지" / 심화탐구 "주제 추천부터 탐구 설계까지" |

구현 노트: Figma의 `calc(25%/50%/75%±px)` 절대배치는 이식 불가 → 헤더 아래 3열 grid flow로 변환. 스프라이트 PNG 1장에서 크롭된 아이콘 4종(목표관리/콜멘토/수행평가/심화탐구)은 **개별 이미지로 잘라 export** (7절). 자기평가 배지만 rotate 18.66deg.

#### AS-IS 현황

| 항목 | 근거 |
|---|---|
| fetch | `Home.jsx:613-644` — `program_categories` select(id, name, description, link, icon, sort_order, is_active), is_active + sort_order 정렬 |
| 아이콘 매핑 | `serviceIconMap` (`Home.jsx:23-34`, target/brain/file/... → lucide), 미지정 시 ClipboardList 폴백 (`:630`) |
| 표시 개수 | `serviceItems.slice(0, 7)` 최대 7개 (`:847-850`) — 6개 고정 아님 |
| Admin config | `Admin.jsx:873-908` — icon은 lucide 키 select(`:896`), **이미지 URL 필드 없음** |
| ServiceCards.jsx | import 0건 — 죽은 컴포넌트 (`src/components/ServiceCards.jsx:83`) |

> **정정 반영 1**: `program_categories` 참조 파일은 실제로는 3곳 — 살아있는 사용처는 `Home.jsx:615`·`Admin.jsx:875` 둘뿐이지만, 죽은 `ServiceCards.jsx:91`(select)·`:120`(realtime 구독)도 코드상 동일 테이블을 참조한다. 삭제 시 이 참조도 함께 제거된다.
>
> **정정 반영 2**: 현재 실렌더되는 카드 항목명은 DB(`program_categories`) 내용에 의존하므로 코드만으로 확정 불가. 코드에서 확인되는 것은 (a) 죽은 `ServiceCards.jsx:15-58`의 FALLBACK 6종 명칭, (b) 최대 7개 표시, (c) `Header.jsx:39-51` nav fallback 유사 명칭뿐. → 6항목 교체는 **DB 데이터 작업**으로 수행 (5절).

#### 변경 내용

1. `program_categories`에 `icon_image_url` 컬럼 추가 — lucide 아이콘 대신 3D 일러스트 이미지 렌더. `icon_image_url` 없으면 기존 lucide 폴백 유지 (하위 호환).
2. DB 데이터 6항목 교체 (5절 시드 목록), 표시 로직 `slice(0, 7)` → 6개 기준으로 조정 검토.
3. 카드 마크업을 Figma 스펙(427×217, 3열×2행, 좌 텍스트 + 우 일러스트 + 그림자 PNG)으로 교체.
4. `src/components/ServiceCards.jsx` 삭제 (9절).

#### 인터랙션

- 정적 그리드. 카드 전체가 `link` 필드로 이동하는 클릭 영역 (기존 동작 유지, 기본 `/services`).

#### 데이터 소스 / Admin 영향

- `program_categories` 유지 + `icon_image_url` 추가. Admin 기초 데이터 config에 image 타입 필드 추가 (6절).

---

### 3.4 멘토

**Figma**: `1479:4378`, y=2532, 1920×784 (2026-07-26 최종본). 라이트 블루 그라데이션 풀폭 밴드, 헤더→카드 행 gap 60px. 스트립 총폭 5060px, 좌우 블리드(x=-1850 시작), 카드 210×360(1장만 230), gap 20 → 무한 마퀴 의도

#### TO-BE 디자인

| 항목 | 값 |
|---|---|
| 배경 | `linear-gradient(106.26deg, #FFFFFF 0.48%, rgba(176,215,254,0.845) 32.4%, rgba(98,171,255,0.2) 79.1%, rgba(11,132,253,0.25) 99.6%)` — 순수 CSS, 라이트 블루 그라데이션 풀폭 밴드 |
| 제목 | "혼자 고민하지 마세요" (`#525252`) / "끝까지 멘토와 함께해요" (`#AF9364`) — 2줄, 2행 골드 강조, 44px Bold, lh 1.4, ls -1.1px |
| 카드 | 210 × 360px(1장만 230×360), radius 20px, 배경 `rgba(255,255,255,0.6)` 반투명, gap 20px, **overflow:hidden 필수** (사진 하단 클리핑) |
| 카드 구조 | **통이미지 카드** (2026-07-27 결정 14): 배지(기수·구분)·이름·소속(대학·학과) 텍스트를 모두 포함한 완성 이미지 1장 — 디자이너 제작, 관리자 업로드. **권장 420×720 @2x**. Figma의 텍스트 레이어(line1 badge 예: "위닝 8기" / "예체능계열 멘토" / "학습멘토 위닝 2기" / "해외유학 위닝 14기", line2 예: "김형준 멘토 서울대 수의예과")는 **이미지 제작 시 포함할 내용의 소스**로만 사용 — 코드 오버레이·DB 텍스트 필드 없음 |
| 인물 사진 | 대체로 폭 230px, top 61~96px 시작 — 통이미지 제작 시 디자이너가 크롭·배치 반영 |
| 카드 수 | **22명 전원 시안에 명시** (멘토 명단·에셋은 7절 참조) |

카피 오탈자 의심 (확정 필요): "응용계학과"(연세대), "김성훈멘토"(붙어쓰기), "카네기 맬런"(멜런).

#### AS-IS 현황

| 항목 | 근거 |
|---|---|
| MentorArchGallery | `Home.jsx:390-524` — `item.image_url`(`:392,468,497`)과 key용 `item.id`(`:462,485`)만 사용. **텍스트 필드 미사용**, alt는 인덱스 기반 고정 문자열 |
| fetch | `Home.jsx:703-707` — `home_mentor_strategies` select('*'), is_active + sort_order |
| 레이아웃 2종 | 모바일 가로 스크롤 `:458-475`(lg:hidden) / 데스크톱 아치형 절대배치 `:477-510`(hidden lg:block, 5슬롯) |
| 화살표 | `:447-456` / `:512-521`, `safeItems.length > 1` 조건 |
| Admin config | `Admin.jsx:202-231` — 폼 필드는 `image_url` 1개뿐(`:212-220`); defaults에 mentor_name('위닝 멘토')/title/description/link_url/open_new_window 존재하나 렌더 미사용 (dead 데이터) |
| guideText | `Admin.jsx:208` — "…반원형으로 배치되는 이미지입니다. 이미지 1장만 등록하면 됩니다. 권장 이미지: 1400px × 500px / 비율: 약 2.8:1…" |

#### 변경 내용

1. 아치형 갤러리(MentorArchGallery) 전체 삭제 → 풀폭 **통이미지 카드 스트립**으로 교체.
2. **통이미지 방식 확정 (2026-07-27 결정 14)**: 기존 텍스트 필드 분리안 ⓐ(`badge_text`/`mentor_name`/`affiliation` 컬럼·폼 필드 추가) 폐기 — 텍스트는 디자이너가 이미지에 포함해 관리자 업로드. `home_mentor_strategies` 스키마·폼 필드 변경 없음 (`image_url` + `sort_order`만 사용, 5절).
3. 화살표 삭제, 공용 무한 롤링 훅 적용 (4절).
4. 카드 이미지 스펙 변경: 1400×500 가로형 → 세로형 통이미지 (권장 420×720 @2x, 카드 표시 210×360, 1장만 230×360) — guideText 전면 교체 (6절).

#### 인터랙션

- 무한 자동 마퀴 + 터치/휠 스와이프, hover/focus/pointerdown pause, reduced-motion 정지 (합격생과 동일 훅).

#### 데이터 소스 / Admin 영향

- `home_mentor_strategies` 스키마·폼 필드 불변 (`image_url` + `sort_order`만 사용) — guideText 교체만 (6절). 기존 dead defaults(title/description/link_url/open_new_window)는 정리 검토 (9절).

---

### 3.5 학교리스트 (신규)

**Figma**: `1496:844`, y=3316, 1920×490 (2026-07-26 최종본). 흰 배경 풀폭. 타이틀(중앙, top 120) + 로고 2행(2행: 7+7, 높이 40~52 가변, 흑백/단색 톤)

#### TO-BE 디자인

| 항목 | 값 |
|---|---|
| 타이틀 | "위닝에듀가 함께한 대입 합격" — 44px Bold, lh 1.4, ls -0.88px, `#525252`, 중앙 정렬 |
| 로고 행 | flex row items-center, gap 40px(2.5rem), 중앙 정렬. 타이틀→행1 약 80px, 행1→행2 64px |
| 로고 개수 | **14개 확정** (2행: 7+7) — 기존 미결 #7("15 vs 17")은 이번 최종본 확인으로 해소 |
| 행1 (7개) | 서울대 129×40 / 연세대 126×44 / 고려대 133×36 / 한양대 142×44 / 부산대 175×44 / KAIST 115×40 / UNIST 162×28 |
| 행2 (7개) | 성균관대 141×52 / 한국외대 194×40 / 건국대 103×44 / 중앙대(CAU) 161×40 / 서강대(?) 120×40 / 경북대 151×40 / 부경대 181×40 |

시안 식별 로고: 서울대/연세대/고려대/한양대/부산대/KAIST/UNIST/성균관대/한국외대/건국대/중앙대/서강대(?)/경북대/부경대 등 — 에셋 export로 최종 확정.

#### AS-IS / 변경 내용

- AS-IS 해당 섹션 없음 — 완전 신규.
- 구현: **테이블 없음**, 로고 14개 정적 에셋(`src/assets` 또는 `public`)을 배열 상수로 렌더. 로고별 고정 w/h 유지(비율 제각각, 그레이스케일/단색 톤 그대로). 부경대만 object-bottom.
- Figma 절대배치(top 120/262/326) → flex column + 고정 여백으로 변환. 행1의 0.5px 오프셋은 무시. 노드 data-name 중복(image 321/322 재사용)이 있으므로 노드명 기반 매핑 금지.

#### 인터랙션 / Admin 영향

- 없음 (정적). Admin 영향 없음.

---

### 3.6 공지사항

**Figma**: `1496:511`, y=3806, 1920×1055 (2026-07-26 최종본). 배경 `#F9FAFB`, 중앙 타이틀 + 2컬럼(좌 회사소식 / 우 공지사항, gap 60px), **각 3행 리스트** (**정정**: 기존 문서가 6건이면 정정 — 최종 시안은 각 3건 노출)

#### TO-BE 디자인

| 항목 | 값 |
|---|---|
| 타이틀 | "위닝에듀의 새로운 소식" — 44px Bold, ls -0.88px, `#525252`, 중앙 |
| 컬럼 헤더 | "회사소식" / "공지사항" — 24px Bold + 타이틀 옆 24×24 화살표(더보기 링크) 아이콘 (프로젝트 lucide ChevronRight로 대체 가능) |
| 좌측 회사소식 | 행 620×94px 카드 ×3, border-bottom 1px `#D7D7D7`: 썸네일 100×55 r12 → 제목 + "보도자료" 태그 pill + 날짜(YYYY.MM.DD, 16px Regular `#D7D7D7`) |
| 우측 공지사항 | 행 690×54px ×3, px 10 / py 16, border-bottom 1px `#D7D7D7`: [중요] 태그 + 제목 + 우측 날짜 (제목 오버플로는 ellipsis 처리) |
| 뱃지 | 10px Medium, px 8 / py 4, r8 — "보도자료" bg `#E9F4FF` / text `#013262`, "중요" bg `#FFC4C4` / text `#FF7373` |

Figma 정리 사항: '회사소식' 텍스트 중복 노드(1496:512, 1711:2187) 여전 존재 → 렌더링 시 1개만. 좌측 4번째 행 뱃지 패딩 불일치 → px8/py4 통일. `%` 의존 수직 배치 → 고정 padding flow로 치환. 리스트는 각 3행 더미 데이터 — 실데이터 바인딩.

#### AS-IS 현황

| 항목 | 근거 |
|---|---|
| fetch | `Home.jsx:708-715` company_news / `:716-723` notices — is_active, is_pinned desc → sort_order asc → created_at desc, limit 5 |
| 현 배치 | `Home.jsx:1202` `xl:grid-cols-[minmax(0,1fr)_300px]` — 멘토 섹션 옆 300px `<aside>`에 NewsPreviewCard 2개 (`:1219-1232`, 정의 `:526`) |
| moreLink | 회사소식 → `/company-news`, 공지사항 → `/events` (`:1223,:1229`) |
| Admin notices | `Admin.jsx:294-328` — is_pinned '최상단 고정' 체크박스(`:309`), image_urls multiImage(`:311`) |
| Admin company_news | `Admin.jsx:336-354` — is_pinned '주요소식 고정'(`:352`), image_urls multiImage(`:354`) |

#### 변경 내용

1. NewsPreviewCard 사이드바 배치 제거 → 독립 풀폭 섹션으로 이동, Figma 2컬럼 리스트 스타일로 리스타일.
2. 데이터 쿼리·정렬·limit·Admin config **불변**. 리스트 행 수는 최종 시안 각 3행 노출 기준으로 limit 5→3 조정 검토 (미결, 11절).
3. 좌측 썸네일: 시안은 placeholder(#D9D9D9) — `image_urls[0]`을 썸네일로 사용, 없으면 placeholder 렌더.
4. 뱃지 매핑: company_news is_pinned → "보도자료"류 뱃지 / notices is_pinned → "중요" 뱃지 (뱃지 라벨 카피는 미결, 11절).

#### 인터랙션 / Admin 영향

- 행 클릭 → 상세 이동, 헤더 chevron → moreLink (기존 경로 유지). Admin 영향 없음.

---

## 4. 공용 컴포넌트 — 무한 롤링 캐러셀 훅

기존 AcceptanceCarousel 로직(`Home.jsx:200-369`)을 훅으로 추출, 합격생·멘토 공용.

```js
// src/hooks/useInfiniteMarquee.js
/**
 * @param {object} opts
 * @param {number}  [opts.speed=25]        px/sec (rAF, delta는 frame당 최대 50ms 캡)
 * @param {number}  [opts.gap=20]          아이템 간격 px (step 계산용)
 * @param {boolean} [opts.enabled=true]    items.length > 1일 때만 동작
 * @returns {{ containerRef, trackProps, renderItems }}
 *   renderItems: items를 3배 반복한 배열 (key suffix 포함)
 */
export function useInfiniteMarquee(items, opts) { /* ... */ }
```

### 동작 명세

| 항목 | 명세 | 출처 |
|---|---|---|
| 3배 반복 | `[...items, ...items, ...items]` | `Home.jsx:213-216` |
| normalize | cycleWidth = scrollWidth/3; `scrollLeft >= 2*cycle → -cycle`, `< 0.5*cycle → +cycle` | `Home.jsx:224-235` |
| 자동 스크롤 | rAF, `scrollLeft += delta * (speed/1000)` (기본 ≈25px/s, delta ≤ 50ms 캡) | `Home.jsx:283-301` |
| hover pause | onMouseEnter/Leave | `Home.jsx:321-326` |
| focus pause | onFocusCapture/onBlurCapture | `Home.jsx:327-332` |
| **pointerdown pause (신규)** | pointerdown → pause, pointerup/pointercancel → 재개(짧은 유예 후). 기존 코드에 touch/pointer 핸들러 0건이던 결함 개선 | 신규 |
| 휠/터치 스와이프 | 네이티브 overflow-x 스크롤 위에 rAF 가산 — 스와이프 중 pause로 충돌 방지 | 신규 |
| reduced-motion | `matchMedia('(prefers-reduced-motion: reduce)')` 시 자동 스크롤 미시작 (스와이프는 허용). 개선: change 리스너 추가 검토 | `Home.jsx:278-279` |
| 단일 아이템 | `items.length <= 1`이면 롤링 비활성 | `Home.jsx:239,276` |
| resize | positionAtMiddle 재실행 (중앙 사이클 리셋) | `Home.jsx:259-267` |

화살표 관련 코드(move/manual pause 700ms)는 훅에서 제외 — 화살표 전면 삭제 결정에 따름.

---

## 5. DB 변경

### 5.1 신규: `university_acceptances`

```sql
create table public.university_acceptances (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,                    -- 대학명 (예: 중앙대학교)
  emblem_url  text not null,                    -- 엠블럼 이미지 (120x120 표시)
  subtitle    text,                             -- 카드 서브라벨 자유 텍스트 (예: '7명 합격', '의예과') — 결정 15
  count       integer,                          -- 합격 인원 (nullable — 렌더는 subtitle 우선, 없으면 'N명 합격' 폴백)
  track       text not null default 'general'
              check (track in ('general', 'medical_special')),  -- 일반 | 의약학·특수계열
  sort_order  integer not null default 1,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table public.university_acceptances enable row level security;
create policy "public read" on public.university_acceptances
  for select using (is_active = true);
-- write 정책은 기존 admin 테이블들(banners 등)과 동일 패턴으로 적용
```

시드 (track='general', 인원 내림차순, subtitle='N명 합격'): 중앙대 7 / 한양대 7 / 고려대 7 / 한국외대 6 / 부산대 5 / 유니스트 5 / 성균관대 5 / 건국대 5 / 연세대 4 / 서강대 2.

시드 (track='medical_special', 시안 `1685:1452`, subtitle=학과명, count=null — 결정 15): 고려대 의예과 / 한양대 의예과 / 경북대 의예과 / 고신대 의과대학 / 가톨릭관동대 의과대학 / 부산대 치의예과 / 동의대 한의예과 / 원광대 한의예과 / 해군사관학교 84기 / 고려대 삼성전자 연계. (기존 "발주자 제공 대기" 해소 — 2026-07-27 시안 반영)

### 5.2 변경: `program_categories`

```sql
alter table public.program_categories add column icon_image_url text;
```

데이터 교체 (6행, sort_order 1~6): 무료진단 / 목표관리 / 콜멘토 / 수행평가 / 자기평가 / 심화탐구 — name·description은 3.3절 Figma 카피, icon_image_url은 export한 일러스트 URL, link는 각 서비스 경로. 기존 행은 is_active=false 처리 또는 UPDATE 교체 (기존 icon 컬럼은 폴백용 유지).

### 5.3 불변: `home_mentor_strategies`

(2026-07-27 결정 14) 통이미지 방식 전환으로 **스키마 변경 없음** — 기존 `badge_text`/`affiliation`/`mentor_name` 컬럼 추가안 폐기. 사용 컬럼은 `image_url` + `sort_order`(+ `is_active`)만.

데이터 입력: 멘토 22건 — 텍스트(배지·이름·소속)를 포함한 세로형 통이미지 22장(권장 420×720 @2x, 디자이너 제작) 업로드(`image_url`) + `sort_order` 지정. 텍스트 원문은 3.4절 기준, 오탈자 교정 확정 후 이미지 제작.

### 5.4 마이그레이션·입력 작업 목록

| 순서 | 작업 | 유형 |
|---|---|---|
| 1 | `university_acceptances` CREATE + RLS + 시드 10건 | SQL |
| 2 | `program_categories.icon_image_url` ADD + 6행 데이터 교체 | SQL + Admin |
| 3 | 대학 엠블럼 10종 / 서비스 일러스트 6종 / 멘토 통이미지 22장 업로드 | Storage |
| 4 | 멘토 22건 통이미지 `image_url` + `sort_order` 입력 | Admin |
| 5 | 히어로 banners 통이미지 1건·side_banners 신규 이미지 교체 | Admin |

불변: `admission_posts`, `notices`, `company_news`, `popups`, `banners`, `home_side_banners`, `home_mentor_strategies` 스키마 (멘토 컬럼 추가안은 2026-07-27 결정 14로 폐기).

---

## 6. Admin 변경

### 6.1 CONFIGS 신규

**universityAcceptances** (신규 항목, 사이드 메뉴 등록):

| 필드 | 타입 | 비고 |
|---|---|---|
| is_active | radioBoolean | required |
| name | text | required |
| emblem_url | image | required, hideUrlInput |
| subtitle | text | 표시 문구(예: 7명 합격, 의예과) — 결정 15. 일반계열은 인원, 의약학·특수계열은 학과명 |
| count | number | required 완화 (결정 15 — subtitle 우선, 비우면 count 기반 'N명 합격' 폴백) |
| track | select | options: general('일반계열') / medical_special('의약학 · 특수계열') (**정정**: 최종 시안 탭 라벨은 "가장 많이 합격한 대학"이 아닌 "일반계열") |
| sort_order | number | |

guideText(안): "메인 화면 '합격생' 영역 카드입니다. 엠블럼 권장: 240px × 240px 정사각 PNG(투명 배경) / 카드에는 120px로 표시됩니다."

### 6.2 CONFIGS 수정

| config | 위치 | 변경 |
|---|---|---|
| programCategories | `Admin.jsx:873-908` | fields에 `{ key: 'icon_image_url', label: '카드 일러스트 이미지', type: 'image' }` 추가 (기존 icon select는 폴백용 유지), defaults에 `icon_image_url: ''` |
| mentorStrategies | `Admin.jsx:202-231` | **필드 추가 없음** (2026-07-27 결정 14 — mentor_name/badge_text/affiliation 추가안 폐기, 통이미지 전환). guideText만 교체 (6.3절). dead defaults(title/description/link_url/open_new_window) 정리 검토 |

### 6.3 guideText 수정 3곳 (검증된 현행 문자열 기준)

| # | 위치 | 현행 (검증됨) | 변경안 |
|---|---|---|---|
| 1 | `Admin.jsx:131` (banners) | "메인 배너 이미지: 2172px × 724px / 비율: 3:1 / 형식: JPG 또는 PNG / 권장 용량: 1~2MB 이하 / 중요한 글자나 얼굴은 중앙보다 살짝 오른쪽에 배치" | 좌측 고정 배너 1장 운영 안내로 교체: "메인 좌측 대형 배너는 1장만 노출됩니다(활성 항목 중 정렬 최상위). 헤드라인·CTA 텍스트를 포함한 **완성 통이미지**를 업로드하세요(디자이너 제작본). 권장: 1938px × 858px(969×429 @2x) / 형식: PNG" — 최종 치수는 에셋 확정 후 조정 (2026-07-27 결정 14 통이미지 반영) |
| 2 | `Admin.jsx:167` (home_side_banners) | " PC 권장 이미지: 900px × 420px / 모바일 권장 이미지: 900px × 500px / 형식: JPG 또는 PNG / 권장 용량: 1MB 이하" (문자열 맨 앞 공백 1개 — 완전 일치 수정 시 주의) | 신규 세로 카드 비율 반영: "PC 권장: 642px × 858px(321×429 @2x) / 형식: PNG" — 자동 전환·인디케이터 안내 문구 추가 (2026-07-26 최종본 321×429 반영) |
| 3 | `Admin.jsx:208` (home_mentor_strategies) | "메인 화면의 '위닝 멘토와 완성하는 성공전략' 영역에 반원형으로 배치되는 이미지입니다. 이미지 1장만 등록하면 됩니다. 권장 이미지: 1400px × 500px / 비율: 약 2.8:1 / 형식: JPG 또는 PNG" | 전면 교체: "메인 '멘토' 영역 카드에 표시되는 통이미지입니다. 배지(기수·구분)·이름·소속(대학·학과) 텍스트가 포함된 **완성 이미지**를 멘토별 1건씩 업로드하세요(디자이너 제작본). 권장: 420px × 720px(210×360 @2x) 세로형 PNG" (2026-07-27 결정 14 — 텍스트 입력 필드 없음) |

참고: 현행 :208 안내문("1장만 등록")은 실제 다중 회전 갤러리 동작과 이미 불일치 상태였음 — 이번 교체로 해소.

---

## 7. 에셋 목록

모든 Figma MCP 에셋 URL은 **7일 후 만료** → `mcp__plugin_figma_figma__download_assets`로 일괄 다운로드 후 리포에 커밋(`src/assets/landing/` 권장) 또는 Supabase Storage 업로드(관리형 데이터인 엠블럼·멘토 사진·서비스 일러스트는 Storage, 정적 학교 로고·히어로 장식은 리포).

| 섹션 | 에셋 | 수량 | 보관 | 비고 |
|---|---|---|---|---|
| 히어로 | 좌측 일러스트 "ChatGPT Image 2026-7-15" (퍼즐+계단+대학) | 1 | Storage(banners) | **임시 소스** — 최종은 헤드라인·CTA 텍스트 포함 통이미지를 디자이너가 제작해 관리자 업로드 (결정 14). 695×447 표시, cover 크롭 |
| 히어로 | 우측 캐릭터 "파랑이 4" / 텍스트 이미지 "3232 4" / NEW 배지 "Group 1597882293" | 3 | Storage(side_banners) 또는 리포 | 오버스캔 크롭 큼 — 재크롭 필요, 텍스트 이미지 3.62deg 회전 |
| 합격생 | 대학 엠블럼 image 312~321 (중앙·한양·고려·외대·부산·유니스트·성균관·건국·연세·서강) | 10 | Storage | 120×120 표시, 건국대 재크롭 |
| 합격생 | 탭 구분선 Line 2366 | 0 | — | CSS 1px border로 대체, export 불필요 |
| 서비스 | 무료진단 일러스트 / 자기평가 배지 / 스프라이트 1장(→ 목표관리·콜멘토·수행평가·심화탐구 4개로 분리 export) / 그림자 PNG | 7 | Storage(icon_image_url) + 그림자는 리포 | 스프라이트는 반드시 개별 분리 |
| 멘토 | 인물 사진 22장 (강지후~한혜원, 3.4절 assets 목록) | 22 | Storage | **임시(텍스트 없음)** — 최종은 배지·이름·소속 텍스트 포함 통이미지(420×720 @2x)를 디자이너가 제작해 관리자 업로드 (결정 14) |
| 학교리스트 | 대학 로고 14종 (행1 7 + 행2 7, 그레이스케일/단색) | 14 | 리포 (정적) | 고정 w/h 유지 |
| 공지사항 | chevron 아이콘 | 0 | — | lucide ChevronRight로 대체 |

합계 export 대상: 약 57개 (학교리스트 15→14 조정 반영).

---

## 8. 반응형 방침

1920 시안만 존재 — 모바일/태블릿은 기존 Home.jsx 패턴 준수 (`infra` 검증 결과):

- **mobile-first + `sm:`/`lg:` 2단**이 지배적, `md:` 0회, `xl:`은 grid 미세 조정 2회뿐 — 신규 섹션도 동일하게 `md:` 생략.
- 예시 패턴: `px-5 sm:px-8`, `text-[34px] sm:text-[48px] lg:text-[58px]`, 모바일 `snap-x overflow-x-auto ... lg:hidden` + 데스크톱 `hidden lg:block` (`Home.jsx:942,967,458,477`).
- 섹션 컨테이너 관례: `<section>` border-b + bg, 내부 `mx-auto grid max-w-[1500px] gap-5 px-5 sm:px-8` (`Home.jsx:940-942`).
- 색상은 tailwind.config 확장 없이(`extend: {}` — `tailwind.config.js:8`) arbitrary value 인라인 — 신규 색(#af9364, #525252 등)도 동일 방식. `src/index.css` 기존 토큰(--winning-navy 등)과의 통합은 이번 범위에서 강제하지 않음.
- CSS 단위: px 수치는 rem 환산(÷16) 원칙 (예: 44px → 2.75rem), vw/vh/%는 유지.
- 캐러셀 섹션(합격생/멘토)은 전 브레이크포인트에서 동일 마퀴 + 스와이프 (모바일 별도 레이아웃 불필요 — 카드 크기만 축소).
- body min-width 320px (`src/index.css`) 하한 준수.

---

## 9. 삭제 / 정리 항목

| # | 항목 | 위치 | 조치 |
|---|---|---|---|
| 1 | 좌측 메인 배너 화살표 + 자동전환 타이머 + dot | `Home.jsx:992-1021`, `:810-815`, 관련 reset 함수 | 삭제 (고정 1장) |
| 2 | 우측 사이드 배너 화살표 | `Home.jsx:1078-1093` | 삭제 (인디케이터·자동전환은 신규 스펙으로 대체) |
| 3 | AcceptanceCarousel 화살표 | `Home.jsx:334-343`, `:357-366` | 삭제 (훅 추출 시 제외) |
| 4 | MentorArchGallery 화살표 + 아치 갤러리 전체 | `Home.jsx:390-524` | 컴포넌트 교체 |
| 5 | `src/components/ServiceCards.jsx` | 전체 | 파일 삭제 (import 0건 dead — 내부의 program_categories select/realtime 참조도 함께 제거됨) |
| 6 | `admission_posts` 기반 acceptanceCards fetch/매핑 | `Home.jsx:695-702`, `:744-759`, `:1139` | 랜딩에서 제거 (테이블·AdmissionBoard·Admin은 유지) |
| 7 | NewsPreviewCard 사이드바 배치 | `Home.jsx:1202-1232` | 풀폭 섹션으로 이동 (컴포넌트는 리스타일) |
| 8 | mentorStrategies dead defaults (title/description/link_url/open_new_window) | `Admin.jsx:221-230` | 정리 검토 (컬럼 drop은 보수적으로 보류) |
| 9 | `admission_posts.show_on_home` 잔존 기능 | `Admin.jsx` admission configs | 랜딩 미사용화 — Admin 안내문 갱신 또는 필드 숨김 (미결, 11절) |
| 10 | 미커밋 dev 우회 코드 | `src/components/ProtectedAdmin.jsx:14-17` (`import.meta.env.DEV && VITE_ADMIN_BYPASS==='true'`) | 리뉴얼 커밋에 섞이지 않도록 분리 관리 (커밋 여부 발주자 확인) |

---

## 10. 공수 및 작업 순서

### 10.1 공수 (확정, 1인 기준 약 5~5.5일)

| 작업 | 공수(일) |
|---|---|
| 히어로 | 0.5 |
| 합격생 (테이블+Admin+탭+캐러셀) | 0.75 |
| 서비스 (필드 추가+데이터 교체+카드) | 0.75 |
| 멘토 (컬럼+폼+스트립) | 0.75 |
| 학교리스트 | 0.5 |
| 공지사항 리스타일 | 0.5 |
| 에셋 export·업로드 | 0.5 |
| 반응형·QA | 1 |
| **합계** | **5.25 ± 0.25** |

### 10.2 작업 순서 (의존성: DB → Admin → 섹션 병렬 → QA)

1. **에셋 일괄 다운로드** (Figma URL 7일 만료 — 최우선)
2. **DB 마이그레이션** (5절 1~3) + 시드
3. **Admin 변경** (6절: 신규 config, 필드 추가, guideText 3곳)
4. **공용 훅** `useInfiniteMarquee` 구현
5. **섹션 구현 — 병렬 가능**: 히어로 / 합격생(훅 의존) / 서비스 / 멘토(훅 의존) / 학교리스트 / 공지사항
6. **데이터 입력** (멘토 22건, 서비스 6건, 대학 10건, 배너 이미지)
7. **반응형 + QA** (reduced-motion, 터치 pause, 탭 필터, 데이터 0건/1건 엣지)

---

## 11. 리스크 및 미결 사항

### 리스크

| # | 리스크 | 완화 |
|---|---|---|
| 1 | Figma 에셋 URL 7일 만료 | 착수 즉시 일괄 다운로드 (10.2-1) |
| 2 | 멘토 사진 22장 크롭 불균일 (top 61~96px, 음수 left 등 제각각) | 일괄 재크롭 또는 카드별 object-position 보정 — 공수 0.5일 내 흡수 전제 |
| 3 | 스프라이트 아이콘 분리 export 품질 | 원본 스프라이트에서 여백 포함 크롭, 실패 시 디자이너에 개별 export 요청 |
| 4 | main 직접 push 시 CI/배포 트리거 | 규모상 worktree → 브랜치 → PR → 검증 파이프라인 필수 (Simple Fix 대상 아님) |
| 5 | banners "고정 1장" 운영 규칙이 스키마로 강제되지 않음 | guideText 안내 + 코드에서 최상위 1건만 렌더로 방어 |
| 6 | `Home.jsx` 1241줄 단일 파일에 대규모 변경 집중 | 섹션별 컴포넌트 분리 추출을 병행해 충돌·리뷰 부담 축소 |
| 7 | 테스트/린트 스크립트 부재 (package.json: dev/build/preview뿐) | QA는 수동 + Playwright MCP 스크린샷 대조 |

### 미결 사항 (발주자 확인 필요)

| # | 항목 |
|---|---|
| 1 | "의약학 · 특수계열" 탭 데이터 — 시안에 없음, 목록 제공 필요 |
| 2 | 카피 확정: "응용계학과", "김성훈멘토" 붙어쓰기, "카네기 맬런"(→멜런?) — 통이미지 제작 시 포함될 텍스트 소스이므로 이미지 제작 전 확정 필요 (기존 "위닝에듀을" 항목은 헤드라인 카피 교체로 해소·제거) |
| 3 | 히어로 우측 pill 인디케이터 시각 스타일 디자이너 확인 필요 (결정사항 3번의 pill이 최종 시안에 그려져 있지 않음 — 결정 자체는 유지) |
| 4 | 공지 리스트 행 수: 현행 limit 5 vs 최종 시안 각 3행 |
| 5 | 공지 뱃지 라벨 규칙: is_pinned 외 "보도자료" 분류 필드 필요 여부 |
| 6 | `admission_posts.show_on_home` Admin 필드 처리 방식 (숨김 vs 안내문 갱신) |
| 7 | `ProtectedAdmin.jsx` dev 우회 코드 커밋 여부 |
| 8 | **[데이터 준비]** 멘토·히어로 최종 통이미지 제작(디자이너) — 텍스트 포함 완성본 제작 후 관리자 업로드 (멘토 22장 420×720 @2x, 히어로 좌측 1장 1938×858 @2x) |

(제거됨: 기존 #7 "학교리스트 로고 최종 개수" — 2026-07-26 최종본 확인으로 14개 확정, 3.5절 반영 / 기존 #3 "히어로 좌측 텍스트 오버레이 방식"·기존 #8 "멘토 badge_text 필드 구조" — 2026-07-27 통이미지 전환(결정 14)으로 해소)

---

## 부록 A — 정정 반영 내역

1. **[hero]** 화살표 렌더링 위치: 좌/우 양쪽 모두 구현되어 있고 항목 2개 이상일 때만 렌더 — 스크린샷의 "우측만 ‹›"는 당시 데이터 개수(banners 1개 / side_banners 2개 이상) 때문 (3.1절 반영).
2. **[services]** `program_categories` 사용처: 살아있는 사용처는 Home.jsx·Admin.jsx 둘뿐이나, 죽은 ServiceCards.jsx도 코드상 동일 테이블을 select + realtime 구독 — "두 파일뿐" 서술은 부정확 (3.3절·9절 반영).
3. **[services]** 현재 랜딩 카드 6개 항목명: DB 의존이라 코드만으로 확정 불가 — 코드에서 확인되는 것은 ServiceCards.jsx fallback 6종 / 최대 7개 표시 / Header.jsx nav fallback뿐. 6항목 교체는 DB 데이터 작업으로 정의 (3.3절·5.2절 반영).
