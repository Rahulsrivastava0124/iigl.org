import { apiUrl } from './config';
import { compressImage } from './image';

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
 *
 * **Every upload in the panel comes through here**, which is why the shrinking
 * is here too rather than in each field: a phone photograph of an Aadhaar card
 * is four megabytes of a document that prints at 3cm across, and an uploader
 * that forgot to compress would be one nobody noticed until the storage bill.
 * See `compressImage` for what it leaves alone.
 */

export interface UploadedFile {
  path: string;
  url: string;
  original_name: string;
  bytes: number;
  mime: string;
}

export async function uploadFiles(
  bucket: string,
  files: File[],
  onProgress?: (percent: number) => void,
  /** What the shrinking saved, once it is known and before the bytes move. */
  onShrunk?: (saved: { before: number; after: number }) => void,
): Promise<UploadedFile[]> {
  /*
    Shrunk first, then sent. The progress bar therefore measures the bytes that
    are actually travelling — reporting progress against the original size and
    then sending a tenth of it is a bar that finishes before it starts.

    In parallel: each is a decode and a re-encode on the GPU, and a franchise
    attaching five documents should not wait for five of them in a row.
  */
  const prepared = await Promise.all(files.map(compressImage));

  const before = prepared.reduce((n, p) => n + p.before, 0);
  const after = prepared.reduce((n, p) => n + p.after, 0);
  if (after < before) onShrunk?.({ before, after });

  return new Promise((resolve, reject) => {
    const form = new FormData();
    for (const { file } of prepared) form.append('files', file);

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
