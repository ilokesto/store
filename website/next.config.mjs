import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  serverExternalPackages: ['@takumi-rs/image-response'],
  transpilePackages: ['@ilokesto/docs-runtime'],
  reactStrictMode: true,
};

export default withMDX(config);
