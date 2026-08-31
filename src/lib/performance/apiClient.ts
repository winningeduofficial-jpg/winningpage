// STEP3/4/5 AI 호출 공용 timeout — docs/수행평가-상세-명세.md §8.6.
//
// `recommend-topics`/`design-report`/`evaluate`는 서버 `maxDuration: 60`(analyze-guide.js:658,
// design-report.js:1217, evaluate.js:816, recommend-topics.js:840)이 걸려 있다. 브라우저
// fetch는 별도 timeout이 없어 플랫폼이 함수를 죽인 뒤(504)에도 응답을 기다리거나, 네트워크가
// 끊겨도 무한 대기할 수 있다. 여기서는 서버 예산(60초)보다 넉넉한 클라이언트 timeout을 걸어
// 강제 종료하고, `error.code = 'TIMEOUT'`을 실어 던진다 — 각 호출부의 기존 catch(error)
// 블록이 이 에러도 똑같이 잡아 기존 실패 카드로 흡수한다(신규 UI 불필요).
//
// 실제 timeout·abort 구현은 src/lib/apiFetch.ts(B-1 공용 계층)에 위임한다 — 이 파일은
// 호출부(designReport.ts/evaluation.ts/guideUpload.ts/topics.ts)가 기존에 의존하던
// `fetchWithTimeout(url, options, timeoutMs)` 시그니처와 `error.code === 'TIMEOUT'` 계약만
// 그대로 유지하는 얇은 래퍼다 — 호출부는 수정하지 않는다.

import { ApiFetchTimeoutError, apiFetch } from "../apiFetch";

const DEFAULT_TIMEOUT_MS = 30000;

/** AI 호출처럼 서버 `maxDuration: 60`이 걸린 엔드포인트에 쓰는 넉넉한 timeout. */
export const AI_CALL_TIMEOUT_MS = 70000;

export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  try {
    return await apiFetch(url, options, { timeoutMs });
  } catch (error) {
    if (error instanceof ApiFetchTimeoutError) {
      const timeoutError = new Error(
        "요청이 시간 내에 끝나지 않았어요.",
      ) as Error & {
        code?: string;
      };
      timeoutError.code = "TIMEOUT";
      timeoutError.cause = error;
      throw timeoutError;
    }
    throw error;
  }
}
