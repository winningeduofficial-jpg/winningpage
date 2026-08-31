import { supabase } from "./supabase";

// 이용개시 시작 로그 기록 — fn_mark_program_entry(program_key) RPC를 부른다.
//
// 약관 [별표 1]은 기간권 환불 산정의 이용개시 시점을 "서비스 로그인 실행
// 시점"으로 정의하고, 그 입증자료로 시작 로그를 요구한다. program_access_grants
// 는 first_accessed_at이 채워지기 전까지 "아직 시작 안 함"으로 읽혀 환불 산정이
// 항상 전액 환불로 떨어진다 — 이 호출이 그 최초 1회 기록을 만든다.
//
// fire-and-forget인 이유: 진입 가부 판정(=화면을 보여줄지 말지)은 이미
// 게이트/미들웨어가 끝낸 뒤이고, 이 호출은 그 판정에 곁다리로 붙는 후행 기록일
// 뿐이다. 기록이 실패했다고 사용자를 막을 이유가 없으므로 절대 throw하지 않고
// 호출부가 await할 것도 요구하지 않는다(네비게이션을 블로킹하면 안 됨).
//
// RPC(fn_mark_program_entry, baseline:1929) 자체가 멱등 UPDATE(첫 호출만 반영,
// 이후는 무해한 0행 UPDATE)라 여기서 다시 멱등성을 신경 쓸 필요는 없다. 아래
// dedupe는 그저 페이지 로드당 같은 인자로 여러 번 부르는 걸(리렌더·재마운트 등)
// 조용히 줄이기 위한 것이지, 정확성을 위해 필요한 것은 아니다.
const attempted = new Set<string>();

export function markProgramEntry(programKey: string): void {
  void (async () => {
    // getSession()은 로컬 저장소 기반이라 이 fire-and-forget 호출 안에서 한 번 더
    // 불러도 비용이 낮다(routeMiddleware.ts와 동일한 전제).
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;
    if (!userId) return;

    const dedupeKey = `${userId}:${programKey}`;
    if (attempted.has(dedupeKey)) return;
    attempted.add(dedupeKey);

    const { error } = await supabase.rpc("fn_mark_program_entry", {
      p_program_key: programKey,
    });
    if (error) {
      console.warn("[programEntry] fn_mark_program_entry 호출 실패", error);
    }
  })();
}
