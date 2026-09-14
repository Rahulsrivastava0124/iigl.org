import { Box, Checkbox, Chip, Collapse, IconButton, Stack, Typography } from '@mui/material';
import ExpandIcon from '@mui/icons-material/ChevronRightOutlined';
import CollapseIcon from '@mui/icons-material/ExpandMoreOutlined';
import {
  ABILITIES,
  COLUMNS,
  SIDE,
  allOf,
  anyOf,
  countOf,
  nameFor,
  sections,
  usable,
  uses,
  type Permission,
} from '../lib/permissionMenu';

/**
 * The permission matrix: menu groups down, abilities across.
 *
 * Each row says what it opens, and only the boxes that permission uses can be
 * ticked — Laboratories has View and nothing else, Certificates are never
 * deleted — so the grid cannot record a grant the API would ignore. A row a
 * shared role carries for one kind of employee only is marked with that side.
 *
 * It holds no state and saves nothing; the screen around it owns the rows.
 */
export default function PermissionGrid({
  rows,
  onChange,
  open,
  onToggleGroup,
  disabled = false,
  showSide = false,
}: {
  rows: Permission[];
  onChange: (rows: Permission[]) => void;
  /** Which groups are expanded, by title. */
  open: Record<string, boolean>;
  onToggleGroup: (title: string) => void;
  disabled?: boolean;
  /** Mark each row with whose employees it applies to — for a shared role. */
  showSide?: boolean;
}) {
  const template = `minmax(260px, 1fr) repeat(${COLUMNS.length + 1}, 84px)`;

  const setRows = (match: (r: Permission) => boolean, changes: (r: Permission) => Partial<Permission>) =>
    onChange(rows.map((r) => (match(r) ? { ...r, ...changes(r) } : r)));

  /** Every usable box on these rows on or off; unusable ones stay off. */
  const setEvery = (list: Permission[], on: boolean) => {
    const names = new Set(list.map((r) => r.action_type));
    setRows(
      (r) => names.has(r.action_type),
      (r) => Object.fromEntries(ABILITIES.map((a) => [a, on && uses(r, a)])) as Partial<Permission>,
    );
  };

  return (
    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, overflowX: 'auto' }}>
      <Box sx={{ minWidth: 640 }}>
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
          <span>Permission</span>
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
          const expanded = open[group.title] ?? true;

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
                      py: 1,
                      borderBottom: 1,
                      borderColor: 'divider',
                    }}
                  >
                    <Box sx={{ pl: 5, pr: 2, minWidth: 0 }}>
                      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                        <Typography sx={{ fontSize: 13.5, fontWeight: 500 }}>{nameFor(r.action_type, r)}</Typography>
                        {showSide &&
                          r.applies_to?.length === 1 &&
                          r.applies_to.map((side) => (
                            <Chip key={side} size="small" variant="outlined" label={SIDE[side]} sx={{ height: 20, fontSize: 11 }} />
                          ))}
                      </Stack>
                      {r.description && (
                        <Typography color="text.secondary" sx={{ fontSize: 12, lineHeight: 1.45, mt: 0.25 }}>
                          {r.description}
                        </Typography>
                      )}
                    </Box>

                    {COLUMNS.map((c) => (
                      <Box key={c.key} sx={{ textAlign: 'center' }}>
                        {uses(r, c.key) ? (
                          <Checkbox
                            size="small"
                            checked={r[c.key]}
                            onChange={() => setRows((x) => x.action_type === r.action_type, () => ({ [c.key]: !r[c.key] }))}
                            disabled={disabled}
                            slotProps={{ input: { 'aria-label': `${c.label} ${nameFor(r.action_type, r)}` } }}
                          />
                        ) : (
                          // Not a box that means anything here: nothing to tick.
                          <Typography color="text.disabled" sx={{ fontSize: 13 }} title={`${nameFor(r.action_type, r)} has no ${c.label}`}>
                            —
                          </Typography>
                        )}
                      </Box>
                    ))}

                    <Box sx={{ textAlign: 'center' }}>
                      <Checkbox
                        size="small"
                        checked={allOf(r)}
                        indeterminate={anyOf(r) && !allOf(r)}
                        onChange={() => setEvery([r], !allOf(r))}
                        disabled={disabled || usable(r).length === 0}
                        slotProps={{ input: { 'aria-label': `Everything for ${nameFor(r.action_type, r)}` } }}
                      />
                    </Box>
                  </Box>
                ))}
              </Collapse>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

/** Every flag off, for a Clear all control. */
export const cleared = (rows: Permission[]): Permission[] =>
  rows.map((r) => ({ ...r, ...Object.fromEntries(ABILITIES.map((a) => [a, false])) }) as Permission);
