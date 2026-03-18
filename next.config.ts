import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: [
    "nanci-oilier-overtolerantly.ngrok-free.app",
    "nanci-oilier-overtolerantly.ngrok-free.dev",
  ],
};

export default withNextIntl(nextConfig);
