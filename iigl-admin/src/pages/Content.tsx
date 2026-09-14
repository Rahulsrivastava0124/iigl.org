import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box,
  Button,
  Chip,
  MenuItem,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/AddOutlined';
import EditIcon from '@mui/icons-material/EditOutlined';
import DeleteIcon from '@mui/icons-material/DeleteOutlineOutlined';
import FileField from '../components/FileField';
import BranchLaboratories from '../components/BranchLaboratories';
import WebsiteCustomers from '../components/WebsiteCustomers';
import { useToast } from '../components/Toast';
import { useFetch } from '../lib/useFetch';
import { api } from '../lib/api';
import { messageOf } from '../lib/auth';
import { usePermissions, type ActionType } from '../lib/permissions';
import {
  ConfirmDialog,
  FormPanel,
  IconAction,
  Panel,
  RowActions,
  SearchField,
  TableFrame,
  YesNo,
  hint,
} from '../components/ui';

/** True when the row's text contains the term. Case-insensitive; blank matches all. */
const hits = (term: string, ...fields: (string | number | null | undefined)[]) => {
  const q = term.trim().toLowerCase();
  if (!q) return true;
  return fields.some((f) => f != null && String(f).toLowerCase().includes(q));
};

type Section = 'articles' | 'branches' | 'customers' | 'types' | 'banners' | 'pages';

const SECTIONS: Array<{ id: Section; label: string; noun: string }> = [
  // The website's own order, as the sidebar lists them.
  { id: 'banners', label: 'Banners', noun: 'banner' },
  { id: 'types', label: 'Report Types', noun: 'report type' },
  { id: 'customers', label: 'Customers', noun: 'customer' },
  { id: 'branches', label: 'Branches', noun: 'branch' },
  { id: 'articles', label: 'Blog', noun: 'article' },
  { id: 'pages', label: 'Pages', noun: 'page' },
];

/** The permission each tab is: what head office can give its staff for it. */
const PERMISSION: Record<Section, ActionType> = {
  banners: 'website_home',
  customers: 'website_home',
  branches: 'website_home',
  pages: 'website_home',
  types: 'website_report',
  articles: 'website_blog',
};

/** The sections edited on this page. Branches and Customers are lists of their own. */
type Edited = Exclude<Section, 'branches' | 'customers'>;

/**
 * Where each section is read from and written to.
 *
 * The reads are the whole record, because the editor is filled from the list:
 * a list without the body saved every article and page back with it emptied.
 */
const READ: Record<Edited, string> = {
  banners: '/content/banners',
  types: '/public/report-types',
  articles: '/content/blogs',
  pages: '/content/pages',
};
const WRITE: Record<Edited, string> = {
  banners: '/content/banners',
  types: '/content/report-types',
  articles: '/content/blogs',
  pages: '/content/pages',
};

/**
 * One input of a section's form, named for the person filling it in rather than
 * for its column — "SEO title", not "Meta title". `image` makes it an upload
 * into that folder; `options` makes it a select.
 */
interface Field {
  key: string;
  label: string;
  required?: boolean;
  long?: boolean;
  hint?: string;
  options?: Array<[value: string, label: string]>;
  image?: 'website' | 'banner';
  initial?: string;
}

const SEO_TITLE = 'The title in the browser tab and in search results.';
const SEO_LINE = 'The line under the title in search results.';

const FIELDS: Record<Edited, Field[]> = {
  banners: [
    { key: 'name', label: 'Name', hint: 'Describes the picture to anyone who cannot see it.' },
    {
      key: 'img_type',
      label: 'Type',
      required: true,
      initial: 'slider',
      options: [
        ['slider', 'Slider — home page'],
        ['banner', 'Banner'],
      ],
    },
    { key: 'url', label: 'Link', hint: 'Where clicking the banner goes. Blank for nowhere.' },
    {
      key: 'status',
      label: 'Active',
      initial: '1',
      options: [
        ['1', 'Yes'],
        ['0', 'No'],
      ],
      hint: 'Only active banners show on the website.',
    },
    { key: 'path', label: 'Image', image: 'banner', hint: 'A wide picture — 1600 × 600 for the slider.' },
    {
      key: 'mobile_slider',
      label: 'Phone image',
      image: 'banner',
      hint: 'Shown on phones in place of the image above. Blank uses that one.',
    },
  ],
  types: [
    { key: 'name', label: 'Name', required: true },
    { key: 'short_description', label: 'Short description' },
    { key: 'description', label: 'Description', long: true },
    { key: 'banner', label: 'Banner image', image: 'website' },
  ],
  articles: [
    { key: 'page_name', label: 'Title', required: true },
    {
      key: 'slug',
      label: 'Address',
      hint: "The end of the article's web address. Left blank, it is made from the title.",
    },
    { key: 'meta_title', label: 'SEO title', hint: SEO_TITLE },
    { key: 'meta_description', label: 'Meta description', long: true, hint: SEO_LINE },
    { key: 'content', label: 'Content', long: true },
    { key: 'banner', label: 'Banner image', image: 'website' },
  ],
  pages: [
    { key: 'page_name', label: 'Page name', required: true },
    { key: 'meta_title', label: 'SEO title', hint: SEO_TITLE },
    { key: 'meta_description', label: 'Meta description', long: true, hint: SEO_LINE },
    { key: 'content', label: 'Content', long: true },
    { key: 'banner', label: 'Banner image', image: 'website' },
  ],
};

