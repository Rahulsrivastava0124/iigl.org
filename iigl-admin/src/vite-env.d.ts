/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Where the API lives. See src/lib/config.ts. */
  readonly VITE_API_URL?: string;
  /** Development only: where Vite forwards same-origin API calls. */
  readonly VITE_DEV_API_TARGET?: string;
  /** Development only: the port this panel serves on. */
  readonly VITE_DEV_PORT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
