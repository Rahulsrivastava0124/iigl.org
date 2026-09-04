import { apiUrl } from './config';

/**
 * Uploading, with something to look at while it happens.
 *
 * `fetch` cannot report how far a request body has got, so an upload through
 * it is an indeterminate spinner: a two-second wait on a slow link is
 * indistinguishable from a hang, and people click again. `XMLHttpRequest`
 * still reports progress, which is the whole reason it is here rather than in
 * the `api` client with everything else.
 *
 * The wait is real — a round trip to object storage measures the better part
 * of a second before any bytes move — so the fix is not to make it quicker but
 * to say what it is doing.
 */

export interface UploadedFile {
  path: string;
  url: string;
  original_name: string;
  bytes: number;
  mime: string;
}

export function uploadFiles(
  bucket: string,
  files: File[],
  onProgress?: (percent: number) => void,
): Promise<UploadedFile[]> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    for (const file of files) form.append('files', file);

    const request = new XMLHttpRequest();
    request.open('POST', apiUrl(`/uploads/${bucket}`));
    request.withCredentials = true;

    request.upload.onprogress = (e) => {
      if (!onProgress) return;
      /*
        Only while the total is known. `lengthComputable` is false on some
        proxies, and a bar that jumps to a number it invented is worse than no
        bar — the caller falls back to its indeterminate one.
      */
      if (e.lengthComputable && e.total > 0) {
        onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)));
      }
    };

    request.onload = () => {
      let body: { data?: UploadedFile[]; message?: string } | null = null;
      try {
        body = JSON.parse(request.responseText);
      } catch {
        body = null;
      }

      if (request.status >= 200 && request.status < 300 && body?.data) {
        onProgress?.(100);
        resolve(body.data);
        return;
      }
      reject(new Error(body?.message ?? `Upload failed (${request.status})`));
    };

    request.onerror = () => reject(new Error('The upload could not reach the server.'));
    request.onabort = () => reject(new Error('Upload cancelled.'));

    request.send(form);
  });
}
