import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const page = (path) => fileURLToPath(new URL(path, import.meta.url));

// Relative asset URLs, so dist/ works at a domain root and under a sub-path
// such as Jupyter's /proxy/<port>/.
// Three pages share the styles, script and media: Chinese at the root, English at en/, Japanese at jp/.
export default defineConfig({
  base: "./",
  build: {
    rolldownOptions: {
      input: {
        zh: page("./index.html"),
        en: page("./en/index.html"),
        jp: page("./jp/index.html"),
      },
    },
  },
});
