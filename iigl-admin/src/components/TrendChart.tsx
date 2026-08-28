import { useId } from 'react';
import { Box, Stack, Typography } from '@mui/material';
import { BRAND } from '../lib/theme';

/**
 * A twelve-month area chart, drawn as inline SVG.
 *
 * No charting library: this is one path, one gradient and a row of labels, and
 * every library that would draw it costs more to load than the dashboard it
 * sits on. The fill is a `linearGradient` from the series colour down to
 * transparent, which is the whole reason a chart reads as an area rather than
 * a shape.
 *
 * ponytail: no axis, no tooltip, no zoom. The point is the shape of the last
 * year — the exact figures are the tiles above. Reach for a library if this
 * ever needs interaction.
 */
export default function TrendChart({
  points,
  colour = BRAND.navy,
  height = 120,
}: {
  points: { label: string; value: number }[];
  colour?: string;
  height?: number;
}) {
  // Scoped per instance: two charts on one page must not share a gradient id.
  const gradient = useId();

  if (points.length < 2) return null;

  const W = 100;
  const H = 36;
  const top = Math.max(...points.map((p) => p.value), 1);
  const x = (i: number) => (i / (points.length - 1)) * W;
  const y = (v: number) => H - (v / top) * (H - 2);

  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.value)}`).join(' ');
  const area = `${line} L${W},${H} L0,${H} Z`;

  return (
    <Box>
      <Box
        component="svg"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        sx={{ width: '100%', height, display: 'block' }}
      >
        <defs>
          <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={colour} stopOpacity={0.38} />
            <stop offset="100%" stopColor={colour} stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gradient})`} />
        {/* Drawn unscaled by the viewBox stretch, so the stroke stays even. */}
        <path
          d={line}
          fill="none"
          stroke={colour}
          strokeWidth={0.6}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </Box>
      <Stack direction="row" sx={{ justifyContent: 'space-between', mt: 0.5 }}>
        {points.map((p, i) => (
          <Typography
            key={p.label + i}
            variant="caption"
            color="text.secondary"
            sx={{ fontSize: 11 }}
          >
            {p.label}
          </Typography>
        ))}
      </Stack>
    </Box>
  );
}
