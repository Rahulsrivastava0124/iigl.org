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
import RichTextField from '../components/RichTextField';
import BranchLaboratories from '../components/BranchLaboratories';
import { useToast } from '../components/Toast';
import { useFetch } from '../lib/useFetch';
import { api } from '../lib/api';
import { fileUrl } from '../lib/config';
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
  DateField,
  today,
} from '../components/ui';

/** True when the row's text contains the term. Case-insensitive; blank matches all. */
const hits = (term: string, ...fields: (string | number | null | undefined)[]) => {
  const q = term.trim().toLowerCase();
  if (!q) return true;
  return fields.some((f) => f != null && String(f).toLowerCase().includes(q));
};

type Section =
  | 'articles'
  | 'branches'
  | 'types'
  | 'banners'
  | 'reviews'
  | 'certificates'
  | 'gallery'
  | 'testimonials';

const SECTIONS: Array<{ id: Section; label: string; noun: string }> = [
  // The website's own order, as the sidebar lists them.
  { id: 'banners', label: 'Banners', noun: 'banner' },
  { id: 'types', label: 'Report Types', noun: 'report type' },
  { id: 'branches', label: 'Branches', noun: 'branch' },
  { id: 'reviews', label: 'Reviews', noun: 'review' },
  { id: 'certificates', label: 'Certificates', noun: 'certificate' },
  // The Education page's.
  { id: 'gallery', label: 'Course Gallery', noun: 'picture' },
  { id: 'testimonials', label: 'Testimonials', noun: 'testimonial' },
  { id: 'articles', label: 'Blog', noun: 'article' },
];

/** The permission each tab is: what head office can give its staff for it. */
const PERMISSION: Record<Section, ActionType> = {
  banners: 'website_home',
  branches: 'website_home',
  reviews: 'website_home',
  certificates: 'website_home',
  gallery: 'website_home',
  testimonials: 'website_home',
  types: 'website_report',
  articles: 'website_blog',
};

/** The sections edited on this page. Branches are a list of their own. */
type Edited = Exclude<Section, 'branches'>;

/** The sections whose rows can be deleted; the rest are only ever edited. */
type Deletable = Exclude<Edited, 'types' | 'articles'>;
const deletable = (s: Section): s is Deletable => !['types', 'articles', 'branches'].includes(s);

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
  reviews: '/content/reviews?kind=client',
  testimonials: '/content/reviews?kind=student',
  certificates: '/content/company-certificates',
  gallery: '/content/education-gallery',
};
const WRITE: Record<Edited, string> = {
  reviews: '/content/reviews',
  testimonials: '/content/reviews',
  certificates: '/content/company-certificates',
  gallery: '/content/education-gallery',
  banners: '/content/banners',
  types: '/content/report-types',
  articles: '/content/blogs',
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
  /** The picture's shape, as a CSS aspect-ratio. Landscape 16 / 9 unless given. */
  ratio?: string;
  /** A calendar date, `YYYY-MM-DD`. */
  date?: boolean;
  /** Formatted text, held as HTML. */
  rich?: boolean;
  /** What a new record starts with; a function for a value decided at the moment, like today. */
  initial?: string | (() => string);
}

