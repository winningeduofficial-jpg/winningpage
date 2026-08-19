// 멘토신청(/mentor-apply) §7 FAQ — docs/mentor-apply-spec.md §7.
//
// 아코디언 본체는 만들지 않는다 — `services/ServiceFaq.jsx` 를 그대로 재사용한다(명세
// § 재사용 매핑 A). 단일 open + aria-expanded/aria-controls + hidden 패널까지 이미 완비돼 있어
// 여기서 다시 구현하면 접근성 처리만 두 벌이 된다. 이 파일이 하는 일은 섹션 껍데기(중앙정렬
// 헤더 + 컨테이너)와 **답변 미확보 상태의 안전 처리**뿐이다.
//
// 헤더를 ServiceSection 의 eyebrow/heading prop 으로 넘기지 않은 이유:
//   ServiceSection 의 아이브로는 16px Medium primary 좌측정렬로 고정(§2 기준)인데 §7 FAQ 는
//   14px Medium #525252 **중앙정렬**이라 타이포가 다르다. prop 으로는 덮을 수 없어 헤더만
//   children 안에서 직접 그리고, 섹션 태그·컨테이너는 ServiceSection 을 그대로 쓴다.
import { useEffect, useState } from "react";
import ServiceFaq from "@/components/services/ServiceFaq";
import ServiceSection from "@/components/services/ServiceSection";
import { MENTOR_HEADING_LG } from "@/components/services/serviceTokens";
import { FAQ_SECTION, MENTOR_FAQ } from "@/data/mentorApply";
import { supabase } from "@/lib/supabase";

// 2026-08-11: FAQ 질문·답변과 섹션 헤더 카피가 DB(mentor_apply_faqs / mentor_apply_copy,
//    sql/53_mentor_apply_faq_admin.sql)로 이관되어 어드민에서 편집 가능해졌다. 이 파일이 하던
//    "답변 미확보 상태의 안전 처리"는 여전히 유효하다 — DB 답변이 빈 문자열인 행이 생길 수
//    있어서다. src/data/mentorApply.js 의 MENTOR_FAQ / FAQ_SECTION 은 삭제하지 않고 **폴백
//    정본**으로 남긴다: 조회 실패·0행이면 MENTOR_FAQ 전체 폴백, mentor_apply_copy 는 키 단위
//    폴백(한 키가 없다고 3키 전부 상수로 되돌리지 않는다)이다. 로딩 중에는 이 상수값으로 먼저
//    그리고(빈 화면·깜빡임 방지) DB 응답이 오면 교체한다.
//
//    `[예시] ` 접두어(2026-08-10 사용자 지시)는 위 폴백 상수 원문에 남아 있던 임시 문구
//    표식이며, 시드 시 DB 답변에도 문자 그대로 옮겨졌다 — 확정 문구가 아직 아니라는 뜻이므로
//    운영자가 어드민에서 실제 문구로 교체하며 직접 떼는 것이 전제다.
//
//    답변이 빈 문항은 펼쳐도 빈 패널이 되지 않도록 "준비 중"임을 알리는 최소 표시로 채운다 —
//    아래 두 상수가 그 문구다. 실제 FAQ 답변 카피를 창작하는 것이 아니라 상태 안내이므로 카피
//    창작 금지 규칙 대상이 아니다.
//
//    펼침 자체를 비활성화(disabled)하는 대안도 검토했지만, 아코디언 본체는 재사용 컴포넌트인
//    `ServiceFaq`(서비스 4종과 공유, 수정 금지 — 파일 상단 주석)라서 항목별 펼침 비활성화를
//    받는 prop 자체가 없다. ServiceFaq 를 고치면 재사용 매핑 A "수정 0" 원칙이 깨지고 서비스
//    4종이 동시에 회귀하므로, 이 파일(소비처)에서 답변 텍스트만 바꿔치기하는 쪽을 택했다.
//      · 개발(DEV): 파일 경로까지 알려주는 상세 TODO 문구.
//      · 프로덕션: 사용자에게 노출 가능한 짧은 안내 문구.
const DEV_ANSWER_PLACEHOLDER =
  "TODO(mentor-apply): 답변 카피 미확보 — 어드민(멘토신청 FAQ 관리)에서 채울 것";
const PROD_ANSWER_PLACEHOLDER = "답변을 준비 중입니다.";

function hasAnswer(item: { q: string; a: string }) {
  return typeof item.a === "string" && item.a.trim() !== "";
}

