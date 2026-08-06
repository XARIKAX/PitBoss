/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static-export friendly. `next build` emits a fully static site to ./out.
  output: 'export',
  reactStrictMode: true,
  // next/image optimization is not available under static export.
  images: { unoptimized: true },
  // Emit /route/index.html so the export serves cleanly from static hosts.
  trailingSlash: true,
};

export default nextConfig;