/** A review's form: `who` is the line under the name — a client's profession, a student's course. */
const reviewFields = (who: string, whoHint: string): Field[] => [
  { key: 'name', label: 'Name', required: true },
  { key: 'trade', label: who, hint: whoHint },
  {
    key: 'rating',
    label: 'Rating',
    initial: '5',
    options: [
      ['5', '★★★★★'],
      ['4', '★★★★'],
      ['3', '★★★'],
      ['2', '★★'],
      ['1', '★'],
    ],
  },
  {
    key: 'status',
    label: 'Active',
    initial: '1',
    options: [
      ['1', 'Yes'],
      ['0', 'No'],
    ],
    hint: 'Only active ones show on the website.',
  },
  { key: 'quote', label: 'Review', required: true, long: true },
];

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
    { key: 'path', label: 'Image', image: 'banner', ratio: '8 / 3', hint: 'A wide picture — 1600 × 600 for the slider.' },
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
    { key: 'description', label: 'Description', rich: true },
    { key: 'banner', label: 'Banner image', image: 'website' },
  ],
  // The home page's Our Reviews cards, and the Education page's testimonials.
  reviews: reviewFields('Profession', 'Under the name. Eg. Jewellery Retailer.'),
  testimonials: reviewFields('Course', 'Under the name: the course they took.'),
  // The Education page's Course Gallery.
  gallery: [
    { key: 'title', label: 'Caption', hint: 'Optional. Shown over the picture.' },
    {
      key: 'status',
      label: 'Active',
      initial: '1',
      options: [
        ['1', 'Yes'],
        ['0', 'No'],
      ],
      hint: 'Only active pictures show on the website.',
    },
    { key: 'image', label: 'Picture', image: 'website', ratio: '4 / 3' },
  ],
  // The website's Our Company Certificates carousel.
  certificates: [
    {
      key: 'status',
      label: 'Active',
      initial: '1',
      options: [
        ['1', 'Yes'],
        ['0', 'No'],
      ],
      hint: 'Only active certificates show on the website.',
    },
    { key: 'image', label: 'Certificate image', image: 'website', ratio: '3 / 2', hint: 'A photo or scan of the certificate.' },
  ],
  articles: [
    { key: 'page_name', label: 'Title', required: true },
    {
      key: 'slug',
      label: 'Address',
      hint: "The end of the article's web address. Left blank, it is made from the title.",
    },
    // The article's card on the website.
    { key: 'excerpt', label: 'Short description', long: true, hint: 'The line under the title on the blog card.' },
    { key: 'category', label: 'Category', hint: 'Eg. Gemology, Diamonds, Jewellery.' },
    { key: 'author', label: 'Author' },
    { key: 'published_on', label: 'Publish date', date: true, initial: today, hint: 'Today by default. Change it to back-date an article; shown on the card.' },
    { key: 'meta_title', label: 'SEO title', hint: SEO_TITLE },
    { key: 'meta_description', label: 'Meta description', long: true, hint: SEO_LINE },
    { key: 'content', label: 'Content', rich: true },
    { key: 'thumbnail', label: 'Card image', image: 'website', hint: 'The picture on the blog card.' },
    { key: 'banner', label: 'Banner image', image: 'website', hint: 'The wide picture at the top of the article.' },
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
  const edited: Edited | null = section === 'branches' ? null : section;
  const fields = edited ? FIELDS[edited] : [];

  const [editing, setEditing] = useState<Editing | null>(null);
  // A form belongs to the table it was opened on: switching to another one —
  // by its tab or from the menu — closes it rather than carrying it across.
  useEffect(() => setEditing(null), [section]);
  const [deleting, setDeleting] = useState<{ section: Deletable; id: number; name: string | null } | null>(null);
  const deletingNoun = deleting ? SECTIONS.find((s) => s.id === deleting.section)!.noun : '';
  const DeletingNoun = deletingNoun.charAt(0).toUpperCase() + deletingNoun.slice(1);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');

  // One request per section, each idle until its tab is open, so a tab never
  // shows the last tab's rows while its own load.
  const articles = useFetch<{ data: any[] }>(section === 'articles' ? READ.articles : null);
  const types = useFetch<{ data: any[] }>(section === 'types' ? READ.types : null);
  const banners = useFetch<{ data: any[] }>(section === 'banners' ? READ.banners : null);
  const reviews = useFetch<{ data: any[] }>(section === 'reviews' ? READ.reviews : null);
  const certificates = useFetch<{ data: any[] }>(section === 'certificates' ? READ.certificates : null);
  const testimonials = useFetch<{ data: any[] }>(section === 'testimonials' ? READ.testimonials : null);
  const gallery = useFetch<{ data: any[] }>(section === 'gallery' ? READ.gallery : null);
  const source = { articles, types, banners, reviews, certificates, testimonials, gallery }[edited ?? 'banners'];

  /** The form for a row, or a blank one for the section in view. */
  const open = (row?: any) =>
    setEditing({
      section,
      id: row?.id,
      values: Object.fromEntries(
        fields.map((f) => [f.key, row ? (row[f.key] == null ? '' : String(row[f.key])) : (typeof f.initial === 'function' ? f.initial() : (f.initial ?? ''))]),
      ),
    });

  const set = (key: string, value: string) =>
    setEditing((e) => (e ? { ...e, values: { ...e.values, [key]: value } } : e));

  const save = async () => {
    if (!editing || !edited) return;
    setBusy(true);
    const body: Record<string, unknown> = { ...editing.values };
    if (deletable(edited)) body.status = editing.values.status !== '0';
    if (edited === 'reviews' || edited === 'testimonials') body.kind = edited === 'reviews' ? 'client' : 'student';

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

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.del(`${WRITE[deleting.section]}/${deleting.id}`);
      toast.ok(`${DeletingNoun} removed.`);
      setDeleting(null);
      ({ banners, reviews, certificates, testimonials, gallery })[deleting.section].reload();
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
    hits(search, r.page_name, r.page_type, r.name, r.slug, r.title, r.img_type, r.url, r.trade, r.quote, r.subtitle),
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
                {fields.filter((f) => !f.image).map((f) =>
                  f.rich ? (
                    <Box key={f.key} sx={{ gridColumn: '1 / -1' }}>
                      <RichTextField
                        label={f.label}
                        value={editing.values[f.key]}
                        onChange={(html) => set(f.key, html)}
                        helperText={f.hint}
                      />
                    </Box>
                  ) : f.date ? (
                    <DateField
                      key={f.key}
                      label={f.label}
                      value={editing.values[f.key].slice(0, 10)}
                      onChange={(value) => set(f.key, value)}
                      helperText={f.hint}
                    />
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
                {/* The pictures together on one row, each framed in its own shape;
                    they wrap under each other on a narrow screen. */}
                {fields.some((f) => f.image) && (
                  <Box sx={{ gridColumn: '1 / -1', display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                    {fields
                      .filter((f) => f.image)
                      .map((f) => (
                        <FileField
                          key={f.key}
                          label={f.label}
                          bucket={f.image!}
                          ratio={f.ratio ?? '16 / 9'}
                          value={editing.values[f.key] || null}
                          onChange={(path) => set(f.key, path ?? '')}
                          helperText={f.hint}
                        />
                      ))}
                  </Box>
                )}
              </FormPanel>
            )
          }
          title={label}
          count={source.loading ? 'Loading…' : `${rows.length} of ${all.length}`}
          actions={
            <>
              <SearchField value={search} onChange={setSearch} />
              {may(section, 'create') && (
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
                  {(section === 'reviews' || section === 'testimonials') && (
                    <>
                      <TableCell>Name</TableCell>
                      <TableCell>{section === 'reviews' ? 'Profession' : 'Course'}</TableCell>
                      <TableCell>Review</TableCell>
                      <TableCell>Rating</TableCell>
                      <TableCell>Active</TableCell>
                    </>
                  )}
                  {section === 'certificates' && (
                    <>
                      <TableCell>Certificate</TableCell>
                      <TableCell>Active</TableCell>
                    </>
                  )}
                  {section === 'gallery' && (
                    <>
                      <TableCell>Caption</TableCell>
                      <TableCell>Active</TableCell>
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
                        <TableCell>{String(r.published_on ?? r.created_at ?? '').slice(0, 10) || '—'}</TableCell>
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
                    {(section === 'reviews' || section === 'testimonials') && (
                      <>
                        <TableCell>{r.name}</TableCell>
                        <TableCell>{r.trade || '—'}</TableCell>
                        <TableCell sx={{ whiteSpace: 'normal', minWidth: 280 }}>{r.quote}</TableCell>
                        <TableCell sx={{ color: 'warning.main', whiteSpace: 'nowrap' }}>{'★'.repeat(r.rating)}</TableCell>
                        <TableCell>
                          <YesNo on={r.status} />
                        </TableCell>
                      </>
                    )}
                    {section === 'certificates' && (
                      <>
                        <TableCell>
                          {/* The picture is the certificate: it has no title of its own. */}
                          <Box
                            component="img"
                            src={fileUrl(r.image) ?? undefined}
                            alt=""
                            sx={{ display: 'block', width: 96, aspectRatio: '3 / 2', objectFit: 'cover', borderRadius: 1, border: 1, borderColor: 'divider' }}
                          />
                        </TableCell>
                        <TableCell>
                          <YesNo on={r.status} />
                        </TableCell>
                      </>
                    )}
                    {section === 'gallery' && (
                      <>
                        <TableCell sx={{ whiteSpace: 'normal', minWidth: 200 }}>{r.title || '—'}</TableCell>
                        <TableCell>
                          <YesNo on={r.status} />
                        </TableCell>
                      </>
                    )}
                    <TableCell>
                      <RowActions>
                        {may(section, 'update') && (
                          <IconAction label={`Edit ${noun}`} icon={EditIcon} onClick={() => open(r)} />
                        )}
                        {deletable(section) && may(section, 'delete') && (
                          <IconAction
                            label={`Delete ${noun}`}
                            icon={DeleteIcon}
                            danger
                            onClick={() => setDeleting({ section, id: r.id, name: r.name ?? r.title ?? null })}
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
        open={Boolean(deleting)}
        title={`Delete ${DeletingNoun}`}
        message={
          <>
            Are you sure you want to delete{' '}
            <strong>
              {deleting?.section === 'reviews' || deleting?.section === 'testimonials'
                ? `${deleting.name}’s ${deletingNoun}`
                : deleting?.name || `this ${deletingNoun}`}
            </strong>
            ?
          </>
        }
        warning="This action cannot be undone."
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        confirmLabel="Delete"
        confirmIcon={DeleteIcon}
        busy={busy}
      />
    </>
  );
}
