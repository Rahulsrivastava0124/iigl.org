import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiUrl = env.VITE_API_URL ?? '/api';
  const isSameOrigin = !/^https?:\/\//i.test(apiUrl);

  return {
    plugins: [react()],
    build: {
      rollupOptions: {
        output: {
          /*
            Three chunks instead of one.

            The panel built as a single 1.2 MB file, which is not slow to
            download so much as slow to *re-*download: every change to a page —
            a label, a column — invalidated Material UI and React along with it,
            and everybody fetched the whole megabyte again on the next
            deployment.

            Split this way the vendor halves keep their hashes across a
            deployment, so a normal change ships only the application chunk and
            the rest comes from cache. The browser also fetches the three in
            parallel rather than parsing one long file end to end.

            Grouped by how often each changes, which is what decides a cache
            hit: React moves once a year, Material UI a few times a year, the
            panel every day.
          */
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return undefined;
            if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) {
              return 'react';
            }
            if (/[\\/]node_modules[\\/](@mui|@emotion)[\\/]/.test(id)) return 'mui';
            return 'vendor';
          },
        },
      },
    },
    server: {
      port: Number(env.VITE_DEV_PORT ?? 5173),
      // Only proxy when the panel talks to its own origin. Pointing
      // VITE_API_URL at another host means the browser goes there directly and
      // that host handles CORS, so a proxy here would be dead configuration.
      proxy: isSameOrigin
        ? {
            [apiUrl]: {
              target: env.VITE_DEV_API_TARGET ?? 'http://localhost:3000',
              changeOrigin: true,
            },
          }
        : undefined,
    },
  };
});
