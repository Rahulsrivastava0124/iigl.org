import type { ReactNode } from 'react';
import { Box, FormControl, FormControlLabel, FormLabel, Radio, RadioGroup, Stack } from '@mui/material';

/**
 * A yes/no question with the field it governs underneath.
 *
 * Moved here from NewOrder, where "Show Name on Card" and "Show Image on Card"
 * first used it, so the registered-customer form asks the same two questions
 * the same way rather than with a second copy that drifts.
 *
 * Two labelled radios rather than a bare switch: the answer is read on a
 * printed certificate, and "Yes" / "No" says what will happen where a toggle
 * only says on or off.
 *
 * Not `YesNo` — that name is the status chip in ui.tsx.
 */
export default function YesNoField({
  label,
  value,
  onChange,
  children,
  inline = false,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  children?: ReactNode;
  /**
   * The question and its field side by side on one row, rather than the field
   * underneath. Stacks again on a narrow screen, where one row has no room.
   */
  inline?: boolean;
}) {
  if (inline) {
    return (
      <FormControl component="fieldset" fullWidth>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' } }}>
          <Box sx={{ flexShrink: 0 }}>
            <FormLabel component="legend" sx={{ fontSize: 13.5, fontWeight: 600, color: 'text.primary' }}>
              {label}
            </FormLabel>
            <RadioGroup row value={value ? '1' : '0'} onChange={(e) => onChange(e.target.value === '1')}>
              <FormControlLabel value="1" control={<Radio size="small" />} label="Yes" />
              <FormControlLabel value="0" control={<Radio size="small" />} label="No" />
            </RadioGroup>
          </Box>
          {children && <Box sx={{ flex: 1, minWidth: 0 }}>{children}</Box>}
        </Stack>
      </FormControl>
    );
  }

  return (
    <FormControl component="fieldset" fullWidth>
      <FormLabel
        component="legend"
        sx={{ fontSize: 13.5, fontWeight: 600, color: 'text.primary', mb: 0.5 }}
      >
        {label}
      </FormLabel>
      <RadioGroup row value={value ? '1' : '0'} onChange={(e) => onChange(e.target.value === '1')}>
        <FormControlLabel value="1" control={<Radio size="small" />} label="Yes" />
        <FormControlLabel value="0" control={<Radio size="small" />} label="No" />
      </RadioGroup>
      <Box sx={{ mt: 1 }}>{children}</Box>
    </FormControl>
  );
}
