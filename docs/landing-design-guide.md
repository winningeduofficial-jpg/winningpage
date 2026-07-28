# 랜딩 디자인 시스템 가이드 (초안)

> **검토용 초안 — 값 확정 전 코드 미적용.** 본 문서는 컨텐츠 폭 1500→**1200px(75rem)** 축소에 따른 개별 치수 조사(전수조사표, `wf_8e6c0337-2c7`)를 바탕으로, "0.8 일괄 곱"이 아니라 **재사용 가능한 타입/스페이싱 램프와 컴포넌트 규격**을 정의한다. 5절 매핑표는 가이드 확정 후 실행(코드 반영) 단계에서 사용한다.

- 조사 기준: `src/components/landing/*.jsx` (`winningpage-landing-renewal`)
- 배경: 컨텐츠 컨테이너 `max-w-[93.75rem]`(1500px) → **1200px(75rem)** 축소로 확정(전역 토큰 `75rem` 전환 중). 비율 1200/1500 = **0.8**. 단, 이 축소는 **`lg` 브레이크포인트(데스크톱, 고정폭 컨테이너)에만 적용**된다. 모바일(base)·태블릿(sm) 값은 뷰포트 비례/플루이드 레이아웃이라 이번 축소와 무관 — 원칙적으로 KEEP.
- 참조 문서: `docs/final2-design-gap-spec.md`(1500px 기준 확정 스펙, 본 가이드의 "현재값" 출처와 교차 검증됨), `docs/landing-renewal-spec.md`
- **개정 이력**: 최초 초안은 1100px(0.733배) 기준이었으나, 컨텐츠 폭이 1200px(0.8배)로 재확정되어 전면 재산정함. 설계 원칙(0절)은 변경 없음 — 비율만 0.733→0.8로 교체.

---

## 0. 설계 원칙

1. **개별 값 곱셈 금지, 스텝 참조.** 모든 폰트 크기·주요 간격은 아래 타입/스페이싱 램프의 이름 있는 스텝을 참조한다. 스텝에 없는 값을 새로 만들 필요가 생기면 램프에 스텝을 추가하는 문제로 다룬다.
2. **가독성 하한 고정.** 본문(문단·설명·뱃지 등 실제로 읽는 텍스트)은 0.875rem(14px) 이하로 내려가지 않는다. 날짜·부제 등 라벨성 보조 텍스트는 0.75rem(12px)까지 허용. 이미 0.75rem 미만인 기존 초소형 뱃지(0.625rem)는 하한 대상이 아니므로 축소하지 않고 그대로 둔다(4절 예외). **이 하한은 축소 비율(0.733→0.8)과 무관하게 고정된 정책값이다.**
3. **반응형 분기는 축소 대상이 아니다.** `lg:` 앞의 base/`sm:` 값은 컨테이너 폭 축소와 무관한 뷰포트 대응값이므로 원칙적으로 KEEP. 축소는 `lg:` 값에만 적용한다.
4. **DB 결합 좌표는 값이 아니라 계수로 대응한다.** 멘토 카드처럼 DB에 저장된 픽셀 좌표(`card_width`, `photo.top/left/width/height`)를 그대로 렌더링에 쓰는 경우, DB 값 자체를 수정하지 않는다. 컴포넌트 코드에 스케일 상수(`1200/1500 = 0.8`)를 선언하고 런타임에 좌표 × 상수로 계산한다(3.2절).
5. **정합 세트는 함께 스케일한다.** 카드 폭/높이/내부 패딩/아이콘 위치처럼 서로 비율로 묶인 값들은 개별 스텝 참조가 아니라 "컴포넌트 규격"(3절) 단위로 관리한다.
6. **마퀴류(무한 스크롤 카드) 노출 장수는 비율 불변.** 카드 폭과 gap을 동일 계수(0.8)로 스케일하면 `컨테이너 폭 ÷ 카드 pitch` 값이 원본과 거의 동일하게 유지된다 — 노출 장수를 보존하려고 개별 조정할 필요 없음(3.1·3.2절 계산 참고).

