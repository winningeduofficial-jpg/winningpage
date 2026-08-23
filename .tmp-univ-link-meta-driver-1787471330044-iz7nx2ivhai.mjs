import * as esbuild from "esbuild";
import fs from "node:fs";
const result = await esbuild.build({
  entryPoints: ["C:\\dev\\winningpage\\src\\components\\admission\\editor\\AdmissionMetaEditModal.tsx"],
  bundle: true,
  format: "esm",
  jsx: "automatic",
  jsxImportSource: "react",
  platform: "node",
  mainFields: ["module", "main"],
  alias: { "@": "C:\\dev\\winningpage\\src" },
  external: ["react", "react-dom", "react-dom/client", "react/jsx-runtime"],
  write: false,
});
fs.writeFileSync("C:\\dev\\winningpage\\.tmp-univ-link-meta-bundle-1787471330044-iz7nx2ivhai.mjs", result.outputFiles[0].text);
