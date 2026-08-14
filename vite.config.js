import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler"]],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        // BlockNote 계열을 이름 있는 단일 청크로 고정한다 — 빌드 출력에서 청크 크기를 바로 읽기 위함.
        // 두 importer(Admin의 에디터, ColumnBodyBlockNote)가 모두 lazy라 청크도 async로 남는다.
        // src/ 어디서도 이 패키지들을 정적으로 import하지 않는다(정적 승격 위험 없음).
        // emoji-mart / @emoji-mart/data 는 core가 동적 import하므로 목록에 없다 — 별도 청크로 빠지고
        // 리더 경로에 들어오지 않는다(emojiPicker={false}로 컨트롤러도 껐다).
        manualChunks(id) {
          if (
            id.includes("node_modules/@blocknote/") ||
            id.includes("node_modules/prosemirror-") ||
            id.includes("node_modules/@tiptap/") ||
            id.includes("node_modules/@ariakit/") ||
            id.includes("node_modules/@floating-ui/")
          ) {
            return "blocknote";
          }
        },
      },
    },
  },
});
