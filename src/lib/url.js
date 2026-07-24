// Prefix an internal path with the configured base (needed for GitHub Pages
// project sites, which are served under /<repo-name>/).
const base = import.meta.env.BASE_URL.replace(/\/$/, "");

export function url(path) {
  if (!path) return path;
  return path.startsWith(base + "/") || path === base ? path : base + path;
}
