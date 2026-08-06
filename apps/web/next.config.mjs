/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static-export friendly. `next build` emits a fully static site to ./out.
  output: 'export',
  reactStrictMode: true,
  // next/image optimization is not available under static export.
  images: { unoptimized: true },
  // Emit /route/index.html so the export serves cleanly from static hosts.
  trailingSlash: true,
  webpack: (config, { webpack }) => {
    // The `wagmi/connectors` barrel statically pulls in Coinbase's baseAccount
    // connector, which transitively requires optional `@x402/*` payment modules
    // we never install or use. Ignore them so webpack doesn't fail resolution.
    config.plugins.push(
      new webpack.IgnorePlugin({ resourceRegExp: /^@x402(\/|$)/ }),
    );
    // Optional native deps of WalletConnect's ws stack; harmless to skip in-browser.
    config.resolve = config.resolve || {};
    config.resolve.fallback = {
      ...(config.resolve.fallback || {}),
      'bufferutil': false,
      'utf-8-validate': false,
    };
    return config;
  },
};

export default nextConfig;
