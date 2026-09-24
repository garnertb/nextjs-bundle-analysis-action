/** @type {import("next").NextConfig} */
const nextConfig = {
  // Pin the workspace root to this app's own directory. Without this, Next
  // walks up from the fixture-generation scratch dir (which lives inside
  // this repo) and finds the repo root's pnpm-lock.yaml, producing a
  // "multiple lockfiles" warning.
  outputFileTracingRoot: __dirname,
  // These fixture apps intentionally have no ESLint config of their own;
  // without this, Next's build-time lint pass walks up and picks up the
  // action repo's own (unrelated, stricter) eslint.config.mjs instead.
  eslint: { ignoreDuringBuilds: true },
};

module.exports = nextConfig;
