/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Lint is een eigen gate (`npm run lint`, ESLint CLI met
  // eslint-suppressions.json, ADR 0025). `next build` kent die suppressies
  // niet en zou op bekende, onderdrukte schuld falen; Vercel bouwt via deze
  // config, dus de build lint niet nog eens.
  eslint: { ignoreDuringBuilds: true },
  // Build-SHA voor src/lib/clientErrors.ts (docs/features/foutlogging.md).
  // Expliciet uit VERCEL_GIT_COMMIT_SHA (door Vercel bij elke build gezet),
  // niet vertrouwen op Vercels automatische NEXT_PUBLIC_-variant: die is een
  // projectinstelling. Lokaal/CI leeg, dan wordt `build` in de log `null`.
  env: {
    NEXT_PUBLIC_BUILD_SHA: process.env.VERCEL_GIT_COMMIT_SHA ?? "",
  },
};

export default nextConfig;
