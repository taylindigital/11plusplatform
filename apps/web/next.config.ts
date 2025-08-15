import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Generate a static export for Azure Static Web Apps (Free)
  output: "export",
  // Required for static export if you use next/image
  images: { unoptimized: true },
  // Optional but often helpful for static hosting
  trailingSlash: true,
};

export default nextConfig;
