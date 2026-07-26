/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["@prisma/client"],
  // G: 盘为 exFAT:readlink 会返回异常错误码,关闭符号链接解析绕过
  webpack: (config) => {
    config.resolve.symlinks = false;
    config.cache = false; // exFAT: 持久化缓存的快照逻辑会触发 readlink
    config.resolve.alias.canvas = false; // react-pdf 官方建议:不解析 node 端 canvas
    return config;
  },
};

export default nextConfig;