---

## 1. 타입 스케일 (1200 기준, `lg` 전용)

조사표에 산재한 lg 폰트 크기(2.75 / 2.25 / 1.75 / 1.5 / 1.25 / 1.125 / 1 / 0.9375rem)를 6개 이름 스텝 + 1개 예외로 수렴한다. 비율이 0.733→0.8로 완화되면서 상위 스텝(Display/Subtitle/Label)은 이전 초안보다 값이 커졌고, 가독성 하한에 걸리는 스텝(Body/Caption)은 **정책 고정값이라 변경 없음**.

| 스텝 | rem (px) | line-height | tracking | 용도 | 대응하는 현재 lg 값 |
|---|---|---|---|---|---|
| **Display** | 2.25rem (36px) | 1.3 | -0.045rem | 섹션 메인 타이틀(h2) desktop 전용 | 2.75rem(44px) — AcceptanceSection.jsx:68, MentorSection.jsx:40, ServicesSection.jsx:151 각 `lg:text-[2.75rem]`. **주의**: 태블릿(`sm:text-[2.25rem]`)과 값이 동일해짐 — `lg:` 오버라이드를 제거하고 `sm:` 값을 desktop까지 그대로 쓰는 단순화 방안 검토 가능 |
| Heading-tablet *(KEEP)* | 2.25rem (36px) | 1.3 | 기존 유지 | 섹션 메인 타이틀 태블릿(`sm:`) — 1200과 무관, 변경 없음 | `sm:text-[2.25rem]` 각 파일 |
| Heading-mobile *(KEEP)* | 1.75rem (28px) | 1.4 | 기존 유지 | 섹션 메인 타이틀 모바일(base) — 변경 없음 | base `text-[1.75rem]` 각 파일 |
| **Subtitle** | 1.25rem (20px) | 1.3–1.4 | -0.025rem | 카드 타이틀 / 탭 텍스트 / 컬럼 소제목 desktop | 1.5rem(24px) — ServicesSection.jsx:57, NewsSection.jsx:61 `text-2xl`, AcceptanceSection.jsx:95 `sm:text-[1.5rem]` |
| **Label** | 1rem (16px) | 1.3 | -0.025rem | 아이브로우 라벨 / 카드 서브 타이틀(대학명 등) desktop | 1.25rem(20px) — MentorSection.jsx:39, ServicesSection.jsx:150 eyebrow, AcceptanceSection.jsx:157 대학명 |
| **Body** | 0.875rem (14px) | 1.4 | -0.02rem | 본문/설명/뱃지 텍스트 — 가독성 하한 | 1rem(16px) — ServicesSection.jsx:61 카드 설명, MentorCard.jsx:46 badge, NewsSection.jsx:112/121/147/151 `text-base`. ×0.8=0.8rem으로 하한 미달 → 클램프 |
| **Caption** | 0.75rem (12px) | 1.3 | 0 | 보조 라벨(날짜·서브카피) | 0.9375rem(15px) — MentorCard.jsx:52 title_lines, NewsSection.jsx:78 빈 상태 문구. **×0.8=0.75rem으로 정확히 일치 — 클램프가 아니라 자연값** |
| Micro *(예외, KEEP)* | 0.625rem (10px) | 1.2 | 0 | 초소형 뱃지 텍스트 — 이미 하한 이하, 추가 축소 금지 | NewsSection.jsx:116,143 뱃지("보도자료"/"중요") |

