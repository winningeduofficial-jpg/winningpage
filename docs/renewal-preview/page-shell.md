# 무료진단 설문 페이지 셸 (page-shell)

Figma: `hsokTD6OilcNEXyCR24sn4` / node `1889:13222` ("설문조사 선택한 상태"), 보조 `1889:8753` ("설문조사 ver2")

조립 에이전트가 페이지(예: FreeDiagnosis 리뉴얼)를 구성할 때 참고할 타이틀 블록 + 페이지 컨테이너 마크업/클래스 기록.

## 페이지 배경

- `body`/`main` 배경색: `#FBFAFA` (Figma 루트 프레임 `bg-[#fbfafa]`)
- 헤더/푸터는 신규 구현하지 말고 기존 `Header`, `SiteFooter` 컴포넌트를 import해서 사용.

## 컨테이너

- 콘텐츠 컨테이너 폭: `1112px` (`69.5rem`), 세로 패딩 `120px`(`7.5rem`) 위아래.
- 컨테이너는 페이지 중앙 정렬 (`mx-auto`).

```jsx
<main className="min-h-screen w-full bg-[#FBFAFA]">
  <Header />

  <section className="w-full px-2.5 py-16 sm:py-20 lg:py-[7.5rem]">
    <div className="mx-auto flex w-full max-w-[69.5rem] flex-col items-start gap-[3.75rem]">
      {/* 페이지 타이틀 블록 */}
      {/* 문항 카드(QuestionCard) 목록 */}
      {/* SurveyProgress */}
    </div>
  </section>

  <SiteFooter />
</main>
```

## 페이지 타이틀 블록

Figma 원문 (node `1889:13261`~`1889:13262`):

- 제목(2줄, `font-bold`, `text-[2.75rem]`(44px), `tracking-[-0.02em]`(-0.88px/44px), `leading-[1.4]`, 색상 `#525252`):
  - "무료 진단으로"
  - "나에게 딱 맞는 서비스를 추천받아요"
- 서브카피(`font-normal`, `text-2xl`(24px), `leading-[1.3]`, 색상 `#525252`):
  - "19개 문항을 답하면 가장 먼저 필요한 서비스를 추천해 드려요"
- 타이틀 블록 폭: 원본 `596px` (`37.25rem`) — 데스크톱 기준 최대폭으로만 참고, 모바일에서는 `w-full`로 풀어서 사용.

```jsx
<div className="flex w-full max-w-[37.25rem] flex-col items-start gap-5 text-[#525252]">
  <h1 className="break-keep text-[1.75rem] font-bold leading-[1.4] tracking-[-0.02em] sm:text-[2.25rem] lg:text-[2.75rem]">
    무료 진단으로
    <br />
    나에게 딱 맞는 서비스를 추천받아요
  </h1>
  <p className="break-keep text-lg font-normal leading-[1.3] sm:text-2xl">
    19개 문항을 답하면 가장 먼저 필요한 서비스를 추천해 드려요
  </p>
</div>
```

## 문항 목록 + 진행 바 조립 예시

```jsx
<div className="flex w-full flex-col items-start gap-10">
  <QuestionCard number={1} category="기본정보" title="현재 학년을 선택해 주세요" helper="하나만 선택해 주세요.">
    <OptionGroup
      variant="chip"
      options={["중학교 3학년", "고등학교 1학년", "고등학교 2학년", "고등학교 3학년", "N수생"]}
      value={grade}
      onChange={setGrade}
    />
  </QuestionCard>

  {/* ... Q2, Q3, 조건부 ConditionalTextInput 등 ... */}

  <SurveyProgress remaining={16} disabled={!canSubmit} />
</div>
```

## 참고 사항

- 두 노드 모두 헤더/푸터 레이아웃은 동일 (기존 `Header`/`SiteFooter`로 대체).
- `1889:13222`은 일부 옵션이 선택된 "활성" 상태(진행 바 `#013262` 활성색)를, `1889:8753`은 전부 미선택인 "초기" 상태(진행 바 `#d7d7d7` 비활성색)를 보여줌 — SurveyProgress의 `disabled` prop이 이 두 상태를 표현.
- 문항 3(목표설정) 카드 안에는 라디오 리스트 외에도 조건부 텍스트 입력 2개와, 라벨이 중복 표기된 라디오 리스트(선택 이유)가 이어져 있음. 상세는 `questions-1889-13222.json` / `questions-1889-8753.json` 참고.
