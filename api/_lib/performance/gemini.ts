// 이 모듈은 `api/_lib/gemini.ts`로 승격 이전됐다(QA 행295·306, 목표관리 AI 조언이
// 같은 인프라를 공용으로 쓰게 되면서 도메인 중립 경로로 옮겼다). 수행평가 호출부
// (recommend-topics/design-report/evaluate/analyze-guide)를 무수정으로 두기 위한
// re-export shim만 남긴다 — 새 코드는 `../gemini.js`를 직접 import한다.
export * from "../gemini.js";
