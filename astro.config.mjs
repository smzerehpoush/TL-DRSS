import { defineConfig } from "astro/config";

// On GitHub Pages a project site is served under /<repo-name>/ — the workflow
// sets SITE_URL and BASE_PATH; locally both default to a root-served site.
export default defineConfig({
  site: process.env.SITE_URL ?? "http://localhost:4321",
  base: process.env.BASE_PATH ?? "/",
  devToolbar: { enabled: false },
});
