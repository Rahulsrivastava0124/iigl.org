import { useState } from 'react';
import { Button, Checkbox, FormControlLabel, Stack, Tooltip } from '@mui/material';
import PrintIcon from '@mui/icons-material/PrintOutlined';
import { apiUrl } from '../lib/config';

/**
 * Print the Franchisee Form for one laboratory.
 *
 * The same control on the laboratory's page and in the header of its edit
 * screen: somebody who has just corrected a bank account is exactly the person
 * about to reprint the form, and sending them back to the view page to do it
 * is a round trip for no reason.
 *
 * Two documents, because the paper pack is two: the one-page **registration
 * form** somebody fills in, and the four-page **agreement** they are accepting
 * — the equipment list, what is charged for and what is free, the refund
 * position and the establishment order. They are printed together at a
 * counter, so they are printed from one place.
 *
 * **Blank** prints either with nothing filled in — the letterhead, the labels,
 * the boxes, no values. It is the sheet handed across a counter or taken to a
 * fair, and it is the same template as the filled one, so the two cannot drift
 * apart. It is off by default: from a screen showing one laboratory, that
 * laboratory's papers are what somebody means.
 */

interface Options {
  blank?: boolean;
  /** The HTML the PDF is rendered from — printable from the browser as-is. */
  html?: boolean;
  /** Which document: the one-page form, or the four-page agreement. */
  paper?: 'registration' | 'agreement';
}

export function openFranchiseeForm(
  labId: number,
  { blank, html, paper = 'registration' }: Options = {},
) {
  const query = [html ? 'format=html' : '', blank ? 'blank=1' : ''].filter(Boolean).join('&');
  window.open(
    apiUrl(`/users/laboratories/${labId}/${paper}${query ? `?${query}` : ''}`),
    '_blank',
  );
}

interface Props {
  labId: number;
  /** Header layout: the print button alone, with the checkbox beside it. */
  compact?: boolean;
}

export default function FranchiseeFormActions({ labId, compact }: Props) {
  const [blank, setBlank] = useState(false);

  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }} useFlexGap>
      <Tooltip title="Print the empty form, with no laboratory's details on it">
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={blank}
              onChange={(e) => setBlank(e.target.checked)}
            />
          }
          label="Blank print"
          slotProps={{ typography: { sx: { fontSize: 13.5 } } }}
          sx={{ mr: 0 }}
        />
      </Tooltip>
      <Button
        // Filled, on both screens. It is the action the control exists for,
        // and an outlined one beside a filled Save read as the lesser of two
        // buttons rather than as the other thing this header does.
        variant="contained"
        size={compact ? 'small' : 'medium'}
        startIcon={<PrintIcon />}
        onClick={() => openFranchiseeForm(labId, { blank })}
      >
        {blank ? 'Blank Registration Form' : 'Registration Form'}
      </Button>
      <Button
        variant="contained"
        size={compact ? 'small' : 'medium'}
        startIcon={<PrintIcon />}
        onClick={() => openFranchiseeForm(labId, { blank, paper: 'agreement' })}
      >
        {blank ? 'Blank Agreement' : 'Agreement'}
      </Button>
      {!compact && (
        <Button color="inherit" onClick={() => openFranchiseeForm(labId, { blank, html: true })}>
          View as page
        </Button>
      )}
    </Stack>
  );
}
