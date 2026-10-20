import { defineConfig } from "vite";

// Relative asset URLs, so dist/ works at a domain root and under a sub-path
// such as Jupyter's /proxy/<port>/.
export default defineConfig({
  base: "./",
});
