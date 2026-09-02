import { Autocomplete, TextField } from '@mui/material';

/**
 * Where an enquiry came from.
 *
 * The four the business actually counts, offered as a list rather than left as
 * a helper line under an empty box — a free-text source is a column nobody can
 * total, and "web", "Web" and "website" all arrive in it within a month.
 *
 * `freeSolo`, though, not a plain select. Two reasons, and both are about the
 * data that already exists: a select renders nothing for a value that is not
 * on its list, so rows holding `web` would show as blank and be silently
 * rewritten by the next save; and a source nobody anticipated — an exhibition,
 * a particular partner — should be recordable without a deploy.
 */
const SOURCES = ['Website', 'Phone', 'Walk-in', 'Referral'];

export default function SourceField({
  value,
  onChange,
  label = 'Enquiry source',
  sx,
}: {
  value: string;
  onChange: (next: string) => void;
  label?: string;
  sx?: object;
}) {
  return (
    <Autocomplete<string, false, false, true>
      freeSolo
      options={SOURCES}
      // Held as text, not as a chosen option: the stored value is a string and
      // may be one nobody offered.
      inputValue={value}
      value={value || null}
      onInputChange={(_, text, reason) => {
        // Ignore the input event the component fires while resetting itself,
        // which would otherwise clear a value that was just picked.
        if (reason !== 'reset' || text) onChange(text);
      }}
      onChange={(_, next) => onChange(next ?? '')}
      sx={sx}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder="Pick one, or type where it came from"
          helperText="Website, phone, walk-in, referral — or anything else."
        />
      )}
    />
  );
}
