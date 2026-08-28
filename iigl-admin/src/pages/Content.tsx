import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Button,
  Chip,
  Stack,
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
import { useFetch } from '../lib/useFetch';
import { api } from '../lib/api';
import { messageOf } from '../lib/auth';
import { Dialog, IconAction, Notice, Panel, RowActions, TableFrame, YesNo } from '../components/ui';
import FileField from '../components/FileField';
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

export default function Content() {
  // The sidebar links straight to a tab, so the URL decides which is open.
  const [params, setParams] = useSearchParams();
  const section = (params.get('tab') as Section) ?? 'articles';
  const setSection = (next: Section) => setParams({ tab: next });
  const [editing, setEditing] = useState<Editing | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const articles = useFetch<{ data: any[] }>(section === 'articles' ? '/public/blogs' : null);
  const branches = useFetch<{ data: any[] }>(section === 'branches' ? '/public/branches' : null);
  const types = useFetch<{ data: any[] }>(section === 'types' ? '/public/report-types' : null);
  const banners = useFetch<{ data: any[] }>(section === 'banners' ? '/content/banners' : null);
  const pages = useFetch<{ data: any[] }>(section === 'pages' ? '/content/pages' : null);

  const source = { articles, branches, types, banners, pages }[section];

  const open = (values: Record<string, string>, id?: number, image: string | null = null) =>
    setEditing({ section, id, values, image });

  const set = (key: string, v: string) =>
    setEditing((e) => (e ? { ...e, values: { ...e.values, [key]: v } } : e));

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    setErr(null);
    setMsg(null);

    const { section: s, id, values, image } = editing;
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
        setMsg('Saved.');
      } else {
        await api.post(paths[s], body);
        setMsg('Added.');
      }
      setEditing(null);
      source.reload();
    } catch (e) {
      setErr(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const removeBanner = async (id: number) => {
    setErr(null);
    try {
      await api.del(`/content/banners/${id}`);
      setMsg('Banner removed.');
      banners.reload();
    } catch (e) {
      setErr(messageOf(e));
    }
  };

  const rows = source.data?.data ?? [];

  return (
    <>
      {msg && <Notice kind="ok">{msg}</Notice>}
      {err && <Notice kind="error">{err}</Notice>}

      <Tabs
        value={section}
        onChange={(_, v) => setSection(v)}
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        {SECTIONS.map((s) => (
          <Tab key={s.id} value={s.id} label={s.label} />
        ))}
      </Tabs>

      <Panel
        title={SECTIONS.find((s) => s.id === section)?.label ?? 'Website content'}
        actions={
          section !== 'pages' && (
            <Button
              size="small"
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() =>
                open(
                  section === 'articles'
                    ? { page_name: '', slug: '', content: '', meta_title: '', meta_description: '' }
                    : section === 'branches'
                      ? { city: '', pageURL: '', h1: '', content: '', title: '', description: '' }
                      : section === 'types'
                        ? { name: '', short_description: '', description: '' }
                        : { name: '', img_type: '', url: '' },
                )
              }
            >
              Add
            </Button>
          )
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
                          onClick={() => removeBanner(r.id)}
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

      {editing && (
        <Dialog
          title={`${editing.id ? 'Edit' : 'Add'} ${SECTIONS.find((s) => s.id === editing.section)!.label.replace(/s$/, '').toLowerCase()}`}
          onClose={() => setEditing(null)}
          onSubmit={save}
          busy={busy}
        >
          <Stack spacing={2}>
            {Object.keys(editing.values).map((key) => {
              const long = key === 'content' || key === 'description';
              return (
                <TextField
                  key={key}
                  label={key.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())}
                  value={editing.values[key]}
                  onChange={(e) => set(key, e.target.value)}
                  multiline={long}
                  minRows={long ? 4 : undefined}
                  required={['page_name', 'city', 'name', 'img_type'].includes(key)}
                  helperText={
                    key === 'slug' || key === 'pageURL'
                      ? 'The public address. Leave blank when adding and it is made from the title.'
                      : key === 'img_type'
                        ? 'Where on the site this banner appears.'
                        : undefined
                  }
                />
              );
            })}

            <FileField
              label={editing.section === 'banners' ? 'Image' : 'Banner image'}
              bucket={editing.section === 'branches' || editing.section === 'banners' ? 'banner' : 'website'}
              value={editing.image}
              onChange={(path) => setEditing((e) => (e ? { ...e, image: path } : e))}
            />
          </Stack>
        </Dialog>
      )}
    </>
  );
}
