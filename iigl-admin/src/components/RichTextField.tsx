import { useEffect } from 'react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import { Box, FormHelperText, IconButton, MenuItem, Select, Stack, Tooltip, Typography } from '@mui/material';
import type { SvgIconComponent } from '@mui/icons-material';
import BoldIcon from '@mui/icons-material/FormatBold';
import ItalicIcon from '@mui/icons-material/FormatItalic';
import UnderlineIcon from '@mui/icons-material/FormatUnderlined';
import AlignLeftIcon from '@mui/icons-material/FormatAlignLeft';
import AlignCenterIcon from '@mui/icons-material/FormatAlignCenter';
import AlignRightIcon from '@mui/icons-material/FormatAlignRight';
import AlignJustifyIcon from '@mui/icons-material/FormatAlignJustify';
import UndoIcon from '@mui/icons-material/Undo';
import RedoIcon from '@mui/icons-material/Redo';

const ALIGNS = [
  { value: 'left', label: 'Align left', icon: AlignLeftIcon },
  { value: 'center', label: 'Align centre', icon: AlignCenterIcon },
  { value: 'right', label: 'Align right', icon: AlignRightIcon },
  { value: 'justify', label: 'Justify', icon: AlignJustifyIcon },
] as const;

const BLOCKS = [
  { value: 'p', label: 'Normal' },
  { value: '1', label: 'Heading 1' },
  { value: '2', label: 'Heading 2' },
  { value: '3', label: 'Heading 3' },
] as const;

/**
 * A formatted text field: bold, italic, underline, alignment, undo and redo, and
 * Normal or a heading — the toolbar the old admin's editors had, on Tiptap.
 *
 * Holds HTML, as those editors saved it. An empty document is '' rather than
 * `<p></p>`, so a field nobody typed in is still blank to the API.
 */
export default function RichTextField({
  label,
  value,
  onChange,
  helperText,
  disabled = false,
  minHeight = 140,
}: {
  label: string;
  value: string;
  onChange: (html: string) => void;
  helperText?: string;
  disabled?: boolean;
  minHeight?: number;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
    ],
    content: value || '',
    editable: !disabled,
    shouldRerenderOnTransaction: false,
    onUpdate: ({ editor: e }) => onChange(e.isEmpty ? '' : e.getHTML()),
  });

  // Another record opened into the same form: show its text, without that
  // counting as an edit.
  useEffect(() => {
    if (!editor) return;
    const current = editor.isEmpty ? '' : editor.getHTML();
    if ((value || '') !== current) editor.commands.setContent(value || '', { emitUpdate: false });
  }, [editor, value]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e?.isActive('bold') ?? false,
      italic: e?.isActive('italic') ?? false,
      underline: e?.isActive('underline') ?? false,
      align: ALIGNS.find((a) => e?.isActive({ textAlign: a.value }))?.value ?? 'left',
      block: ([1, 2, 3] as const).find((level) => e?.isActive('heading', { level }))?.toString() ?? 'p',
      undo: e?.can().undo() ?? false,
      redo: e?.can().redo() ?? false,
    }),
  });

  const tool = (name: string, Icon: SvgIconComponent, active: boolean, run: () => void, enabled = true) => (
    // describeChild: the button already carries the name, so the tooltip only describes it.
    <Tooltip title={name} key={name} describeChild>
      <span>
        <IconButton
          size="small"
          aria-label={name}
          aria-pressed={active}
          color={active ? 'primary' : 'default'}
          disabled={disabled || !enabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={run}
          sx={{ borderRadius: 1, bgcolor: active ? 'action.selected' : undefined }}
        >
          <Icon fontSize="small" />
        </IconButton>
      </span>
    </Tooltip>
  );

  const chain = () => editor!.chain().focus();

  return (
    <Box>
      <Typography sx={{ fontSize: 13, fontWeight: 500, color: 'text.secondary', mb: 0.75 }}>{label}</Typography>
      <Box
        sx={{
          border: 1,
          borderColor: 'divider',
          borderRadius: 1,
          bgcolor: disabled ? 'action.disabledBackground' : 'background.paper',
          '&:focus-within': { borderColor: 'primary.main', boxShadow: (t) => `0 0 0 1px ${t.palette.primary.main}` },
        }}
      >
        <Stack
          direction="row"
          spacing={0.25}
          sx={{ alignItems: 'center', flexWrap: 'wrap', px: 1, py: 0.5, borderBottom: 1, borderColor: 'divider' }}
        >
          {editor && state && (
            <>
              {tool('Bold', BoldIcon, state.bold, () => chain().toggleBold().run())}
              {tool('Italic', ItalicIcon, state.italic, () => chain().toggleItalic().run())}
              {tool('Underline', UnderlineIcon, state.underline, () => chain().toggleUnderline().run())}
              <Box sx={{ width: 8 }} />
              {ALIGNS.map((a) => tool(a.label, a.icon, state.align === a.value, () => chain().setTextAlign(a.value).run()))}
              <Box sx={{ width: 8 }} />
              {tool('Undo', UndoIcon, false, () => chain().undo().run(), state.undo)}
              {tool('Redo', RedoIcon, false, () => chain().redo().run(), state.redo)}
              <Select
                size="small"
                value={state.block}
                disabled={disabled}
                onChange={(e) => {
                  const block = e.target.value;
                  if (block === 'p') chain().setParagraph().run();
                  else chain().setHeading({ level: Number(block) as 1 | 2 | 3 }).run();
                }}
                inputProps={{ 'aria-label': 'Text style' }}
                sx={{ ml: 1, minWidth: 130, fontSize: 13.5, '& .MuiSelect-select': { py: 0.5 } }}
              >
                {BLOCKS.map((b) => (
                  <MenuItem key={b.value} value={b.value}>
                    {b.label}
                  </MenuItem>
                ))}
              </Select>
            </>
          )}
        </Stack>
        <Box
          sx={{
            px: 1.5,
            py: 1,
            fontSize: 14,
            '& .tiptap': { minHeight, outline: 'none' },
            '& .tiptap p': { my: 0.5 },
            '& .tiptap h1': { fontSize: 22, my: 1 },
            '& .tiptap h2': { fontSize: 18, my: 1 },
            '& .tiptap h3': { fontSize: 16, my: 1 },
          }}
        >
          <EditorContent editor={editor} />
        </Box>
      </Box>
      {helperText && <FormHelperText>{helperText}</FormHelperText>}
    </Box>
  );
}
