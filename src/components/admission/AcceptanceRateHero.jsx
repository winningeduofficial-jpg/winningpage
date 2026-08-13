import { useEffect, useState } from "react";
import cau from "../../assets/admission/universities/cau.png";
import hanyang from "../../assets/admission/universities/hanyang.png";
import hufs from "../../assets/admission/universities/hufs.png";
import kaist from "../../assets/admission/universities/kaist.png";
import konkuk from "../../assets/admission/universities/konkuk.png";
import korea from "../../assets/admission/universities/korea.png";
import pusan from "../../assets/admission/universities/pusan.png";
import skku from "../../assets/admission/universities/skku.png";
import snu from "../../assets/admission/universities/snu.png";
import sogang from "../../assets/admission/universities/sogang.png";
import unist from "../../assets/admission/universities/unist.png";
import yonsei from "../../assets/admission/universities/yonsei.png";
import {
  computeAcceptanceAverage,
  DEFAULT_HERO_SCOPE,
  fetchAcceptanceRates,
  fetchAdmissionCaseLogos,
  HERO_SCOPES,
} from "../../pages/admission/admissionCaseData";
import CountUpNumber from "../CountUpNumber";

// 번들 폴백 로고 — admission_case_logos 테이블이 없거나 비어 있을 때 사용.
// 1440→1164 컨테이너 축소 비율(1164/1440≈0.808) 적용 후 rem 환산.
// 폴백은 widthRem을 함께 갖는다(원본 종횡비 보존 — 현재 화면과 픽셀 동일).
// DB 행은 width 컬럼이 없으므로 widthRem이 undefined → width:auto + object-contain.
const FALLBACK_LOGO_ROWS = [
  [
    {
      key: "snu",
      src: snu,
      name: "서울대학교",
      heightRem: 1.858,
      widthRem: 5.994,
      opacity: 1,
    },
    {
      key: "yonsei",
      src: yonsei,
      name: "연세대학교",
      heightRem: 2.043,
      widthRem: 5.856,
      opacity: 1,
    },
    {
      key: "korea",
      src: korea,
      name: "고려대학교",
      heightRem: 1.67,
      widthRem: 6.186,
      opacity: 1,
    },
    {
      key: "hanyang",
      src: hanyang,
      name: "한양대학교",
      heightRem: 2.044,
      widthRem: 6.596,
      opacity: 1,
    },
    {
      key: "pusan",
      src: pusan,
      name: "부산대학교",
      heightRem: 2.043,
      widthRem: 8.132,
      opacity: 1,
    },
    {
      key: "kaist",
      src: kaist,
      name: "KAIST",
      heightRem: 1.858,
      widthRem: 5.326,
      opacity: 0.7,
    },
    {
      key: "unist",
      src: unist,
      name: "UNIST",
      heightRem: 1.111,
      widthRem: 6.315,
      opacity: 0.7,
    },
  ],
  [
    {
      key: "skku",
      src: skku,
      name: "성균관대학교",
      heightRem: 2.416,
      widthRem: 6.528,
      opacity: 1,
    },
    {
      key: "hufs",
      src: hufs,
      name: "한국외국어대학교",
      heightRem: 1.516,
      widthRem: 7.376,
      opacity: 0.8,
    },
    {
      key: "konkuk",
      src: konkuk,
      name: "건국대학교",
      heightRem: 2.041,
      widthRem: 4.791,
      opacity: 1,
    },
    {
      key: "cau",
      src: cau,
      name: "중앙대학교",
      heightRem: 1.861,
      widthRem: 7.468,
      opacity: 1,
    },
    {
      key: "sogang",
      src: sogang,
      name: "서강대학교",
      heightRem: 1.86,
      widthRem: 5.568,
      opacity: 1,
    },
  ],
];

function toLogoItems(dbRows) {
  return dbRows.map((row) => ({
    key: row.id,
    src: row.logo_url,
    name: row.name,
    heightRem: Number(row.display_height_rem) || 2,
    widthRem: undefined,
    opacity: Number(row.opacity) || 1,
    // row_no 없거나 2가 아니면 1행으로 취급 — 마이그레이션 미적용 환경 대비.
    rowNo: Number(row.row_no) === 2 ? 2 : 1,
  }));
}

// DB 로고는 sort_order 순 정렬된 상태로 들어온다 — row_no(1|2) 기준으로만 줄을 나누고
// 줄 내부 순서는 재정렬하지 않는다.
function splitIntoTwoRows(list) {
  const row1 = [];
  const row2 = [];
  list.forEach((item) => {
    (item.rowNo === 2 ? row2 : row1).push(item);
  });
  return [row1, row2];
}

function LogoRow({ logos }) {
  if (!logos || logos.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-8">
      {logos.map((logo) => (
        <img
          key={logo.key}
          src={logo.src}
          alt={logo.name}
          loading="lazy"
          className="shrink-0 object-contain"
          // 동적 Tailwind 클래스(h-[${x}rem])는 JIT가 못 잡아 무크기가 된다.
          // DB 값에서 오는 치수는 반드시 inline style로 준다.
          style={{
            height: `${logo.heightRem}rem`,
            width: logo.widthRem ? `${logo.widthRem}rem` : "auto",
            opacity: logo.opacity,
          }}
        />
      ))}
    </div>
  );
}