**판단 근거**
- Display 2.25rem: 2.75×0.8=2.2 → 태블릿과 동일한 기존 클린값 2.25rem으로 스냅(오차 2.3%, 무시 가능). 헤딩-태블릿 스텝과 값이 겹치므로 lg 오버라이드 자체를 제거하는 코드 단순화가 가능하다는 점을 5절 매핑에 표기.
- Subtitle 1.25rem: 1.5×0.8=1.2 → 1.25rem(기존 eyebrow류 원본값과 동일한 클린 스텝)으로 스냅, 1.125rem보다 근접(오차 0.05 vs 0.075).
- Label 1rem: 1.25×0.8=1.0 정확히 클린값. 우연히 기존 Body 스텝의 "원본" 값(1rem)과 숫자가 겹치지만 서로 다른 용도(라벨 vs 본문)이므로 혼동 주의.
- Body/Caption은 가독성 하한 정책값이라 축소 비율과 무관하게 **0.875rem / 0.75rem 그대로 유지** — 유일하게 Caption은 이번 비율(0.8)에서 우연히 클램프 없이도 자연 도달.
- Tracking은 0.0625rem 그리드에 따르지 않는다(폰트 크기 비례, 반올림 시 미세 자간이 소멸). 표기값은 참고치이며 실제 반영 시 시각 검수로 확정한다.

---

## 2. 스페이싱 스케일

섹션 상하 패딩·타이틀-본문 간격·카드 갭에 쓰이는 Tailwind 유틸리티(`gap-*`, `mt-*`, `pt-*`/`pb-*`)를 대상으로 한다. 컴포넌트 자체의 픽셀 정밀 규격(카드 폭/높이, 아이콘 크기, radius 등)은 3절 "컴포넌트 규격"에서 다룬다.

비율이 0.8로 완화되면서 다수 값이 **표준 Tailwind 키에 정확히 스냅**된다(예: `gap-5`(20px)→정확히 16px=`gap-4`, `gap-10`(40px)→정확히 32px=`gap-8`, `pb-20`(80px)→정확히 64px=`gap-16`, `pt-[7.5rem]`(120px)→정확히 96px=`gap-24`). 0.733 대비 그리드 정합성이 뚜렷이 개선됨 — 스페이싱 스케일을 "Tailwind 기본 스텝에 정렬"하라는 지침에 이 비율이 더 잘 부합한다.

| 스텝 | Tailwind 유틸 | rem (px) | 용도 | 대응하는 현재 값(원 스텝) |
|---|---|---|---|---|
| gap-2xs | `gap-1.5` | 0.375rem (6px) | 뱃지/컬럼 헤더 내부 초미세 gap | `gap-2`(8px) — NewsSection.jsx:110,111 |
| gap-xs | `gap-3` | 0.75rem (12px) | 인라인 요소 gap, 뱃지 패딩 | `gap-4`(16px, 모바일) — NewsSection.jsx:141 |
| gap-sm | `gap-4` | 1rem (16px) | 카드 내부 요소 gap, 컴팩트 그리드 | `gap-5`(20px) — AcceptanceSection.jsx:125, MentorSection.jsx:50 카드 간격. **20×0.8=16, 정확히 클린값** |
| gap-md | `gap-5` | 1.25rem (20px) | 타이틀 근접 gap, 카드 내부 gap(대) | `gap-6`(24px) — AcceptanceSection.jsx:139 카드 내부 `gap-6` |
| gap-lg | `gap-6` | 1.5rem (24px) | 타이틀→본문 gap, 카드 radius(대) 대응값 | `mt-8`/`gap-8`(32px) — AcceptanceSection.jsx:76 `mt-8` |
| section-pad | `gap-8`/`py-8` | 2rem (32px) | 섹션 상하 패딩 desktop 기본값 | `mt-10`/`pt-10`/`pb-10`(40px) — AcceptanceSection.jsx:65,116, ServicesSection.jsx:148,160, MentorSection.jsx:34. **40×0.8=32, 정확히 클린값** |
| section-pad-lg | `py-16` | 4rem (64px) | 대형 구획 패딩(멘토 섹션 하단 등) | MentorSection.jsx:34 `pb-20`(80px). **80×0.8=64, 정확히 클린값** |
| section-pad-xl | `py-24` | 6rem (96px) | 초대형 패딩(뉴스 섹션 상단 등) | NewsSection.jsx:164 `pt-[7.5rem]`(120px). **120×0.8=96, 정확히 클린값** |
| space-micro *(KEEP)* | `gap-1` | 0.25rem (4px) | 컬럼 헤더 등 초미세 gap, 축소 실익 낮음 | NewsSection.jsx:60 `gap-1` — 그대로 유지 |

