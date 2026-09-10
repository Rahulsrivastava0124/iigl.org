import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiUrl = env.VITE_API_URL ?? '/api';
  const isSameOrigin = !/^https?:\/\//i.test(apiUrl);

  /*
    Printed so a deployment's build log records what was baked in.

    VITE_API_URL is substituted into the bundle here and read by nothing at run
    time, so a wrong value is invisible until the panel is open and every
    request is going somewhere unexpected. It can arrive as a build argument or
    from a .env file in the build context, which makes "which one won" a real
    question with no way to ask it afterwards. One line in the log answers it.
  */
  if (command === 'build') {
    console.info(
      `[iigl-admin] API base: ${apiUrl}` +
        (isSameOrigin
          ? `  (same origin — ${apiUrl} on this panel's host must be routed to the API container)`
          : `  (cross origin — the API needs this panel's origin in CORS_ORIGINS and SESSION_CROSS_SITE=true)`),
    );
  }

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
