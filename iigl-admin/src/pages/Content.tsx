import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box,
  Button,
  Chip,
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
import { useToast } from '../components/Toast';
import { useFetch } from '../lib/useFetch';
import { api } from '../lib/api';
import { messageOf } from '../lib/auth';
import {
  ConfirmDialog,
  FormPanel,
  IconAction,
  Panel,
  RowActions,
  SearchField,
  TableFrame,
  YesNo,
} from '../components/ui';

/** True when the row's text contains the term. Case-insensitive; blank matches all. */
const hits = (term: string, ...fields: (string | number | null | undefined)[]) => {
  const q = term.trim().toLowerCase();
  if (!q) return true;
  return fields.some((f) => f != null && String(f).toLowerCase().includes(q));
};

import FileField from '../components/FileField';
import AddIcon from '@mui/icons-material/AddOutlined';
import EditIcon from '@mui/icons-material/EditOutlined';
import DeleteIcon from '@mui/icons-material/DeleteOutlineOutlined';

type Section = 'articles' | 'branches' | 'types' | 'banners' | 'pages';

const SECTIONS: Array<{ id: Section; label: string }> = [
  { id: 'articles', label: 'Articles' },
  { id: 'branches', label: 'Branch pages' },
  { id: 'types', label: 'Certificate types' },
  { id: 'banners', label: 'Banners' },
  { id: 'pages', label: 'Static pages' },
];

/** An open editor: which section, which row, and the values being edited. */
interface Editing {
  section: Section;
  id?: number;
  values: Record<string, string>;
  image: string | null;
}

/**
 * An empty record for a section, which is the shape its form renders from.
 *
 * The form is a panel on the page rather than a dialog, so it needs these
 * fields before anyone has clicked anything — a dialog could wait until the
 * Add button said which section it was for.
 */
const blankFor = (section: Section): Record<string, string> =>
  section === 'articles'
    ? { page_name: '', slug: '', content: '', meta_title: '', meta_description: '' }
    : section === 'branches'
      ? { city: '', pageURL: '', h1: '', content: '', title: '', description: '' }
      : section === 'types'
        ? { name: '', short_description: '', description: '' }
        : { name: '', img_type: '', url: '' };