export default function MentorFaq() {
  // 초기값은 폴백 상수 — 로딩 중에도 빈 화면 대신 이 값으로 먼저 그린다.
  const [faqs, setFaqs] = useState(MENTOR_FAQ);
  const [copy, setCopy] = useState(FAQ_SECTION);

  useEffect(() => {
    let alive = true;

    (async () => {
      const [faqResult, copyResult] = await Promise.all([
        supabase
          .from("mentor_apply_faqs")
          .select("question, answer")
          .eq("is_active", true)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: false }),
        supabase.from("mentor_apply_copy").select("copy_key, copy_value"),
      ]);

      if (!alive) return;

      // 조회 실패 또는 0행이면 MENTOR_FAQ 폴백을 그대로 유지한다(교체하지 않는다).
      if (!faqResult.error && faqResult.data && faqResult.data.length > 0) {
        setFaqs(
          faqResult.data.map((row) => ({ q: row.question, a: row.answer })),
        );
      }

      // 키 단위 폴백 — 개별 키가 없거나 조회 자체가 실패하면 그 키만 FAQ_SECTION 값을 쓴다.
      if (!copyResult.error && copyResult.data) {
        const copyMap = new Map(
          copyResult.data.map((row) => [row.copy_key, row.copy_value]),
        );
        setCopy({
          eyebrow: copyMap.has("faq.eyebrow")
            ? copyMap.get("faq.eyebrow")
            : FAQ_SECTION.eyebrow,
          titleLead: copyMap.has("faq.title_lead")
            ? copyMap.get("faq.title_lead")
            : FAQ_SECTION.titleLead,
          titleAccent: copyMap.has("faq.title_accent")
            ? copyMap.get("faq.title_accent")
            : FAQ_SECTION.titleAccent,
        });
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const placeholder = import.meta.env.DEV
    ? DEV_ANSWER_PLACEHOLDER
    : PROD_ANSWER_PLACEHOLDER;

  // 답변 렌더는 평문 + 개행 보존이다 — 어드민이 textarea 에 실개행으로 입력하므로.
  // ServiceFaq(공용 컴포넌트, 수정 금지)는 답변에 className 을 넘길 prop 이 없어
  // 여기서 answer 자체를 whitespace-pre-line span 으로 감싸 item.a 자리에 넘긴다.
  const items = faqs.map((item) => ({
    q: item.q,
    a: hasAnswer(item) ? (
      <span className="whitespace-pre-line">{item.a}</span>
    ) : (
      placeholder
    ),
  }));

  // MENTOR_FAQ(폴백)이든 DB 응답이든 배열 자체가 빈 방어적 케이스만 여기서 숨긴다 —
  // 답변이 비어 있다는 이유로 숨기지 않는다(위 주석의 사고 재발 방지).
  if (items.length === 0) return null;

  return (
    // 폼 → FAQ 간격 88(5.5rem)은 앞 섹션이 아니라 이 섹션의 pt 가 흡수한다(ServiceSection 규약:
    // "경계 갭은 뒤 섹션 pt 로 계산한다"). 하단은 푸터 직전 경계라 서비스 4종과 같은 리듬으로 둔다.
    <ServiceSection className="pb-20 sm:pb-24 lg:pb-30 lg:pt-22">
      {/* 헤더 ↔ 리스트 gap 72(4.5rem). ServiceFaq 가 자체적으로 lg:mt-[2.875rem](46)을 갖고 있어
          여기서는 부족분 26(1.625rem)만 flex gap 으로 더한다 — margin 으로 더하면 인접 마진이
          상쇄(collapse)돼 46 그대로 남는다. flex 컨테이너 안에서는 상쇄가 일어나지 않는다. */}
      <div className="flex flex-col lg:gap-6.5">
        {/* 시안 헤더는 925폭 중앙정렬. 아이라인 ↔ 타이틀 gap 8(0.5rem). */}
        <div className="mx-auto flex w-full max-w-231.25 flex-col gap-2 text-center">
          <p className="text-sm font-medium leading-[1.4] text-ink">
            {copy.eyebrow}
          </p>
          {/* 38px Bold — `지원 전 `(ink.title) + `궁금한 점`(accent #0B84FD).
              ServiceSection 의 heading prop 을 쓰지 않으므로(파일 상단 주석) 여기서 h2 를 직접
              그린다 — 페이지 안에서 h2 는 이 하나뿐이라 중복되지 않는다. */}
          <h2 className={MENTOR_HEADING_LG}>
            {copy.titleLead}
            <span className="text-accent">{copy.titleAccent}</span>
          </h2>
        </div>

        {/* 시안 행 규격(h 98 / padding 상하 36·좌우 28 / 질문 20px Regular)과 ServiceFaq 의 기존
            규격(py-6 / 질문 18px Medium)은 다르지만, ServiceFaq 를 고치면 서비스 4종이 동시에
            회귀하므로 기존 컴포넌트 규격을 그대로 따른다(명세 § 재사용 매핑 A "수정 0").
            같은 이유로 시안의 3번째 행 배경 #F9FAFB(확인 항목 ㉖, hover 인지 강조인지 미확정)는
            구현하지 않았고, 단일 open(확인 항목 ㉗)은 ServiceFaq 기존 동작 그대로다.
            ⚠ ServiceFaq(다른 담당 파일, 수정 금지)의 items.a 타입은 string 이지만, 위 주석대로
            여기서는 whitespace-pre-line span(ReactNode)을 그대로 넘긴다 — React 는 문자열이든
            노드든 동일하게 렌더하므로 런타임 동작은 그대로다. TS 전환으로 새로 드러난 타입
            불일치일 뿐 로직 변경이 아니라서, 다른 도메인 컴포넌트를 고치는 대신 여기서만
            캐스팅한다. */}
        <ServiceFaq items={items as unknown as { q: string; a: string }[]} />
      </div>
    </ServiceSection>
  );
}
