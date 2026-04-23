import { defineConfig } from 'vite';

const rawPort = process.env.PORT || '5173';
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH || '/';

export default defineConfig({
  base: basePath,
  publicDir: 'public',
  build: {
    outDir: 'dist/public',
    emptyOutDir: true,
    sourcemap: true,
  },
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __COMMIT_SHA__: JSON.stringify(process.env.COMMIT_SHA || 'unknown'),
    __DEV__: JSON.stringify(process.env.NODE_ENV !== 'production'),
    __DRIVE_CLIENT_ID__: JSON.stringify(process.env.DRIVE_CLIENT_ID || ''),
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
  },
  preview: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/tests/**/*.test.js'],
  },
});