**모바일/태블릿 패딩**(`px-5`, `sm:px-8`, base `gap-10` 등)은 1200 축소와 무관한 뷰포트 대응값이므로 KEEP — 0절 원칙 3.

**미확정 항목**: NewsSection.jsx:164 `pb-24`(96px, 원본 자체가 이미 96px)×0.8=76.8px → 기존 named 스텝 중 section-pad-lg(64px, 오차 -12.8px)와 section-pad-xl(96px, 오차 +19.2px) 사이에 낀다. 별도 스텝(5rem/80px) 신설 여부는 디자이너 확정 필요(5절 표기).

---

## 3. 컴포넌트 규격

### 3.1 합격생 카드 (AcceptanceSection · UniversityCard)

| 항목 | 현재 | 제안 | 근거 |
|---|---|---|---|
| 카드 폭 | 12.5rem (200px) | 10rem (160px) | 200×0.8=160px, 정확히 클린값 |
| 카드 높이 | 18.75rem (300px) | 15rem (240px) | 300×0.8=240px, 정확히 클린값 |
| 엠블럼 | 7.5rem (120px), img 속성도 120 | 6rem (96px), img 속성 96으로 동기화 | 120×0.8=96px, 정확히 클린값 |
| 카드 내부 gap | 1.5rem (24px) | 1.25rem (20px, gap-md) | 24×0.8=19.2→gap-md 스텝(20px)로 스냅 |
| radius | 2rem (32px) | 1.5rem (24px, gap-lg 재사용) | 32×0.8=25.6→24px로 스냅(정수감 우선) |
| 상단 패딩(pt) | 3.25rem (52px) | 2.5rem (40px) | 52×0.8=41.6→40px로 스냅. 0.733 기준 초안에서 미확정이었던 항목이 이번 비율에서 명확히 정리됨 |
| 대학명 텍스트 | 1.25rem | Label 스텝(1rem) | 1절 참조 |
| 서브라벨('N명 합격'/학과명) | 1rem | Body 스텝(0.875rem) 클램프 | 1절 참조, ×0.8=0.8rem으로 하한 미달 |

**마퀴 노출 장수**: pitch = 카드폭(160) + gap-md(20) = 180px. 1200px 컨테이너 기준 노출 장수 ≈ 1200/180 ≈ 6.7장 — 원본(1500/220≈6.8장)과 사실상 동일, 별도 조정 불필요.

### 3.2 멘토 카드 (MentorCard) — DB 결합 특수 케이스

`mentor.card_width`(기본 210px, 예외 230px)와 `photo.top/left/width/height`, `photo.crop.*`이 모두 **원본 카드 실측 픽셀 좌표**로 DB에 저장되어 있다. 카드 CSS를 축소하면서 DB 값을 그대로 두면 사진 배치가 어긋난다.

**방식**: DB 값은 수정하지 않는다. 컴포넌트 코드에 스케일 상수를 선언하고, 카드 폭/높이 및 DB 파생 좌표 전체에 동일 계수를 곱한다.

```
// MentorCard.jsx 상단
const MENTOR_CARD_SCALE = 1200 / 1500; // 0.8 (정확한 유리수, 반올림 불필요)
```

