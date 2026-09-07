/**
 * Shrinking a picture before it is uploaded.
 *
 * Every scan and photograph on this panel arrives from a phone: an Aadhaar card
 * photographed at 12 megapixels is four megabytes of a document that prints at
 * 3cm across. Uploading that costs the franchise's connection, costs storage
 * forever, and costs every later reader — the franchisee form embeds these as
 * data URIs, so a 4MB scan becomes 5.5MB of base64 inside one PDF.
 *
 * Done in the browser rather than on the server: the bytes never leave the
 * machine in the first place, which is the part that is actually slow, and it
 * needs no library at either end. `createImageBitmap` and `canvas.toBlob` are
 * both native and have been for years.
 *
 * What it deliberately does not touch:
 *
 *   PDFs        not images. Passed through untouched.
 *   GIFs        the canvas keeps one frame, so an animation would be silently
 *               flattened. Rare here, and worth leaving alone.
 *   small files under the threshold there is nothing to gain, and re-encoding a
 *               picture always loses a little.
 *
 * A PNG comes back as WebP rather than JPEG: a signature is a PNG *because* it
 * has a transparent background, and JPEG has no transparency — it would come
 * back as a signature on a black rectangle. WebP keeps it and compresses far
 * harder than PNG.
 */

/**
 * The knobs, and where they are set.
 *
 * Read from the environment at build time, as `VITE_API_URL` is — Vite
 * substitutes them into the bundle, so a build is compiled for one setting and
 * changing it means rebuilding. That is the right shape for these: they are a
 * deployment's policy on what a scan is worth keeping, not something a user
 * chooses per file.
 *
 * Every one is clamped to a range that still produces a usable document. A
 * quality of 0.02 in the environment is a typo, not an instruction, and a panel
 * that honoured it would quietly ruin every identity document uploaded that
 * week.
 */
const number = (raw: unknown, fallback: number, low: number, high: number) => {
  const n = Number(raw);
  return Number.isFinite(n) ? Math.min(high, Math.max(low, n)) : fallback;
};

/**
 * `VITE_IMAGE_QUALITY` — JPEG/WebP quality, 0.4 to 1.
 *
 * 0.82 is where the artefacts stop being visible on a document. Below 0.4 the
 * text on a scanned card starts to go, so that is the floor whatever the
 * environment says.
 */
export const QUALITY = number(import.meta.env.VITE_IMAGE_QUALITY, 0.82, 0.4, 1);

/**
 * `VITE_IMAGE_MAX_EDGE` — longest edge in pixels, 600 to 6000.
 *
 * A scan is read, not enlarged; 2000 is more than an A4 page needs at print
 * resolution. Raise it where the certificates carry fine detail.
 */
export const MAX_EDGE = number(import.meta.env.VITE_IMAGE_MAX_EDGE, 2000, 600, 6000);

/**
 * `VITE_IMAGE_SKIP_UNDER_KB` — leave anything smaller alone, 0 to 5000.
 *
 * Below this there is nothing worth winning, and a re-encode always loses a
 * little. Set it to 0 to compress everything.
 */
const SKIP_UNDER_BYTES =
  number(import.meta.env.VITE_IMAGE_SKIP_UNDER_KB, 300, 0, 5000) * 1024;

/**
 * `VITE_UPLOAD_MAX_MB` — the largest picture that may be chosen, 8 to 128.
 *
 * Not the same as the API's ceiling: this is what somebody may *pick*, before
 * it is shrunk. See `tooLarge`.
 */
const PICKER_MAX_MB = number(import.meta.env.VITE_UPLOAD_MAX_MB, 32, 8, 128);

const COMPRESSIBLE = new Set(['image/jpeg', 'image/png', 'image/webp']);

export interface Compressed {
  file: File;
  /** What it was, and what it became. Equal when nothing was done. */
  before: number;
  after: number;
}

/**
 * Returns a smaller file, or the original when there is nothing to gain.
 *
 * Never throws: a browser that cannot decode the image, or a canvas that comes
 * back empty, means the upload goes ahead with what the person chose. Refusing
 * to upload because the optimisation failed would be the optimisation breaking
 * the thing it was helping.
 */
export async function compressImage(file: File): Promise<Compressed> {
  const unchanged = { file, before: file.size, after: file.size };

  if (!COMPRESSIBLE.has(file.type)) return unchanged;
  if (file.size <= SKIP_UNDER_BYTES) return unchanged;

  try {
    /*
      `from-image`, or a phone photograph comes out on its side.

      A camera writes the picture in the sensor's orientation and records how to
      turn it in an EXIF tag; browsers honour that tag when they *display* the
      file, so the person picking it sees it upright. `createImageBitmap`
      defaults to ignoring it, and drawing that onto a canvas bakes the rotation
      in — the preview would flip the moment the upload finished, and the
      franchisee form would print a sideways Aadhaar card.
    */
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return unchanged;
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    // PNG keeps its transparency by becoming WebP; a JPEG stays a JPEG, which
    // is what every phone produces and what every reader expects.
    const type = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/webp';
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, type, QUALITY),
    );
    if (!blob) return unchanged;

    // A re-encode that came out bigger is a re-encode worth discarding: it
    // happens with small flat graphics, where the original PNG was already the
    // better format.
    if (blob.size >= file.size) return unchanged;

    const name = file.name.replace(/\.[^.]+$/, '') + (type === 'image/jpeg' ? '.jpg' : '.webp');
    return {
      file: new File([blob], name, { type, lastModified: file.lastModified }),
      before: file.size,
      after: blob.size,
    };
  } catch {
    return unchanged;
  }
}

/** `1.4 MB`, for saying what an upload cost or saved. */
export const bytes = (n: number) =>
  n >= 1024 * 1024 ? `${(n / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

/**
 * The ceiling on what may be chosen, per file.
 *
 * `upload.service.ts` gives multer 8MB, and that is what has to arrive. What
 * somebody *picks* is a different number: a phone photograph of a document is
 * routinely twelve, and it lands under a megabyte once shrunk. Rejecting it at
 * the picker on the strength of the size it will not be uploaded at is
 * rejecting the ordinary case.
 *
 * So an image that this file knows how to shrink is allowed in far larger, and
 * anything else — a PDF — keeps the ceiling it has to arrive under.
 *
 * Written for react-dropzone's `validator`, which takes a file and returns a
 * reason to refuse it, or null.
 */
export const SERVER_MAX_BYTES = 8 * 1024 * 1024;
const PICKER_MAX_BYTES = PICKER_MAX_MB * 1024 * 1024;

export function tooLarge(file: File): { code: string; message: string } | null {
  const shrinkable = COMPRESSIBLE.has(file.type);
  const ceiling = shrinkable ? PICKER_MAX_BYTES : SERVER_MAX_BYTES;
  if (file.size <= ceiling) return null;

  return {
    code: 'file-too-large',
    message: shrinkable
      ? `That picture is ${bytes(file.size)}. The largest that can be handled is ${bytes(ceiling)}.`
      : `That file is ${bytes(file.size)}. The largest allowed is ${bytes(ceiling)}.`,
  };
}