export default function Content() {
  const toast = useToast();
  // The sidebar links straight to a tab, so the URL decides which is open.
  const [params, setParams] = useSearchParams();
  const section = (params.get('tab') as Section) ?? 'articles';
  const setSection = (next: Section) => setParams({ tab: next });
  const [editing, setEditing] = useState<Editing | null>(null);
  const [deletingBanner, setDeletingBanner] = useState<{ id: number; name: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const articles = useFetch<{ data: any[] }>(section === 'articles' ? '/public/blogs' : null);
  const branches = useFetch<{ data: any[] }>(section === 'branches' ? '/public/branches' : null);
  const types = useFetch<{ data: any[] }>(section === 'types' ? '/public/report-types' : null);
  const banners = useFetch<{ data: any[] }>(section === 'banners' ? '/content/banners' : null);
  const pages = useFetch<{ data: any[] }>(section === 'pages' ? '/content/pages' : null);

  const source = { articles, branches, types, banners, pages }[section];

  const open = (values: Record<string, string>, id?: number, image: string | null = null) =>
    setEditing({ section, id, values, image });

  const clear = () => setEditing(null);

  /**
   * What the form is showing: the record being edited, or an empty one for the
   * section in view. Switching tabs drops an edit rather than carrying it over,
   * since the record belongs to the tab just left.
   */
  const form: Editing =
    editing && editing.section === section
      ? editing
      : { section, values: blankFor(section), image: null };

  const set = (key: string, v: string) =>
    setEditing((e) => {
      const base = e && e.section === section ? e : form;
      return { ...base, values: { ...base.values, [key]: v } };
    });

  const save = async () => {
    setBusy(true);

    const { section: s, id, values, image } = form;
    const paths: Record<Section, string> = {
      articles: '/content/blogs',
      branches: '/content/branches',
      types: '/content/report-types',
      banners: '/content/banners',
      pages: '/content/pages',
    };

    // Each section names its image column differently.
    const imageKey = { articles: 'banner', branches: 'img', types: 'banner', banners: 'path', pages: 'banner' }[s];
    const body: Record<string, unknown> = { ...values };
    if (image !== null || id) body[imageKey] = image;

    try {
      if (id) {
        await api.patch(`${paths[s]}/${id}`, body);
        toast.ok('Saved.');
      } else {
        await api.post(paths[s], body);
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
  const [search, setSearch] = useState('');
  // The four sections hold different shapes, so the search looks at whichever
  // of these a row happens to carry rather than at a fixed column list.
  const rows = all.filter((r: any) =>
    hits(search, r.id, r.page_name, r.slug, r.title, r.city, r.pageURL, r.h1, r.page_type, r.img_type),
  );

  return (
    <>

      <Tabs
        value={section}
        onChange={(_, v) => setSection(v)}
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        {SECTIONS.map((s) => (
          <Tab key={s.id} value={s.id} label={s.label} />
        ))}
      </Tabs>

      {editing && editing.section === section && (
        <FormPanel
          title={`${form.id ? 'Edit' : 'Add'} ${SECTIONS.find((s) => s.id === section)!.label.replace(/s$/, '').toLowerCase()}`}
          onClose={clear}
          onSubmit={save}
          submitLabel={form.id ? 'Save changes' : 'Add'}
          busy={busy}
        >
          {Object.keys(form.values).map((key) => {
              const long = key === 'content' || key === 'description';
              return (
                <TextField
                  key={key}
                  label={key.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())}
                  value={form.values[key]}
                  onChange={(e) => set(key, e.target.value)}
                  multiline={long}
                  minRows={long ? 4 : undefined}
                  // A body of text needs the width; a slug does not.
                  sx={long ? { gridColumn: '1 / -1' } : undefined}
                  required={['page_name', 'city', 'name', 'img_type'].includes(key)}
                />
              );
          })}

          <Box sx={{ gridColumn: '1 / -1' }}>
            <FileField
              label={section === 'banners' ? 'Image' : 'Banner image'}
              bucket={section === 'branches' || section === 'banners' ? 'banner' : 'website'}
              value={form.image}
              onChange={(path) => setEditing({ ...form, image: path })}
            />
          </Box>
        </FormPanel>
      )}

      <Panel
        title={SECTIONS.find((s) => s.id === section)?.label ?? 'Website content'}
        count={source.loading ? 'Loading…' : `${rows.length} of ${all.length}`}
        actions={
          <>
            <SearchField value={search} onChange={setSearch} />
            {/* `pages` is a fixed set of site pages — they are edited, never added. */}
            {section !== 'pages' && (
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => open(blankFor(section))}
              >
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
                {section === 'branches' && (
                  <>
                    <TableCell>City</TableCell>
                    <TableCell>Address</TableCell>
                    <TableCell>Page title</TableCell>
                  </>
                )}
                {section === 'types' && (
                  <>
                    <TableCell>Name</TableCell>
                    <TableCell>Summary</TableCell>
                  </>
                )}
                {section === 'banners' && (
                  <>
                    <TableCell>Name</TableCell>
                    <TableCell>Placement</TableCell>
                    <TableCell>Links to</TableCell>
                    <TableCell>Active</TableCell>
                  </>
                )}
                {section === 'pages' && (
                  <>
                    <TableCell>Page</TableCell>
                    <TableCell>Type</TableCell>
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
                  {section === 'branches' && (
                    <>
                      <TableCell>{r.city}</TableCell>
                      <TableCell className="mono">/{r.pageURL}</TableCell>
                      <TableCell sx={{ whiteSpace: 'normal', minWidth: 220 }}>{r.title ?? '—'}</TableCell>
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
                        <Chip size="small" variant="outlined" label={r.img_type} />
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
                    </>
                  )}
                  <TableCell>
                    <RowActions>
                      <IconAction
                        label="Edit"
                        icon={EditIcon}
                        onClick={() => {
                          const keys =
                            section === 'articles'
                              ? ['page_name', 'slug', 'content', 'meta_title', 'meta_description']
                              : section === 'branches'
                                ? ['city', 'pageURL', 'h1', 'content', 'title', 'description']
                                : section === 'types'
                                  ? ['name', 'short_description', 'description']
                                  : section === 'banners'
                                    ? ['name', 'img_type', 'url']
                                    : ['page_name', 'content', 'meta_title', 'meta_description'];
                          const values: Record<string, string> = {};
                          for (const k of keys) values[k] = r[k] ?? '';
                          const imageKey = {
                            articles: 'banner', branches: 'img', types: 'banner',
                            banners: 'path', pages: 'banner',
                          }[section];
                          open(values, r.id, r[imageKey] ?? null);
                        }}
                      />
                      {section === 'banners' && (
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

      {section === 'articles' && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
          The address is the public URL. Changing it breaks any existing link to that article, so it
          only moves when you edit it deliberately — renaming the title leaves it alone.
        </Typography>
      )}

      <ConfirmDialog
        open={Boolean(deletingBanner)}
        title="Delete Banner"
        message={<>Are you sure you want to delete <strong>{deletingBanner?.name}</strong>?</>}
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