| 항목 | 현재(원본 DB 기준) | 제안(계수 적용 후) | 근거 |
|---|---|---|---|
| 카드 폭 (기본) | 210px | 168px (10.5rem) | 210 × 0.8 |
| 카드 폭 (김무경 예외) | 230px | 184px (11.5rem) | 동일 계수 — DB 값 자체는 무수정, 계수만 곱하므로 개별 예외 처리 불필요 |
| 카드 높이 | 22.5rem (360px) | 18rem (288px) | 360 × 0.8, 폭과 반드시 동일 계수 |
| radius | 1.25rem (20px) | 1rem (16px) | 20 × 0.8, 정확히 클린값 |
| 텍스트 블록 폭 | 12.25rem (196px) | 9.75rem (156px) | 196×0.8=156.8→156px로 스냅. 축소된 카드 폭(168px)보다 커지지 않도록 필수 동반 축소 |
| `photo.top/left/width/height` | DB px | `(값 × MENTOR_CARD_SCALE) / 16` rem | 카드 대비 상대 위치이므로 카드와 같은 계수 필수 |
| `photo.crop.*` | DB 문자열(단위 미상) | px 단위 확인 후 동일 계수 적용, % 단위면 AUTO(계수 불필요) | 실데이터 확인 필요(예: 김성훈 row) — 확정 전 보류 |
| badge 텍스트 | 1rem | Body 스텝(0.875rem) 클램프 | |
| title_lines 텍스트 | 0.9375rem | Caption 스텝(0.75rem) | 0.9375×0.8=0.75 정확히 일치 — 클램프가 아니라 자연값(badge 0.875와 위계 명확히 유지) |

**마퀴 노출 장수**: pitch = 카드폭 기본(168) + 카드 gap(MentorSection.jsx:50 `gap-5`→gap-sm 스텝 16px) = 184px. 1200px 컨테이너 기준 ≈ 1200/184 ≈ 6.52장 — 원본(1500/230=6.52장)과 **완전히 동일**(230=원본 pitch, 184=230×0.8이므로 비율 불변이 수학적으로 보장됨).

### 3.3 서비스 카드 (ServicesSection · ServiceCard)

| 항목 | 현재 | 제안 | 근거 |
|---|---|---|---|
| 카드 max-width | 28.0938rem (449.5px) | 22.5rem (360px) | 449.5×0.8=359.6px, 정수 360px로 스냅(매우 클린) |
| 카드 높이 | 13.5625rem (217px) | 10.875rem (174px) | 217×0.8=173.6→174px |
| radius | 1.875rem (30px) | 1.5rem (24px, gap-lg 재사용) | 30×0.8=24px, 정확히 일치 |
| 아이콘 랩 | 9.5×10.625rem (152×170px) | 7.625×8.5rem (122×136px) | 152×0.8=121.6→122, 170×0.8=136(정확), 비율 유지 |
| 제목-설명 gap | 1.25rem | 1rem (16px, gap-sm) | 20×0.8=16, 정확히 클린값 |
| 카드 제목 | 1.5rem | Subtitle 스텝(1.25rem) | |
| 카드 설명 | 1rem | Body 스텝(0.875rem) 클램프 | |

**그리드 컬럼폭**: 1200px 컨테이너에서 `lg:grid-cols-2` 컬럼폭 ≈ (1200 − section-pad(32px)) / 2 = 584px. 카드 max-width 360px는 컬럼폭 대비 여유 비율 0.616 — 원본(449.5/컬럼폭 720≈0.624)과 근사치 유지.

**주의**: max-width·높이·좌우 패딩(`pl-8`/`sm:pl-[3.125rem]`)·아이콘 위치(`right offset`)는 서로 비율로 묶인 세트다. 개별 스텝만 부분 적용하면 카드 내부 비율이 붕괴하므로 3.3 전체를 한 번에 반영한다.

### 3.4 뉴스 행 / 썸네일 (NewsSection)

| 항목 | 현재 | 제안 | 근거 |
|---|---|---|---|
| 회사소식 행 높이 | 5.875rem (94px) | 4.6875rem (75px) | 94×0.8=75.2→75px |
| 썸네일 | 3.4375×6.25rem (55×100px) | 2.75×5rem (44×80px) | 55×0.8=44(정확), 100×0.8=80(정확) — 원본 비율 0.55 완전 보존 |
| radius(썸네일) | `rounded-xl`(0.75rem) | 0.625rem (10px) | 12×0.8=9.6→10px |
| 공지 행 높이 | 3.375rem (54px) | 2.75rem (44px) | 54×0.8=43.2→44px로 스냅(썸네일 높이 44px와 시각적으로 정합) |

