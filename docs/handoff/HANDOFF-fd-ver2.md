# HANDOFF — 무료진단 ver2 (fd-ver2)

## 1. 한 줄 요약

위닝에듀 무료진단 ver2 랜딩 — 디자이너가 Figma 시안(`hsokTD6OilcNEXyCR24sn4`, node `2162:1020`, 1920×4830)을 업데이트해 전체 재분석 완료. **구현은 아직 시작 안 함.**

## 2. 작업 환경

- worktree: `/Users/hyunsoo/uwellnow/winningpage-free-diagnosis`, 브랜치 `free-diagnosis-ver2` (HEAD `7f8e595`)
- 구현 파일: `src/pages/renewal/FreeDiagnosisLanding.jsx` — 6개 섹션이 전부 이 한 파일 안에 인라인 정의됨 (HeroSection / StepsSection / AudienceSection / BenefitsSection / MacbookShowcase / BottomCta). `src/components/renewal/` 에는 `survey/` 와 `SurveyPreview.jsx` 만 존재.
- 토큰: `tailwind.config.js` — `maxWidth.content = 72.75rem`(1164px, px-8 포함 시 내부 1100px), `colors.accent = #0B84FD`. 둘 다 이미 반영됨.
- 형제 worktree: `/Users/hyunsoo/uwellnow/winningpage-landing-renewal` (브랜치 `landing-renewal`) = 헤더/푸터/메인랜딩 담당. `/Users/hyunsoo/uwellnow/winningpage` = main.

## 3. 전역 정책 (0729 확정, 협상 끝난 사항 — 재논의 금지)

- 컨텐츠 폭: 전역 `max-w-content` 72.75rem, px-8 포함 내부 1100px. 시안의 1100/1098 폭은 이 토큰으로 해석.
- px→rem 환산: 시안 문자값 ÷16, **소수점 원값 그대로**. 반올림·14px 하한 보정 전부 금지 (사용자가 명시적으로 거부한 안).
- 섹션 수직 리듬: 각 섹션이 자기 **위** 갭을 pt로 소유, pb=0.
- 헤더 64px (소비처 pt-16).
- accent `#0B84FD` 는 Tailwind `text-accent` 토큰 사용 (하드코딩 금지).
- 히어로 배경 Planet(보라 원, node `2181:11088`)은 사용자 지시로 **코드에서 제외**. 시안에 여전히 존재하지만 구현하지 않는다.

## 4. 섹션별 상태 요약

원본 JSON: `docs/handoff/fd-ver2-figma-analysis.json` (7개 섹션 배열, findings 총 101건). 각 섹션당 상세 수치는 해당 `<section>` findings 참조.

**hero** (changed, findings 10건) — 글로우 SVG(`hero-glow.svg`, node `2181:11086`)·그레인 타일(node `2181:11089`) 수치는 시안과 **완전 일치 → 재추출 불필요**. 실제 디자인 변경은 헤드라인 44px/bold → 32px/semibold 1건뿐. 나머지는 이전 구현의 드리프트: 브라우저 목업 폭 1068→1090.2px, 글로우 top이 %기반이라 시안 대비 약 83px 아래로 처짐, 목업 하단 오버플로 -92px→-129px. 상세는 JSON의 `hero` findings 참조.

**steps** (changed, findings 22건) — 타이틀 32px/600/`#181D24`, 카드 4개 각 280×178 고정. STEP 배지는 배경·보더 **없음**(투명, 여백만 담당). 카드행 폭 1180px 이슈는 아래 5번 항목 참조. 상세는 JSON의 `steps` findings 참조.

**recommend** (changed, findings 17건) — 카드별 이미지 배치가 서로 다름: 카드1만 상단 플러시 353×269, 카드2·3은 카드 상단에서 34px 오프셋에 353×235. 현 코드는 3장 모두 `aspect-[3/2]` 동일 처리 중. 이미지 fill hash 3개 모두 교체된 것으로 보여 재추출 필요. 상세는 JSON의 `recommend` findings 참조.

**benefits** (changed, findings 13건) — 구조(롱카드 1개 + 3분할 + 세로 구분선)는 시안과 일치, 간격·타이포만 어긋남. 타이틀 색이 `#4D4D4D`로 라벨(`#525252`)과 다름 — **통일하지 말 것**. 아이콘 3종은 시안이 벡터+BACKGROUND_BLUR 조합이라 SVG 이관 불가 → PNG 3x(300×300) 재추출 권장. 상세는 JSON의 `benefits` findings 참조.

**coordinates** (changed, findings 14건) — 사실상 신규 수준. 맥북 목업이 다크 `#1A202C` 벡터 조립(1008×591, "Macbook Pro" 각인)인데 현 PNG는 실버·노치·라벨 없음. 화면 내부 이미지도 콘텐츠가 완전히 다름(시안=우선순위 표 6행, 코드=레이더차트) → node `2240:4597` 재추출 **필수**. 섹션 배경은 순수 흰색이라 코드의 radial 글로우는 구시안 잔재로 제거 대상. pill 3개 좌표가 max-w-content 밖(x290~1605, 스팬 1315px)이라 컨테이너 기준 재배치 필요, pill 높이도 48→68px. 상세는 JSON의 `coordinates` findings 참조.

**cta** (partial, findings 7건) — 배경 `#172437`·타이포·버튼 스펙 전부 일치. 타이틀만 44px/700 유지(다른 섹션과 달리 축소 안 됨). 버튼 그림자는 시안에서 `visible:false`. 상세는 JSON의 `cta` findings 참조.

