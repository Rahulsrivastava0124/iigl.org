import { Box, Checkbox, Collapse, IconButton, Stack, Typography } from '@mui/material';
import ExpandIcon from '@mui/icons-material/ChevronRightOutlined';
import CollapseIcon from '@mui/icons-material/ExpandMoreOutlined';
import {
  ABILITIES,
  COLUMNS,
  allOf,
  anyOf,
  countOf,
  nameFor,
  sections,
  type Permission,
} from '../lib/permissionMenu';

/**
 * The permission matrix: menu groups down, abilities across.
 *
 * A plain CSS grid rather than a Table — the group rows and the rows under them
 * are different shapes, and one column template is what keeps their checkboxes
 * in the same columns.
 *
 * It holds no state and saves nothing. The screen around it owns the rows and
 * decides when they are written, which is what lets the same grid serve a
 * dialog with a Save button and a page with one.
 */
export default function PermissionGrid({
  rows,
  onChange,
  open,
  onToggleGroup,
  disabled = false,
}: {
  rows: Permission[];
  onChange: (rows: Permission[]) => void;
  /** Which groups are expanded, by title. */
  open: Record<string, boolean>;
  onToggleGroup: (title: string) => void;
  disabled?: boolean;
}) {
  const template = `minmax(240px, 1fr) repeat(${COLUMNS.length + 1}, 96px)`;

  const setRows = (match: (r: Permission) => boolean, changes: Partial<Permission>) =>
    onChange(rows.map((r) => (match(r) ? { ...r, ...changes } : r)));

  const setEvery = (list: Permission[], on: boolean) => {
    const names = new Set(list.map((r) => r.action_type));
    setRows((r) => names.has(r.action_type), {
      view: on,
      create: on,
      update: on,
      delete: on,
    });
  };

  return (
    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: template,
          alignItems: 'center',
          px: 2,
          py: 1.25,
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        <span>Menu</span>
        {COLUMNS.map((c) => (
          <Box key={c.key} sx={{ textAlign: 'center' }}>
            {c.label}
          </Box>
        ))}
        <Box sx={{ textAlign: 'center' }}>All</Box>
      </Box>

      {sections(rows).map((group) => {
        const count = countOf(group.rows);
        const every = count.total > 0 && count.granted === count.total;
        const expanded = open[group.title] ?? false;

        return (
          <Box key={group.title}>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: template,
                alignItems: 'center',
                px: 2,
                py: 0.75,
                bgcolor: 'action.hover',
                borderBottom: 1,
                borderColor: 'divider',
              }}
            >
              <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', minWidth: 0 }}>
                <IconButton
                  size="small"
                  onClick={() => onToggleGroup(group.title)}
                  aria-expanded={expanded}
                  aria-label={`${expanded ? 'Collapse' : 'Expand'} ${group.title}`}
                >
                  {expanded ? <CollapseIcon fontSize="small" /> : <ExpandIcon fontSize="small" />}
                </IconButton>
                <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>{group.title}</Typography>
                <Typography color="text.secondary" className="tabular" sx={{ fontSize: 13 }}>
                  ({count.granted}/{count.total})
                </Typography>
              </Stack>
              {COLUMNS.map((c) => (
                <span key={c.key} />
              ))}
              <Box sx={{ textAlign: 'center' }}>
                <Checkbox
                  size="small"
                  checked={every}
                  indeterminate={count.granted > 0 && !every}
                  onChange={() => setEvery(group.rows, !every)}
                  disabled={disabled}
                  slotProps={{ input: { 'aria-label': `Everything in ${group.title}` } }}
                />
              </Box>
            </Box>

            <Collapse in={expanded} unmountOnExit>
              {group.rows.map((r) => (
                <Box
                  key={r.action_type}
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: template,
                    alignItems: 'center',
                    px: 2,
                    py: 0.5,
                    borderBottom: 1,
                    borderColor: 'divider',
                  }}
                >
                  <Box sx={{ pl: 5 }}>
                    <Typography sx={{ fontSize: 13.5 }}>{nameFor(r.action_type)}</Typography>
                    <Typography color="text.secondary" className="mono" sx={{ fontSize: 11.5 }}>
                      {r.action_type}
                    </Typography>
                  </Box>

                  {COLUMNS.map((c) => (
                    <Box key={c.key} sx={{ textAlign: 'center' }}>
                      <Checkbox
                        size="small"
                        checked={r[c.key]}
                        onChange={() =>
                          setRows((x) => x.action_type === r.action_type, { [c.key]: !r[c.key] })
                        }
                        disabled={disabled}
                        slotProps={{
                          input: { 'aria-label': `${c.label} ${nameFor(r.action_type)}` },
                        }}
                      />
                    </Box>
                  ))}

                  <Box sx={{ textAlign: 'center' }}>
                    <Checkbox
                      size="small"
                      checked={allOf(r)}
                      indeterminate={anyOf(r) && !allOf(r)}
                      onChange={() => setEvery([r], !allOf(r))}
                      disabled={disabled}
                      slotProps={{
                        input: { 'aria-label': `Everything for ${nameFor(r.action_type)}` },
                      }}
                    />
                  </Box>
                </Box>
              ))}
            </Collapse>
          </Box>
        );
      })}
    </Box>
  );
}

/** Every flag off, for a Clear all control. */
export const cleared = (rows: Permission[]): Permission[] =>
  rows.map((r) => ({ ...r, ...Object.fromEntries(ABILITIES.map((a) => [a, false])) }) as Permission);
