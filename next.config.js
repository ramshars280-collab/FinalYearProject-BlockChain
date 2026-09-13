/** @type {import('next').NextConfig} */
const nextConfig = {
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

module.exports = nextConfig;
