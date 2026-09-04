/**
 * The smallest shapefile reader that answers this question.
 *
 * Datameet publishes India's state boundaries as a shapefile and nothing else
 * — no GeoJSON — and the alternatives on GitHub are GADM-derived, where Jammu
 * and Kashmir is drawn the way an atlas outside India draws it. Keeping the
 * state borders from the same source as the national outline is the whole
 * point, so the format is read here rather than the source being swapped.
 *
 * Geometry only: the `.dbf` holds the names and nothing on the map is labelled.
 * Polygon (5) and PolygonZ (15) are the only shapes that appear in this file;
 * anything else is skipped rather than guessed at.
 */

/** Every ring in a `.shp`, as `[lon, lat]` arrays. */
export function readShapefileRings(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const rings = [];

  // The 100-byte header carries the file length in 16-bit words, big-endian.
  const fileLength = view.getInt32(24, false) * 2;
  let offset = 100;

  while (offset + 8 <= fileLength) {
    const contentLength = view.getInt32(offset + 4, false) * 2;
    const content = offset + 8;
    const shapeType = view.getInt32(content, true);

    if (shapeType === 5 || shapeType === 15) {
      // box (4 doubles), then the part index and the point count.
      const numParts = view.getInt32(content + 36, true);
      const numPoints = view.getInt32(content + 40, true);
      const partsAt = content + 44;
      const pointsAt = partsAt + numParts * 4;

      const parts = [];
      for (let i = 0; i < numParts; i++) parts.push(view.getInt32(partsAt + i * 4, true));

      for (let p = 0; p < numParts; p++) {
        const from = parts[p];
        const to = p + 1 < numParts ? parts[p + 1] : numPoints;
        const ring = [];
        for (let i = from; i < to; i++) {
          ring.push([
            view.getFloat64(pointsAt + i * 16, true),
            view.getFloat64(pointsAt + i * 16 + 8, true),
          ]);
        }
        if (ring.length >= 4) rings.push(ring);
      }
    }

    offset = content + contentLength;
  }

  return rings;
}
