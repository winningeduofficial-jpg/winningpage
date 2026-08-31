// AdminEngine.tsx의 bannerPathFromUrl/collectBannerPaths(어드민 업로드 고아 방지
// 패턴 C — 저장/취소/행삭제 시 구 banners 파일 정리) 순수 로직 회귀 테스트.
// Supabase·React 없이 URL→경로 추출과 필드 값 diff 계산만 검증한다.

import { expect, test } from "vitest";
import { bannerPathFromUrl, collectBannerPaths } from "./AdminEngine";

test("banners 공개 URL에서 스토리지 경로를 추출한다", () => {
  expect(
    bannerPathFromUrl(
      "https://xyz.supabase.co/storage/v1/object/public/banners/admin/1-abc.png",
    ),
  ).toBe("admin/1-abc.png");
});

test("URL 인코딩된 경로는 decodeURIComponent해서 반환한다", () => {
  expect(
    bannerPathFromUrl(
      "https://xyz.supabase.co/storage/v1/object/public/banners/admin/%ED%95%9C%EA%B8%80.png",
    ),
  ).toBe("admin/한글.png");
});

test("banners 버킷 외 URL·외부 URL·빈 값은 null을 반환한다", () => {
  expect(
    bannerPathFromUrl(
      "https://xyz.supabase.co/storage/v1/object/public/other-bucket/a.png",
    ),
  ).toBeNull();
  expect(bannerPathFromUrl("https://example.com/a.png")).toBeNull();
  expect(bannerPathFromUrl("")).toBeNull();
  expect(bannerPathFromUrl(null)).toBeNull();
  expect(bannerPathFromUrl(undefined)).toBeNull();
});

const BASE = "https://xyz.supabase.co/storage/v1/object/public/banners/";

test("image 필드는 문자열 URL 하나에서 경로를 뽑는다", () => {
  const paths = collectBannerPaths({ thumbnail: `${BASE}admin/1.png` }, [
    { key: "thumbnail", type: "image" },
  ]);
  expect([...paths]).toEqual(["admin/1.png"]);
});

test("multiImage/multiFile은 문자열·{url,...} 객체 항목을 모두 처리한다", () => {
  const paths = collectBannerPaths(
    {
      gallery: [`${BASE}admin/a.png`, { url: `${BASE}admin/b.png` }],
      files: [{ url: `${BASE}notice-files/c.pdf`, name: "c.pdf" }],
    },
    [
      { key: "gallery", type: "multiImage" },
      { key: "files", type: "multiFile" },
    ],
  );
  expect([...paths].sort()).toEqual(
    ["admin/a.png", "admin/b.png", "notice-files/c.pdf"].sort(),
  );
});

test("blockEditor·file(단일) 등 대상 외 필드 타입은 무시한다", () => {
  const paths = collectBannerPaths(
    { body: `${BASE}admin/inline.png`, attachment: `${BASE}admin/x.pdf` },
    [
      { key: "body", type: "blockEditor" },
      { key: "attachment", type: "file" },
    ],
  );
  expect(paths.size).toBe(0);
});

test("row·fields가 없으면 빈 Set을 반환한다", () => {
  expect(collectBannerPaths(null, [{ key: "a", type: "image" }]).size).toBe(0);
  expect(collectBannerPaths({ a: `${BASE}x.png` }, null).size).toBe(0);
});
