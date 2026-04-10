import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  minify: false,
  splitting: false,
  treeshake: true,
  outExtension({ format }) {
    if (format === 'esm') return { js: '.mjs' }
    return { js: '.js' }
  },
  platform: 'neutral',
  target: 'es2020',
  // Mark all dependencies as external since this is a meta-package
  external: [
    '@attestprotocol/core',
    '@attestprotocol/stellar-sdk'
  ]
})