import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiUrl = env.VITE_API_URL ?? '/api';
  const isSameOrigin = !/^https?:\/\//i.test(apiUrl);

  return {
    plugins: [react()],
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
