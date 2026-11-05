const { PHASE_DEVELOPMENT_SERVER } = require('next/constants');

/** @type {import('next').NextConfig} */
module.exports = (phase) => {
  // Isolate development and production build artifacts so "npm run build"
  // never overwrites the active development server's ".next" assets.
  const isDev = phase === PHASE_DEVELOPMENT_SERVER;
  const distDir = process.env.NEXT_DIST_DIR || (isDev ? '.next' : '.next_prod');

  return {
    distDir,
    reactStrictMode: true,
    experimental: {
      serverComponentsExternalPackages: ["better-sqlite3", "pdfjs-dist"],
    },
    async redirects() {
      return [
        {
          source: '/admin',
          destination: '/issuer',
          permanent: false,
        },
        {
          source: '/verify',
          destination: '/',
          permanent: false,
        },
      ];
    },
    webpack: (config) => {
      config.resolve.alias = {
        ...config.resolve.alias,
        canvas: false,
      };
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        canvas: false,
      };
      return config;
    },
  };
};