> 참고: `docs/final2-design-gap-spec.md`에 따르면 회사소식 행 구조 자체(썸네일 제거, NoticeRow 공용화)가 별도 갭 스펙으로 이미 논의 중이다. 본 표의 수치는 **현재 구현 기준**이며, 구조 변경이 먼저 반영되면 이 표는 재작성이 필요하다.

---

## 4. 불변 항목 (KEEP)

- **보더**: 모든 `border-b`, `w-px`, 헤어라인 1px류는 스케일 대상이 아니다(스케일 시 서브픽셀이 되어 렌더 무의미).
- **모바일/태블릿 반응형 값**: base·`sm:` 폰트·패딩(1.75rem/2.25rem 헤딩, `px-5`/`sm:px-8`, 모바일 `gap-10` 등) — 0절 원칙 3에 따라 전부 KEEP.
- **인터랙션/접근성 상수**: 스와이프·휠 임계값(HeroSection.jsx:7,9-13), 드래그 판정(HeroSection.jsx:120), 포커스 링(`ring-2`/`ring-offset-2`), 터치 타깃 확장(`after:-inset-*`, `after:-top-2.5`) — 시각 치수가 아니라 조작/접근성 값이므로 축소 시 오히려 사용성이 나빠진다.
- **그림자/마이크로 인터랙션 오프셋**: `shadow-[...]`, hover 시 `-translate-y-[0.1875rem]` 류는 이미 최소 단위라 스케일 대상 아님.
- **"수능 D-N" pill**: 조사표에 해당 컴포넌트가 명시적으로 포함되지 않았음 — 별도 실측 필요, 확정 전까지 현행 유지(KEEP) 및 미포함 사실을 5절 매핑표에 별도 표기.
- **radius 정책**: 대형 라운드(카드류)는 3절 컴포넌트 규격에서 세트로 결정하고, 소형 라운드(뱃지 `rounded-lg`/`rounded-md`)는 타입 스케일과 별개로 축소 대상에서 제외하거나 gap-2xs~xs 수준의 미세 조정만 적용한다.
- **aspect-ratio / intrinsic width·height 속성**: `aspect-[969/429]` 등 비율 기반 값과 `width`/`height` HTML 속성(CLS 방지 힌트)은 AUTO — 단, 표시 크기와 크게 벌어지는 경우(MentorCard 폴백 이미지 등) intrinsic 힌트값도 동기화 권장.
- **DB 원본 좌표값**: 멘토 카드 `card_width`, `photo.*` — 값 자체는 KEEP, 계수(0.8)를 곱하는 계산 레이어만 추가(3.2절).
- **골드→네이비 색상 전환, 학교리스트 섹션 삭제 등**: `docs/final2-design-gap-spec.md` 소관 — 본 가이드와 독립적으로 진행.

---

## 5. 적용 매핑표 (실행용 — 가이드 확정 후 반영)

### HeroSection.jsx

| file:line | 현재 값 | 참조 |
|---|---|---|
| :171 `lg:gap-5`, `sm:px-8` | 1.25rem / 2rem | KEEP — basis/gap 오버플로 방지 수식(주석)에 결합, 스케일 시 수식 전부 재산정 필요(1200 기준 재계산 포함) |
| :171 `py-8` | 2rem | section-pad 스텝(2rem — 이번 비율에서는 원값과 동일해져 사실상 변경 없음) |
| :186,213 `rounded-[2rem]` | 2rem | gap-lg 스텝(1.5rem) 후보 — 좌/우 배너 공통값이므로 "히어로 배너 radius" 컴포넌트 규격 항목 별도 추가 검토 |
| :275 `mt-3` | 0.75rem | gap-xs 스텝(0.75rem, 변경 없음) 또는 인디케이터 전용 값 — 3절 미포함, 실측 필요 |
| :275 `gap-[0.625rem]`, :283 `h-3 w-3` | 0.625rem / 0.75rem | gap-2xs~xs 범위 — 인디케이터 컴포넌트 규격으로 별도 관리 권장 |
| :208 `max-w-[20.0625rem]`/`md:max-w-[26rem]` | KEEP | `<lg` 스택 구간 전용, 무관 |

