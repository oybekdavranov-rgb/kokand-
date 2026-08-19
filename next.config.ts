import type { NextConfig } from "next";

/**
 * Imora AI — Next.js configuration.
 * - `output: "standalone"` so the project can be shipped as a self-contained
 *   ZIP / Docker image (see CLAUDE.md §1, §11).
 * - `transpilePackages` covers the three.js ecosystem which ships ESM-only.
 */
const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  transpilePackages: ["three", "@react-three/fiber", "@react-three/drei"],
  images: {
    formats: ["image/avif", "image/webp"],
  },
};

export default nextConfig;
