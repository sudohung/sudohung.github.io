import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: "/mailchimp/mail-studio",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
