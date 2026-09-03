import { Autocomplete, TextField } from '@mui/material';
import { hintNode } from './ui';
import { useFetch } from '../lib/useFetch';

/**
 * Where an enquiry came from.
 *
 * The options are the **Enquiry type** master list — Master › Enquiry Type —
 * so head office maintains them without a deploy, rather than four words
 * hardcoded here. Only the active rows are offered; a retired one stays
 * readable on the enquiries that already name it.
 *
 * `freeSolo`, not a plain select, for two reasons and both are about data that
 * already exists: a select renders nothing for a value that is not on its list,
 * so the rows holding `web` and `test` would show blank and be silently
 * rewritten by the next save; and a source nobody anticipated should be
 * recordable without opening a master screen first.
 *
 * The **label** is stored, not the code. This column is read by people, on a
 * statement and in a list, and `ask` says less than `Ask me`.
 */
interface EnquiryType {
  id: number;
  code: string;
  label: string;
}

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
  const types = useFetch<{ data: EnquiryType[] }>('/master/enquiry-types?active=1');
  const options = (types.data?.data ?? []).map((t) => t.label);

  return (
    <Autocomplete<string, false, false, true>
      freeSolo
      options={options}
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
          placeholder={
            options.length ? 'Pick one, or type where it came from' : 'Where it came from'
          }
          slotProps={{
            ...params.slotProps,
            input: {
              ...params.slotProps.input,
              endAdornment: (
                <>
                  {hintNode(
                    options.length
                      ? 'From Master › Enquiry Type — or type anything else.'
                      : 'No enquiry types yet. Add them under Master › Enquiry Type, or type one.',
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
