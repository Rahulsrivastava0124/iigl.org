/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Where the API lives. See src/lib/config.ts. */
  readonly VITE_API_URL?: string;
  /** Development only: where Vite forwards same-origin API calls. */
  readonly VITE_DEV_API_TARGET?: string;
  /** Development only: the port this panel serves on. */
  readonly VITE_DEV_PORT?: string;

  /* Uploads. All optional, all clamped — see src/lib/image.ts. */

  /** JPEG/WebP quality for an uploaded picture, 0.4–1. Default 0.82. */
  readonly VITE_IMAGE_QUALITY?: string;
  /** Longest edge an uploaded picture is scaled to, 600–6000px. Default 2000. */
  readonly VITE_IMAGE_MAX_EDGE?: string;
  /** Leave pictures smaller than this alone, 0–5000 KB. Default 300. */
  readonly VITE_IMAGE_SKIP_UNDER_KB?: string;
  /** The largest picture that may be chosen, before shrinking, 8–128 MB. Default 32. */
  readonly VITE_UPLOAD_MAX_MB?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
