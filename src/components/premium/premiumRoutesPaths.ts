// 프리미엄 라우트 경로 상수 — 라우트 조립(premiumRoutes.tsx)·네비게이션(navigation.ts)·
// 탭바(PremiumProgramTabs.tsx)·CTA 배너(cta.to)가 전부 이 파일을 공유한다(매직 문자열 금지).
// 컨벤션: /page/premium/<program> (구 /page/premium-<program>은 폐기, 리다이렉트 없음).

export const PREMIUM_PROGRAM_PATH_PREFIX = "/page/premium";
export const PREMIUM_ADMISSION_A_PATH = "/page/premium/admission-consulting/a";
export const PREMIUM_ADMISSION_S_PATH = "/page/premium/admission-consulting/s";
export const PREMIUM_GRADUATE_SCHOOL_PATH = `${PREMIUM_PROGRAM_PATH_PREFIX}/graduate-school`;
export const PREMIUM_GLOBAL_UNIVERSITY_PATH = `${PREMIUM_PROGRAM_PATH_PREFIX}/global-university`;
export const PREMIUM_SPECIAL_HIGHSCHOOL_PATH = `${PREMIUM_PROGRAM_PATH_PREFIX}/special-highschool`;
export const PREMIUM_INTERNATIONAL_SCHOOL_PATH = `${PREMIUM_PROGRAM_PATH_PREFIX}/international-school`;
// 네비게이션 라벨은 "국제・해외고 국내대 입학컨설팅" — slug는 returning-student (navigation.ts
// 실측). Figma 프레임명은 "국제학교 학습관리"였지만 그건 별도 메뉴(international-school)의
// 슬러그라 혼동하지 않도록 상수명도 실제 라우트(returning-student) 기준으로 짓는다.
export const PREMIUM_RETURNING_STUDENT_PATH = `${PREMIUM_PROGRAM_PATH_PREFIX}/returning-student`;