**global-layout** (partial, findings 18건) — 수직 리듬 전 구간 불일치, 데스크톱 합계 약 435px 부족. pb=0 정책 미적용. 상세는 JSON의 `global-layout` findings 참조.

## 5. 전역 크로스컷 이슈 3건

### 5.1 헤딩 스케일 하향

본문 섹션 타이틀 5개(4STEP / 추천 / 얻을것 / 입시좌표 / CTA 중 CTA 제외 4개 + 히어로 헤드라인) 전부 32px/SemiBold 600으로 축소됨. 현 코드 `SECTION_HEADING_CLASS`(`FreeDiagnosisLanding.jsx` L57-58)가 `md:text-[2.75rem] font-bold text-[#525252]`라 전 섹션 12px 과대. **최종 CTA 타이틀만 44px/700 유지** (예외). 색은 섹션마다 다름: 4STEP·추천 `#181D24` / 얻을것 `#4D4D4D` / 입시좌표 `#525252`. `SECTION_HEADING_CLASS`는 StepsSection/AudienceSection/BenefitsSection/MacbookShowcase 4곳이 공유하므로 공용 토큰을 일괄 내리거나 섹션별 override로 분리할지 결정 필요.

### 5.2 수직 리듬 정규화 목표값

pb=0 기준 각 섹션 pt (데스크톱):

- 히어로 100px (6.25rem)
- 4STEP 140px (8.75rem)
- 추천 250px (15.625rem)
- 얻을것 240px (15rem)
- 입시좌표 194px (12.125rem)
- CTA 377px (23.5625rem)
- 푸터 앞 142px (8.875rem)

### 5.3 브랜치 의존성

이 브랜치의 `src/components/Header.jsx`는 아직 구시안(`h-[84px]`, `max-w-[1500px]`)이다. 64px 헤더는 `landing-renewal` 브랜치에만 있음. 따라서 전역 리듬 정규화(main을 `pt-16`으로 내리고 히어로 pt를 2.25rem으로 조정)는 **헤더 교체 이후에만 성립**하며, 현 브랜치 단독으로는 `pt-[5.25rem]`(84px)이 오히려 정합이다. 머지 순서에 걸림 — 새 세션은 이걸 먼저 확인할 것.

## 6. 사용자 결정 대기 5건 (구현 착수 전 반드시 grill)

1. **헤딩 색 3종**(`#181D24` / `#4D4D4D` / `#525252`) — 통일 vs 시안 문자값대로 섹션별 유지.
2. **4STEP 카드행 1180px** — max-w-content 내부 1100을 80px 초과. 같은 섹션 타이틀(x404)·추천 섹션(x410)과 좌측이 34px 어긋나 드리프트로 보이나, "280px 카드 4장"이 의도라면 1100 안에선 265px로 축소됨. 추가로 카드 설명문이 시안에선 260px 1줄인데 카드 280 − 좌우 패딩 60 = 가용 220px이라 **시안 자체가 오버플로 상태** — 1줄 유지하려면 패딩 축소 필요. 두 건이 서로 연동됨.
3. **CTA 버튼 그림자** — 시안 DROP_SHADOW가 `visible:false`. 히어로 CTA와 최종 CTA가 완전 동일 스펙(`CTA_LINK_CLASS` 공유)이라 결정은 두 곳 동시 적용.
4. **입시좌표 섹션 하단 236px 여백** — 다른 섹션 120px 리듬에서 크게 이탈, 맥북 아래가 전부 빈 공간이라 삭제된 콘텐츠 잔재 의심. 그대로 구현 시 CTA 앞에 377px 공백.
5. **pill 폰트 굵기** — 📊(상세 진단 요약 카드)만 600, ✏️(나의 강점 정리본)·📋(보완 안내)은 500. 시안 실수 가능성.

## 7. 재추출 필요 에셋

JSON의 `assets` 필드 근거.

**필수:**
- `2240:4597` — 맥북 화면 콘텐츠 (@2x 권장 1536×956)
- `2240:4579` — 맥북 목업 1008×591 (@2x 2016×1182)
- `2162:1134` / `2240:4236` / `2240:4238` — 추천 카드 이미지 3종 (353×269, 353×235, 353×235)
- `2162:1146` / `2162:1155` / `2162:1163` — 얻을것 아이콘 3종 (Lock/Folder/Security, PNG 3x 300×300 권장)

**재추출 불필요 확정** (현행 자산과 수치 완전 일치):
- 히어로 글로우 `2181:11086` (`hero-glow.svg`)
- 히어로 그레인 `2181:11089` (`hero-grain.png`)

## 8. 작업 관행 (새 세션이 알아야 할 것)

- 커밋: 한국어 Conventional Commits `type(scope): message`, scope 필수, **AI/Claude fingerprint 절대 금지**.
- main loop는 Edit/Write 직접 금지 → Sonnet executor 위임 (hook 강제).
- 빌드 명령(`npm run build` 등) 실행 금지. vite 검증이 필요하면 임시 포트 5216 `--strictPort` 사용(5173은 사용자 전용), 사용 후 pkill + 스크린샷 삭제.
- Figma 자산 추출: `use_figma`로 임시 export 프레임(클론 + effects 제거) 만들고 REST `/v1/images` scale=2 로 받은 뒤 삭제. 이미지 fill 원본은 `/v1/files/:key/images` 의 hash→URL 맵 사용.
- Figma LAYER_BLUR radius = CSS blur × 2 (radius 200 → SVG stdDeviation 100).
- vite는 `tailwind.config.js` 변경을 HMR 하지 않음 → 서버 재시작 필요.
