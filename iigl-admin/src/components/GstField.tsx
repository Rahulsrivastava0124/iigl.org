import { Autocomplete, TextField } from '@mui/material';
import { hintNode } from './ui';

/** A GST rate, as Master › GST maintains it. */
export interface GstRate {
  id: number;
  name: string;
  percent: string;
}

/** What the field holds. One of the two is set, or neither. */
export interface GstValue {
  /** A row of the master list, as a string for form state. */
  gst_id: string;
  /** A rate typed for this record alone. */
  gst_percent: string;
}

/**
 * The GST a fee or a price band is quoted at: pick one, or type one.
 *
 * One control rather than a select beside a box. The two ways of answering
 * were a dropdown and a number field that appeared when you chose "Custom",
 * which is two controls and a mode for what is one question — what rate is
 * this? A combo box asks it once: the list drops down, and anything typed
 * that is not on it is the rate for this record alone.
 *
 * `freeSolo` is what makes the typing half work; without it the box only
 * filters the list and discards anything that matches nothing.
 *
 * **One of the two, never both.** Picking from the list clears the typed
 * percent and typing clears the picked row, here and again in the API, so
 * nothing downstream has to decide which of two answers is the real one.
 */
export default function GstField({
  rates,
  value,
  onChange,
  label = 'GST',
  sx,
}: {
  rates: GstRate[];
  value: GstValue;
  onChange: (next: GstValue) => void;
  label?: string;
  sx?: object;
}) {
  const picked = value.gst_id ? (rates.find((r) => String(r.id) === value.gst_id) ?? null) : null;

  const labelOf = (rate: GstRate) => `${rate.name} — ${Number(rate.percent)}%`;

  return (
    <Autocomplete<GstRate, false, false, true>
      freeSolo
      options={rates}
      value={picked}
      // What is in the box: the chosen rate's name, or whatever was typed.
      inputValue={picked ? labelOf(picked) : value.gst_percent}
      getOptionLabel={(option) => (typeof option === 'string' ? option : labelOf(option))}
      isOptionEqualToValue={(option, chosen) =>
        typeof chosen === 'string' ? false : option.id === chosen.id
      }
      onChange={(_, next) => {
        if (next == null) return onChange({ gst_id: '', gst_percent: '' });
        // A string arrives when somebody types a rate and presses Enter.
        if (typeof next === 'string') {
          return onChange({ gst_id: '', gst_percent: onlyNumber(next) });
        }
        onChange({ gst_id: String(next.id), gst_percent: '' });
      }}
      onInputChange={(_, text, reason) => {
        // Typing is the custom rate. `reason` matters: the component also
        // reports the input changing when a value is picked or reset, and
        // treating those as typing would clear the row that was just chosen.
        if (reason !== 'input') return;
        onChange({ gst_id: '', gst_percent: onlyNumber(text) });
      }}
      sx={sx}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder={rates.length ? 'Pick one, or type a rate' : 'Type a rate'}
          /*
            The note is the mark in the box, as it is on every other field —
            slipped in ahead of the Autocomplete's own clear and open buttons
            rather than replacing them.
          */
          slotProps={{
            ...params.slotProps,
            input: {
              ...params.slotProps.input,
              endAdornment: (
                <>
                  {hintNode(
                    value.gst_percent !== ''
                      ? `${value.gst_percent || '0'}% for this record only.`
                      : rates.length === 0
                        ? 'No rates yet — add one under Master › GST, or type one.'
                        : 'Pick a rate from Master › GST, or type one for this record.',
                  )}
                  {params.slotProps.input.endAdornment}
                </>
              ),
            },
          }}
        />
      )}
    />
  );
}

/**
 * What somebody typed, as a rate.
 *
 * People type "18", "18%" and "18 %", and all three mean the same thing. The
 * percent sign and any stray letters come off; a decimal point stays, because
 * 12.5 is a real rate. Not parsed to a number here — a half-typed "18." has to
 * survive until the next keystroke.
 */
const onlyNumber = (text: string) => text.replace(/[^\d.]/g, '');
