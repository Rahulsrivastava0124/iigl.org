/**
 * Builds the India outline the branches section draws its map on.
 *
 * Run from the website: `node scripts/build-india-outline.mjs`.
 *
 * The boundary comes from Datameet's `india-composite.geojson`, which depicts
 * the country as India defines it — the reason for choosing it over the
 * Natural Earth outline that every mapping library ships with, which marks
 * Jammu and Kashmir as disputed and would be the wrong map on an Indian
 * company's site.
 *
 * The source is 10 MB of coordinates. Simplified with Douglas–Peucker and
 * emitted as one SVG path, it is small enough to inline, and the projection it
 * was drawn with is exported alongside so a pin lands where the coastline says
 * it should.
 */
import { writeFile } from 'node:fs/promises';
import { readShapefileRings } from './shapefile.mjs';

const SOURCE =
  'https://raw.githubusercontent.com/datameet/maps/master/Country/india-composite.geojson';

/*
  State borders, from the same publisher as the national outline so the two
  agree along the coast and at the northern boundary. Datameet ships these as a
  shapefile only, which `shapefile.mjs` reads.
*/
const STATES = 'https://raw.githubusercontent.com/datameet/maps/master/States/Admin2.shp';

/** Perpendicular distance from a point to the line through `a` and `b`. */
function distance(p, a, b) {
  const [x, y] = p;
  const [x1, y1] = a;
  const [x2, y2] = b;
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return Math.hypot(x - x1, y - y1);
  const t = ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy);
  const cx = x1 + Math.max(0, Math.min(1, t)) * dx;
  const cy = y1 + Math.max(0, Math.min(1, t)) * dy;
  return Math.hypot(x - cx, y - cy);
}

/** Douglas–Peucker, iterative so a 200 000-point ring cannot blow the stack. */
function simplify(points, tolerance) {
  if (points.length < 3) return points;
  const keep = new Array(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;

  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let index = -1;
    let furthest = tolerance;
    for (let i = first + 1; i < last; i++) {
      const d = distance(points[i], points[first], points[last]);
      if (d > furthest) {
        furthest = d;
        index = i;
      }
    }
    if (index !== -1) {
      keep[index] = true;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** Rough area of a ring in square degrees, for dropping specks. */
function area(ring) {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return Math.abs(sum / 2);
}

const res = await fetch(SOURCE);
if (!res.ok) throw new Error(`Boundary source answered ${res.status}`);
const geo = await res.json();

// Every ring in the file, outer rings only: holes are enclaves, and at this
// scale they are a few pixels.
const rings = [];
for (const feature of geo.features) {
  const { type, coordinates } = feature.geometry;
  const polygons = type === 'MultiPolygon' ? coordinates : [coordinates];
  for (const polygon of polygons) rings.push(polygon[0]);
}

const MIN_AREA = 0.004; // ~ 20 km across: keeps the island groups, drops sandbars.
const kept = rings.filter((r) => area(r) >= MIN_AREA);

// Mercator, because India spans 8°N to 37°N and a plain equirectangular map
// leaves the north visibly squat.
/*
  Mercator's y, in the same units as x.

  The formula returns radians while longitude is in degrees, so scaling by
  180/pi keeps both axes on one ruler — without it the country came out 1000
  wide and 20 tall.
*/
const DEG = 180 / Math.PI;
const mercator = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * DEG;

let minLon = Infinity;
let maxLon = -Infinity;
let minY = Infinity;
let maxY = -Infinity;
for (const ring of kept) {
  for (const [lon, lat] of ring) {
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
    const y = mercator(lat);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
}

const WIDTH = 1000;
const scale = WIDTH / (maxLon - minLon);
const HEIGHT = Math.round((maxY - minY) * scale);

const toX = (lon) => (lon - minLon) * scale;
const toY = (lat) => (maxY - mercator(lat)) * scale;

const round = (n) => Math.round(n * 10) / 10;

let path = '';
let points = 0;
for (const ring of kept) {
  // Tolerance in degrees: about a kilometre, which at this size is a pixel.
  const simplified = simplify(ring, 0.02);
  if (simplified.length < 3) continue;
  points += simplified.length;
  path += simplified
    .map(([lon, lat], i) => `${i === 0 ? 'M' : 'L'}${round(toX(lon))},${round(toY(lat))}`)
    .join('');
  path += 'Z';
}

/* ------------------------------------------------------------ the states */

const shp = await fetch(STATES);
if (!shp.ok) throw new Error(`State source answered ${shp.status}`);
const stateRings = readShapefileRings(Buffer.from(await shp.arrayBuffer()));

/*
  Drawn coarser than the coastline: these are internal lines under the pins,
  and a state border rendered to the same detail as the country doubles the
  file for something the eye reads as one stroke either way.
*/
let statesPath = '';
let statePoints = 0;
for (const ring of stateRings) {
  if (area(ring) < 0.02) continue;
  const simplified = simplify(ring, 0.04);
  if (simplified.length < 3) continue;
  statePoints += simplified.length;
  statesPath += simplified
    .map(([lon, lat], i) => `${i === 0 ? 'M' : 'L'}${round(toX(lon))},${round(toY(lat))}`)
    .join('');
  statesPath += 'Z';
}

const module = `/**
 * India, as one SVG path.
 *
 * Generated from Datameet's \`india-composite.geojson\` — the boundary as India
 * defines it, which is why it is used rather than the Natural Earth outline
 * bundled with most mapping libraries, where Jammu and Kashmir is drawn as
 * disputed territory.
 *
 * Simplified to about a kilometre of detail, which is a pixel at the size this
 * is drawn, and projected with a Mercator so the north is not squat. \`project\`
 * is that same projection: a pin passed through it lands where the coastline
 * says it should, and nothing else is allowed to place a pin.
 *
 * Regenerate with \`node scripts/build-india-outline.mjs\` if the source changes.
 */

export const viewBox = '0 0 ${WIDTH} ${HEIGHT}';

export const indiaPath =
  '${path}';

/**
 * The state borders, as one path.
 *
 * Stroked, never filled: the rings overlap the national outline along every
 * coast, so a fill would paint the country twice and darken every edge.
 */
export const statesPath =
  '${statesPath}';

const MIN_LON = ${minLon};
const MAX_Y = ${maxY};
const SCALE = ${scale};

const DEG = 180 / Math.PI;
const mercator = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * DEG;

/** Longitude and latitude to a point in the viewBox above. */
export function project(lon, lat) {
  return { x: (lon - MIN_LON) * SCALE, y: (MAX_Y - mercator(lat)) * SCALE };
}
`;

// Beside the section that draws it.
const out = new URL('../src/components/sections/indiaOutline.js', import.meta.url);
await writeFile(out, module, 'utf8');

console.log('rings kept   :', kept.length, 'of', rings.length);
console.log('state rings  :', stateRings.length, '| points', statePoints);
console.log('points       :', points);
console.log('viewBox      :', `0 0 ${WIDTH} ${HEIGHT}`);
console.log('module size  :', (module.length / 1024).toFixed(1), 'KB');
process.exit(0);
