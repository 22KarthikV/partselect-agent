import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "www.partselect.com",
      },
      {
        protocol: "https",
        hostname: "az417944.vo.msecnd.net",
      },
      {
        // PartSelect Azure Front Door CDN — primary CDN endpoint
        protocol: "https",
        hostname: "partselectcom-gtcdcddbene3cpes.z01.azurefd.net",
      },
      {
        // PartSelect Azure Front Door CDN — secondary CDN endpoint
        protocol: "https",
        hostname: "*.azurefd.net",
      },
    ],
  },
};

export default nextConfig;
