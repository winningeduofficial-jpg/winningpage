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
import { FAQ_SECTION, MENTOR_FAQ } from '../../data/mentorApply';
import ServiceSection from '../services/ServiceSection';
import ServiceFaq from '../services/ServiceFaq';
import { MENTOR_HEADING_LG } from '../services/serviceTokens';

// 2026-08-10: mentorApply.js MENTOR_FAQ 의 `a` 5개는 임시 문구로 채워졌다(시안에 답변 본문이
//    없어 사용자 결정으로 채운 것 — 위 데이터 파일 주석 참고). 그래서 아래 placeholder 분기는
//    평상시에는 타지 않는다. 그럼에도 분기 자체는 지우지 않는다 — 추후 어드민에서 답변을 편집
//    가능하게 만들면 저장 값이 다시 빈 문자열이 되는 경우가 생길 수 있고, 그 방어로서 여전히
//    유효하다(§7 FAQ 섹션이 5개 전부 빈 상태라고 통째로 숨는 사고를 막는 것이 이 분기의 목적 —
//    리뷰 WARN #4 재발 방지).
//
//    그래서 헤더 + 질문 5개는 답변 유무와 무관하게 **항상** 렌더한다. 답변이 빈 문항은 펼쳐도
//    빈 패널이 되지 않도록 "준비 중" 임을 알리는 최소 표시로 채운다 — 아래 두 상수가 그 문구다.
//    실제 FAQ 답변 카피를 창작하는 것이 아니라 상태 안내이므로 카피 창작 금지 규칙 대상이 아니다.
//
//    펼침 자체를 비활성화(disabled)하는 대안도 검토했지만, 아코디언 본체는 재사용 컴포넌트인
//    `ServiceFaq`(서비스 4종과 공유, 수정 금지 — 파일 상단 주석)라서 항목별 펼침 비활성화를
//    받는 prop 자체가 없다. ServiceFaq 를 고치면 재사용 매핑 A "수정 0" 원칙이 깨지고 서비스
//    4종이 동시에 회귀하므로, 이 파일(소비처)에서 답변 텍스트만 바꿔치기하는 쪽을 택했다.
//
//    답변이 다시 비게 되면(어드민 편집 등) 이 파일은 손대지 않아도 정상 동작으로 자동 복귀한다
//    (hasAnswer 가 true 인 문항은 그대로 통과).
//      · 개발(DEV): 파일 경로까지 알려주는 상세 TODO 문구.
//      · 프로덕션: 사용자에게 노출 가능한 짧은 안내 문구.
const DEV_ANSWER_PLACEHOLDER =
  'TODO(mentor-apply): 답변 카피 미확보 — src/data/mentorApply.js 의 MENTOR_FAQ 를 채울 것';
const PROD_ANSWER_PLACEHOLDER = '답변을 준비 중입니다.';

function hasAnswer(item) {
  return typeof item.a === 'string' && item.a.trim() !== '';
}

export default function MentorFaq() {
  const placeholder = import.meta.env.DEV ? DEV_ANSWER_PLACEHOLDER : PROD_ANSWER_PLACEHOLDER;
  const items = MENTOR_FAQ.map((item) => (hasAnswer(item) ? item : { ...item, a: placeholder }));

  // MENTOR_FAQ 자체가 빈 배열인 방어적 케이스만 여기서 숨긴다 — 답변이 비어 있다는 이유로
  // 숨기지 않는다(위 주석의 사고 재발 방지).
  if (items.length === 0) return null;

  return (
    // 폼 → FAQ 간격 88(5.5rem)은 앞 섹션이 아니라 이 섹션의 pt 가 흡수한다(ServiceSection 규약:
    // "경계 갭은 뒤 섹션 pt 로 계산한다"). 하단은 푸터 직전 경계라 서비스 4종과 같은 리듬으로 둔다.
    <ServiceSection className="pb-20 sm:pb-24 lg:pb-[7.5rem] lg:pt-[5.5rem]">
      {/* 헤더 ↔ 리스트 gap 72(4.5rem). ServiceFaq 가 자체적으로 lg:mt-[2.875rem](46)을 갖고 있어
          여기서는 부족분 26(1.625rem)만 flex gap 으로 더한다 — margin 으로 더하면 인접 마진이
          상쇄(collapse)돼 46 그대로 남는다. flex 컨테이너 안에서는 상쇄가 일어나지 않는다. */}
      <div className="flex flex-col lg:gap-[1.625rem]">
        {/* 시안 헤더는 925폭 중앙정렬. 아이라인 ↔ 타이틀 gap 8(0.5rem). */}
        <div className="mx-auto flex w-full max-w-[57.8125rem] flex-col gap-2 text-center">
          <p className="text-sm font-medium leading-[1.4] text-ink">{FAQ_SECTION.eyebrow}</p>
          {/* 38px Bold — `지원 전 `(ink.title) + `궁금한 점`(accent #0B84FD).
              ServiceSection 의 heading prop 을 쓰지 않으므로(파일 상단 주석) 여기서 h2 를 직접
              그린다 — 페이지 안에서 h2 는 이 하나뿐이라 중복되지 않는다. */}
          <h2 className={MENTOR_HEADING_LG}>
            {FAQ_SECTION.titleLead}
            <span className="text-accent">{FAQ_SECTION.titleAccent}</span>
          </h2>
        </div>

        {/* 시안 행 규격(h 98 / padding 상하 36·좌우 28 / 질문 20px Regular)과 ServiceFaq 의 기존
            규격(py-6 / 질문 18px Medium)은 다르지만, ServiceFaq 를 고치면 서비스 4종이 동시에
            회귀하므로 기존 컴포넌트 규격을 그대로 따른다(명세 § 재사용 매핑 A "수정 0").
            같은 이유로 시안의 3번째 행 배경 #F9FAFB(확인 항목 ㉖, hover 인지 강조인지 미확정)는
            구현하지 않았고, 단일 open(확인 항목 ㉗)은 ServiceFaq 기존 동작 그대로다. */}
        <ServiceFaq items={items} />
      </div>
    </ServiceSection>
  );
}
