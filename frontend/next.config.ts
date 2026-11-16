import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["echarts", "zrender", "echarts-wordcloud"],
};

export default nextConfig;
