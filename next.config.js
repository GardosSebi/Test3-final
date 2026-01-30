/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  compiler: {
    styledComponents: true,
  },
  webpack: (config, { isServer }) => {
    // Fix for bcrypt optional dependencies
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }
    
    // Ignore optional dependencies that aren't needed
    config.externals = [...(config.externals || []), 'mock-aws-s3', 'aws-sdk', 'nock'];
    
    return config;
  },
}

module.exports = nextConfig