### ServicesSection.jsx — 3.3절 컴포넌트 규격 세트 참조

| file:line | 현재 값 | 참조 |
|---|---|---|
| :32 카드 높이 | 13.5625rem | 3.3 (174px) |
| :32 radius | 1.875rem | 3.3 (24px) |
| :56 제목-설명 gap | 1.25rem | 3.3 / gap-sm(16px) |
| :56 `sm:pl-[3.125rem]`/`sm:pr-[12.5rem]` | 3.125/12.5rem | 3.3 세트(카드 폭과 동시 적용 필수) |
| :57 카드 제목 | 1.5rem | Subtitle(1.25rem) |
| :61 카드 설명 | 1rem | Body(0.875rem, 클램프) |
| :71,77,89,93,95 아이콘/일러스트 치수 일체 | — | 3.3 세트 |
| :148 `pb-10 pt-10` | 2.5rem | section-pad(2rem) |
| :150 eyebrow | 1.25rem | Label(1rem) |
| :151 h2 lg | 2.75rem | Display(2.25rem) — **주의**: `sm:text-[2.25rem]`과 값이 같아짐(1절 참조) |
| :160 `mt-10`, `gap-10` | 2.5rem | section-pad(2rem, `lg:` 분기만 축소, base 모바일 값은 KEEP) |
| :162 `max-w-[28.0938rem]` | 28.0938rem | 3.3 (360px) |

### AcceptanceSection.jsx — 3.1절 참조

| file:line | 현재 값 | 참조 |
|---|---|---|
| :65 `pb-5 pt-5` | 1.25rem | gap-md(1.25rem, 변경 없음) |
| :68 h2 lg | 2.75rem | Display(2.25rem) |
| :76 `mt-8`, `lg:mt-10`, `gap-6 sm:gap-10` | 2rem/2.5rem/1.5·2.5rem | gap-lg(1.5rem) / section-pad(2rem, lg만) |
| :85 탭 구분선 | 1.875rem | gap-lg~section-pad 사이, 실측 확정 필요 |
| :95 `sm:text-[1.5rem]` 탭 텍스트 | 1.5rem | Subtitle(1.25rem, 기존 base 1.125rem과는 별개 — 위계 재검토 필요) |
| :116 `mt-10`, `lg:mt-[3.75rem]` | 2.5/3.75rem | section-pad(2rem) / section-pad-lg(4rem) 사이, 실측 확정 |
| :125 카드 gap | 1.25rem | gap-md(1.25rem, 변경 없음) |
| :139 카드 폭/높이/gap/radius/pt | — | 3.1 |
| :146-147,149,154 엠블럼 | 120px/7.5rem | 3.1 (96px) |
| :157 대학명 | 1.25rem | Label(1rem) |
| :160 서브라벨 | 1rem | Body(0.875rem, 클램프) |

### MentorSection.jsx / MentorCard.jsx — 3.2절 참조

| file:line | 현재 값 | 참조 |
|---|---|---|
| MentorSection.jsx:34 `pt-10 pb-20` | 2.5/5rem | section-pad(2rem) / section-pad-lg(4rem) |
| MentorSection.jsx:37 `gap-[3.75rem]` | 3.75rem | section-pad-lg(4rem) 근접, 실측 확정 |
| MentorSection.jsx:39 eyebrow | 1.25rem | Label(1rem) |
| MentorSection.jsx:40 h2 lg | 2.75rem | Display(2.25rem) |
| MentorSection.jsx:50 카드 gap | 1.25rem | gap-sm(1rem) — 마퀴 pitch 계산에 사용(3.2 참조) |
| MentorCard.jsx:35,40,45,61-64,77-81 | DB 결합 전체 | 3.2 (MENTOR_CARD_SCALE = 0.8) |
| MentorCard.jsx:46 badge | 1rem | Body(0.875rem, 클램프) |
| MentorCard.jsx:52 title_lines | 0.9375rem | Caption(0.75rem, 자연값) |

### NewsSection.jsx — 3.4절 참조