/** An open editor: which section, which row, and every input as a string. */
interface Editing {
  section: Section;
  id?: number;
  values: Record<string, string>;
}

export default function Content() {
  const toast = useToast();
  // Head office always holds all of these; its staff see the tabs they may view,
  // and the Add, Edit and Delete their grant allows.
  const { can } = usePermissions();
  const visible = SECTIONS.filter((s) => can(PERMISSION[s.id], 'view'));
  const may = (s: Section, a: 'create' | 'update' | 'delete') => can(PERMISSION[s], a);
  // The sidebar links straight to a tab, so the URL decides which is open.
  const [params, setParams] = useSearchParams();
  const asked = params.get('tab') as Section | null;
  const section: Section =
    asked && visible.some((s) => s.id === asked) ? asked : (visible[0]?.id ?? 'banners');
  const { label, noun } = SECTIONS.find((s) => s.id === section)!;
  const edited: Edited | null = section === 'branches' || section === 'customers' ? null : section;
  const fields = edited ? FIELDS[edited] : [];

  const [editing, setEditing] = useState<Editing | null>(null);
  // A form belongs to the table it was opened on: switching to another one —
  // by its tab or from the menu — closes it rather than carrying it across.
  useEffect(() => setEditing(null), [section]);
  const [deletingBanner, setDeletingBanner] = useState<{ id: number; name: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');

  // One request per section, each idle until its tab is open, so a tab never
  // shows the last tab's rows while its own load.
  const articles = useFetch<{ data: any[] }>(section === 'articles' ? READ.articles : null);
  const types = useFetch<{ data: any[] }>(section === 'types' ? READ.types : null);
  const banners = useFetch<{ data: any[] }>(section === 'banners' ? READ.banners : null);
  const pages = useFetch<{ data: any[] }>(section === 'pages' ? READ.pages : null);
  const source = { articles, types, banners, pages }[edited ?? 'banners'];

  /** The form for a row, or a blank one for the section in view. */
  const open = (row?: any) =>
    setEditing({
      section,
      id: row?.id,
      values: Object.fromEntries(
        fields.map((f) => [f.key, row ? (row[f.key] == null ? '' : String(row[f.key])) : (f.initial ?? '')]),
      ),
    });

  const set = (key: string, value: string) =>
    setEditing((e) => (e ? { ...e, values: { ...e.values, [key]: value } } : e));

  const save = async () => {
    if (!editing || !edited) return;
    setBusy(true);
    const body: Record<string, unknown> = { ...editing.values };
    if (edited === 'banners') body.status = editing.values.status !== '0';

    try {
      if (editing.id) {
        await api.patch(`${WRITE[edited]}/${editing.id}`, body);
        toast.ok('Saved.');
      } else {
        await api.post(WRITE[edited], body);
        toast.ok('Added.');
      }
      setEditing(null);
      source.reload();
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const removeBanner = async () => {
    if (!deletingBanner) return;
    setBusy(true);
    try {
      await api.del(`/content/banners/${deletingBanner.id}`);
      toast.ok('Banner removed.');
      setDeletingBanner(null);
      banners.reload();
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const all = source.data?.data ?? [];
  // The sections hold different shapes, so the search looks at whichever of
  // these a row happens to carry rather than at a fixed column list.
  const rows = all.filter((r: any) =>
    hits(search, r.page_name, r.page_type, r.name, r.slug, r.title, r.img_type, r.url),
  );

  return (
    <>
      <Tabs
        value={section}
        onChange={(_, v) => setParams({ tab: v })}
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        {visible.map((s) => (
          <Tab key={s.id} value={s.id} label={s.label} />
        ))}
      </Tabs>

      {/* Branches are the laboratories, ticked on and off rather than edited. */}
      {section === 'branches' ? (
        <BranchLaboratories readOnly={!may('branches', 'update')} />
      ) : section === 'customers' ? (
        <WebsiteCustomers readOnly={!may('customers', 'update')} />
      ) : (
        <Panel
          form={
            editing &&
            editing.section === section && (
              <FormPanel
                title={`${editing.id ? 'Edit' : 'Add'} ${noun}`}
                onClose={() => setEditing(null)}
                onSubmit={save}
                submitLabel={editing.id ? 'Save changes' : 'Add'}
                busy={busy}
              >
                {fields.map((f) =>
                  f.image ? (
                    <Box key={f.key} sx={{ gridColumn: '1 / -1' }}>
                      <FileField
                        label={f.label}
                        bucket={f.image}
                        value={editing.values[f.key] || null}
                        onChange={(path) => set(f.key, path ?? '')}
                        helperText={f.hint}
                      />
                    </Box>
                  ) : (
                    <TextField
                      key={f.key}
                      label={f.label}
                      value={editing.values[f.key]}
                      onChange={(e) => set(f.key, e.target.value)}
                      required={f.required}
                      select={Boolean(f.options)}
                      multiline={f.long}
                      minRows={f.long ? 3 : undefined}
                      // A body of text needs the width; a name does not.
                      sx={f.long ? { gridColumn: '1 / -1' } : undefined}
                      slotProps={f.hint ? hint(f.hint, Boolean(f.options)) : undefined}
                    >
                      {f.options?.map(([value, text]) => (
                        <MenuItem key={value} value={value}>
                          {text}
                        </MenuItem>
                      ))}
                    </TextField>
                  ),
                )}
              </FormPanel>
            )
          }
          title={label}
          count={source.loading ? 'Loading…' : `${rows.length} of ${all.length}`}
          actions={
            <>
              <SearchField value={search} onChange={setSearch} />
              {/* The pages are a fixed set of site pages — edited, never added. */}
              {section !== 'pages' && may(section, 'create') && (
                <Button variant="contained" startIcon={<AddIcon />} onClick={() => open()}>
                  Add
                </Button>
              )}
            </>
          }
        >
          <TableFrame loading={source.loading} error={source.error} empty={rows.length === 0}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  {section === 'articles' && (
                    <>
                      <TableCell>Title</TableCell>
                      <TableCell>Address</TableCell>
                      <TableCell>Published</TableCell>
                    </>
                  )}
                  {section === 'types' && (
                    <>
                      <TableCell>Name</TableCell>
                      <TableCell>Short description</TableCell>
                    </>
                  )}
                  {section === 'banners' && (
                    <>
                      <TableCell>Name</TableCell>
                      <TableCell>Type</TableCell>
                      <TableCell>Links to</TableCell>
                      <TableCell>Active</TableCell>
                    </>
                  )}
                  {section === 'pages' && (
                    <>
                      <TableCell>Page</TableCell>
                      <TableCell>Type</TableCell>
                      <TableCell>SEO title</TableCell>
                    </>
                  )}
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((r: any) => (
                  <TableRow key={r.id} hover>
                    {section === 'articles' && (
                      <>
                        <TableCell sx={{ whiteSpace: 'normal', minWidth: 200 }}>{r.page_name}</TableCell>
                        <TableCell className="mono">/{r.slug}</TableCell>
                        <TableCell>{String(r.created_at ?? '').slice(0, 10) || '—'}</TableCell>
                      </>
                    )}
                    {section === 'types' && (
                      <>
                        <TableCell>{r.name}</TableCell>
                        <TableCell sx={{ whiteSpace: 'normal', minWidth: 260 }}>
                          {r.short_description || '—'}
                        </TableCell>
                      </>
                    )}
                    {section === 'banners' && (
                      <>
                        <TableCell>{r.name || '—'}</TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            variant="outlined"
                            label={r.img_type === 'slider' ? 'Slider' : r.img_type === 'banner' ? 'Banner' : r.img_type}
                          />
                        </TableCell>
                        <TableCell className="mono">{r.url || '—'}</TableCell>
                        <TableCell>
                          <YesNo on={r.status} />
                        </TableCell>
                      </>
                    )}
                    {section === 'pages' && (
                      <>
                        <TableCell>{r.page_name}</TableCell>
                        <TableCell className="mono">{r.page_type}</TableCell>
                        <TableCell sx={{ whiteSpace: 'normal', minWidth: 200 }}>{r.meta_title || '—'}</TableCell>
                      </>
                    )}
                    <TableCell>
                      <RowActions>
                        {may(section, 'update') && (
                          <IconAction label={`Edit ${noun}`} icon={EditIcon} onClick={() => open(r)} />
                        )}
                        {section === 'banners' && may('banners', 'delete') && (
                          <IconAction
                            label="Delete banner"
                            icon={DeleteIcon}
                            danger
                            onClick={() => setDeletingBanner({ id: r.id, name: r.name })}
                          />
                        )}
                      </RowActions>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableFrame>
        </Panel>
      )}

      {section === 'articles' && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
          The address is the public URL. Changing it breaks any existing link to that article, so it only
          moves when you edit it deliberately — renaming the title leaves it alone.
        </Typography>
      )}

      <ConfirmDialog
        open={Boolean(deletingBanner)}
        title="Delete Banner"
        message={
          <>
            Are you sure you want to delete <strong>{deletingBanner?.name || 'this banner'}</strong>?
          </>
        }
        warning="This action cannot be undone."
        onClose={() => setDeletingBanner(null)}
        onConfirm={removeBanner}
        confirmLabel="Delete"
        confirmIcon={DeleteIcon}
        busy={busy}
      />
    </>
  );
}