export default function AcceptanceRateHero({ scope = DEFAULT_HERO_SCOPE }) {
  const { heroLabel, fallbackRates } =
    HERO_SCOPES[scope] || HERO_SCOPES[DEFAULT_HERO_SCOPE];
  // 초기값을 scope별 폴백으로 두어 첫 페인트부터 '5개년 평균 95.4%'가 나온다(레이아웃 시프트 없음).
  // scope는 마운트 후 바뀌지 않는 프레젠테이션 prop이라 lazy 초기화만으로 충분하고,
  // 조회 결과는 아래 useEffect가 scope 변경 시마다 다시 fetchAcceptanceRates(scope)로 덮어쓴다.
  const [rates, setRates] = useState(() => fallbackRates);
  const [logoRows, setLogoRows] = useState(FALLBACK_LOGO_ROWS);

  useEffect(() => {
    let alive = true;

    (async () => {
      const [rateRows, logoDbRows] = await Promise.all([
        fetchAcceptanceRates(scope),
        fetchAdmissionCaseLogos(),
      ]);
      if (!alive) return;

      // rateRows: 조회 실패면 폴백(5개년)이 오고, 정상 응답이면 0건이어도
      // 빈 배열이 그대로 온다 — 어드민이 전부 비활성화한 상태를 존중한다.
      setRates(rateRows);

      // logoDbRows === null: 조회 실패 → 초기값(번들 폴백 로고)을 그대로 유지.
      // logoDbRows가 배열이면 정상 응답 → 그대로 반영(0건이면 빈 배열 → 스트립 숨김).
      if (logoDbRows !== null) {
        setLogoRows(
          logoDbRows.length > 0
            ? splitIntoTwoRows(toLogoItems(logoDbRows))
            : [],
        );
      }
    })();

    return () => {
      alive = false;
    };
  }, [scope]);

  const years = rates.length;
  const average = computeAcceptanceAverage(rates);
  const hasRates = years > 0;
  const hasLogos = logoRows.some((row) => row.length > 0);

  // 어드민이 합격률·로고를 모두 비활성화하면 빈 여백만 남기지 않고
  // 히어로 섹션 자체를 렌더하지 않는다.
  if (!hasRates && !hasLogos) return null;

  return (
    <section className="pt-16 sm:pt-20 md:pt-[6.25rem]">
      <div className="mx-auto w-full max-w-content px-5 text-center sm:px-8">
        {hasRates && (
          // 시안(1882:6520) 실측: 아이브로·라벨은 좌측선이 같은 하나의 컬럼이고
          // (아이브로가 그룹 중앙 정렬이 아니다), 숫자·%는 그 오른쪽에 붙는다.
          // 숫자가 라벨보다 커서(leading-none이어도) 행 높이를 부풀리지 않도록
          // 컬럼과 숫자 그룹을 items-end로 바닥만 맞추고, 잉크 하단 차이(≈9.7px)는
          // 숫자 그룹에 별도 translate-y로 준다.
          <div className="mt-3 flex flex-col items-center gap-2 sm:mt-4 sm:flex-row sm:items-end sm:justify-center sm:gap-[1.2125rem]">
            {/* 시안 잉크 간격 18.6px, leading 합 14.1px 보정 → 박스 간격 4.5px(0.28125rem) */}
            <div className="flex flex-col items-center gap-2 sm:items-start sm:gap-[0.28125rem]">
              <p className="text-xl font-semibold leading-[1.4] tracking-[-0.02em] text-accent">
                {years}개년 평균
              </p>
              <span className="text-2xl font-semibold leading-[1.4] tracking-[-0.02em] text-[#525252] sm:text-[2.25rem]">
                {heroLabel}
              </span>
            </div>
            <span className="flex items-end gap-1 sm:translate-y-[0.60625rem] sm:gap-[0.55625rem]">
              <CountUpNumber
                value={average}
                decimals={1}
                srLabel={`${average.toFixed(1)}퍼센트`}
                className="text-[3.5rem] font-semibold leading-none tracking-[-0.03em] text-accent sm:text-[5rem]"
              />
              {/* % 잉크 하단이 라벨보다 4.8px 아래여야 함(현재 12.7px 초과분 7.9px 보정) → pb-4 */}
              <span
                aria-hidden="true"
                className="pb-1 text-xl font-semibold leading-none text-[#525252] sm:pb-4"
              >
                %
              </span>
            </span>
          </div>
        )}

        {hasLogos && (
          <div
            className={
              hasRates
                ? "mt-12 flex flex-col items-center gap-8 sm:mt-[6.3125rem]"
                : "flex flex-col items-center gap-8"
            }
          >
            {logoRows.map((row, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: logoRows는 로고 배열을 고정 개수로 청크한 정적 목록 — 재정렬·추가·삭제 없이 렌더할 때마다 같은 순서로 재생성된다.
              <LogoRow key={index} logos={row} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