| file:line | 현재 값 | 참조 |
|---|---|---|
| :61 컬럼 h3 | 1.5rem | Subtitle(1.25rem) |
| :67,69 chevron | 1.5rem/24px | Subtitle 대응 아이콘 크기(20px) |
| :78 빈 상태 문구 | 0.9375rem | Caption(0.75rem, 자연값) |
| :92 회사소식 행 높이 | 5.875rem | 3.4 (75px) |
| :92 `sm:gap-10`,`sm:pl-10` | 2.5rem | section-pad(2rem) |
| :98-99,101,105 썸네일 | — | 3.4 (44×80px) |
| :112,121,147,151 `text-base` | 1rem | Body(0.875rem, 클램프) 또는 Caption(날짜류, 라벨성 하한) — 항목별 상이, 매핑 시 개별 판단 |
| :116,143 뱃지 | 0.625rem | Micro(KEEP, 예외) |
| :139 공지 행 높이 | 3.375rem | 3.4 (44px) |
| :164 `pt-[7.5rem]` | 7.5rem | section-pad-xl(6rem, 정확히 클린값) |
| :164 `pb-24` | 6rem(96px) | **미확정** — ×0.8=76.8px, section-pad-lg(64px)와 section-pad-xl(96px) 사이(2절 참조) |
| :165 `sm:px-8` | 2rem | KEEP(뷰포트 패딩) — 단 다른 섹션과 통일성 검토 시 gap-lg(1.5rem) 후보 |
| :166 h2 `sm:text-[2.75rem]` | 2.75rem | Display(2.25rem) — 타 섹션과 달리 `lg:` 분기 없이 `sm:`에서 바로 최종값 적용되는 구조, 매핑 시 유의 |
| :170 `mt-[6.875rem]`, `gap-[3.75rem]` | 6.875/3.75rem | section-pad-lg(4rem) 근접 / section-pad-lg(4rem) 근접 — 실측 확정 필요 |
| :179 `max-w-[38.75rem]` | 38.75rem(620px) | ×0.8=31rem(496px) SCALE 후보 — **단 1200 그리드 컬럼폭 재계산 결과(≈576px) > 496px이므로 이전 초안의 "AUTO/제거 가능" 판단 재검토 필요**(2컬럼 그리드 gap을 section-pad-lg(4rem/64px)로 볼 경우: (1200−64)/2=568px) |
| :187,208 `md:mt-10 md:h-[5.875rem]` | 2.5/5.875rem | section-pad(2rem) / 3.4(75px) |

### Home.jsx

전 항목 KEEP — 팝업 오버레이(fixed, 뷰포트 기준), Header 고정 높이 결합값(`pt-[4.25rem]`)은 본 축소와 무관.

---

## 요약

- **핵심 결정**: 컨텐츠 폭 1200px(75rem) 확정에 따라 축소 비율을 0.733→**0.8**로 재산정. 개별 값에 0.8을 곱하지 않고, 1200px 데스크톱 전용 타입 스케일 6스텝(Display 2.25rem / Subtitle 1.25rem / Label 1rem / Body 0.875rem / Caption 0.75rem + Micro 0.625rem 예외)과 스페이싱 스케일 8스텝을 신설, 모든 개별 값을 여기 매핑.
- **비율 변경의 부수 효과**: Body/Caption(가독성 하한 정책값)은 비율과 무관해 값 변화 없음. 반면 다수 스페이싱 값이 0.8 비율에서 표준 Tailwind 키에 정확히 스냅되어(gap-5→1rem, gap-10→2rem, pb-20→4rem, pt-30→6rem) 0.733 대비 그리드 정합성이 개선됨.
- **미확정 항목**(디자이너 검토 필요): NewsSection `pb-24`(76.8px, 스텝 사이 낌), 히어로 인디케이터 전용 치수, "수능 D-N" pill 실측, NewsSection 컬럼 max-w 제거 여부 재검토, AcceptanceSection 탭 sm 텍스트(1.5rem)의 Subtitle 스텝 편입 시 위계.
