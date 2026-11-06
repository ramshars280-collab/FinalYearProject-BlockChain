const { PHASE_DEVELOPMENT_SERVER } = require('next/constants');

/** @type {import('next').NextConfig} */
module.exports = (phase) => {
  // Isolate development and production build artifacts so "npm run build"
  // never overwrites the active development server's ".next" assets, while Vercel builds use standard ".next".
  const isDev = phase === PHASE_DEVELOPMENT_SERVER;
  const isVercel = Boolean(process.env.VERCEL);
  const distDir = process.env.NEXT_DIST_DIR || (isDev || isVercel ? '.next' : '.next_prod');

  return {
    distDir,
    reactStrictMode: true,
    experimental: {
      serverComponentsExternalPackages: ["better-sqlite3", "pdfjs-dist"],
    },
    async headers() {
      return [
        {
          source: '/:path*',
          headers: [
            {
              key: 'X-Frame-Options',
              value: 'DENY',
            },
            {
              key: 'X-Content-Type-Options',
              value: 'nosniff',
            },
            {
              key: 'Referrer-Policy',
              value: 'strict-origin-when-cross-origin',
            },
            {
              key: 'Permissions-Policy',
              value: 'camera=(), microphone=(), geolocation=()',
            },
            ...(isDev
              ? []
              : [
                  {
                    key: 'Strict-Transport-Security',
                    value: 'max-age=63072000; includeSubDomains; preload',
                  },
                ]),
          ],
        },
      ];
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
