import { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { Box, Button, IconButton, Stack, TextField, Tooltip, Typography } from '@mui/material';
import SaveIcon from '@mui/icons-material/SaveOutlined';
import RemoveIcon from '@mui/icons-material/CloseOutlined';
import FileField from '../components/FileField';
import RichTextField from '../components/RichTextField';
import { useToast } from '../components/Toast';
import { Panel, hint } from '../components/ui';
import { api } from '../lib/api';
import { messageOf, useAuth } from '../lib/auth';
import { fileUrl } from '../lib/config';
import { isSuper } from '../lib/portal';
import { useFetch } from '../lib/useFetch';

interface Profile {
  banner: string | null;
  content: string;
  gallery: string[];
  owner_name: string | null;
  owner_photo: string | null;
  certificate: string | null;
  whatsapp: string | null;
  facebook: string | null;
  instagram: string | null;
}

type Form = {
  banner: string | null;
  content: string;
  gallery: string[];
  owner_name: string;
  owner_photo: string | null;
  certificate: string | null;
  whatsapp: string;
  facebook: string;
  instagram: string;
};

const GALLERY_MAX = 24;

const toForm = (p: Profile): Form => ({
  banner: p.banner,
  content: p.content ?? '',
  gallery: p.gallery ?? [],
  owner_name: p.owner_name ?? '',
  owner_photo: p.owner_photo ?? null,
  certificate: p.certificate ?? null,
  whatsapp: p.whatsapp ?? '',
  facebook: p.facebook ?? '',
  instagram: p.instagram ?? '',
});

/** Which part of a page a screen edits. A branch page is all of it. */
type Section = 'all' | 'gallery';

/*
  There is no 'social' section any more.

  Head office used to edit its three social links here, on a screen of its own,
  because they are stored beside its banner and gallery. They are company
  details — the same kind of thing as the company's phone number — so they live
  in Settings -> Company now, and `/site/social` redirects there.

  A **laboratory** still edits its own on its branch page, which is what the
  'all' section is: those links are that laboratory's, not the company's.
*/
/** The fields each section saves. Only those are sent: the API changes what it is sent. */
const SAVES: Record<Section, Array<keyof Form>> = {
  all: [
    'banner',
    'content',
    'gallery',
    'owner_name',
    'owner_photo',
    'certificate',
    'whatsapp',
    'facebook',
    'instagram',
  ],
  gallery: ['gallery'],
};

/**
 * A website page's own settings.
 *
 * `/site` is a laboratory's branch page — banner, content, gallery and social
 * links. `/site/:labId` is head office editing one laboratory's. Head office's
 * own is two screens, `/site/social` and `/site/gallery`: only its social links
 * and its gallery.
 */
export default function SiteProfile({ section = 'all' }: { section?: Section }) {
  const { labId } = useParams<{ labId?: string }>();
  const { user } = useAuth();
  const toast = useToast();
  const path = labId ? `/site/profile/${labId}` : '/site/profile';
  const source = useFetch<{ data: Profile }>(path);
  // The laboratory's name, when head office opens one.
  const labs = useFetch<{ data: Array<{ id: number; fullname: string; show_on_site: number }> }>(
    labId ? '/content/branch-laboratories' : null,
  );
  const lab = labs.data?.data.find((l) => String(l.id) === labId);

  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setForm(null), [path]);
  useEffect(() => {
    if (source.data && !form) setForm(toForm(source.data.data));
  }, [source.data, form]);

  const save = async () => {
    if (!form) return;
    setBusy(true);
    try {
      const body = Object.fromEntries(SAVES[section].map((key) => [key, form[key]]));
      const saved = await api.put<{ data: Profile }>(path, body);
      setForm(toForm(saved.data));
      toast.ok('Website page saved.');
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const title =
    section === 'gallery'
      ? 'Gallery'
      : labId
        ? `Website page — ${lab?.fullname ?? 'Laboratory'}`
        : 'Branch page';
  const shows = (part: Section) => section === 'all' || section === part;

  // Head office has no branch page of its own: its gallery is a screen here and
  // its social links are in Settings.
  if (section === 'all' && !labId && isSuper(user)) return <Navigate to="/site/gallery" replace />;

  return (
    <Panel title={title}>
      <Box sx={{ p: 2 }}>
        {!form ? (
          <Typography color={source.error ? 'error' : 'text.secondary'}>{source.error ?? 'Loading…'}</Typography>
        ) : (
          <Box
            component="form"
            onSubmit={(e: React.FormEvent) => {
              e.preventDefault();
              save();
            }}
            sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2 }}
          >
            {/* The pictures side by side: the banner, and the slot that adds to the gallery. */}
            {shows('gallery') && (
            <Box sx={{ gridColumn: '1 / -1', display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              {section === 'all' && (
                <FileField
                  label="Banner"
                  bucket="banner"
                  ratio="8 / 3"
                  value={form.banner}
                  onChange={(banner) => setForm({ ...form, banner })}
                  helperText="The wide picture at the top of the page — 1600 × 600."
                />
              )}
              <FileField
                label="Add to gallery"
                bucket="banner"
                ratio="4 / 3"
                multiple
                value={null}
                onChange={(picture) =>
                  picture &&
                  setForm((f) =>
                    f && f.gallery.length < GALLERY_MAX && !f.gallery.includes(picture)
                      ? { ...f, gallery: [...f.gallery, picture] }
                      : f,
                  )
                }
                helperText={`Choose or drop several at once; each joins the gallery below — up to ${GALLERY_MAX}.`}
              />
            </Box>
            )}

            {shows('gallery') && (
            <Box sx={{ gridColumn: '1 / -1' }}>
              <Typography sx={{ fontSize: 13, fontWeight: 500, color: 'text.secondary', mb: 1 }}>
                Gallery ({form.gallery.length})
              </Typography>
              {form.gallery.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No pictures yet.
                </Typography>
              ) : (
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                  {form.gallery.map((picture) => (
                    <Box key={picture} sx={{ position: 'relative', width: 180 }}>
                      <Box
                        component="img"
                        src={fileUrl(picture) ?? undefined}
                        alt=""
                        sx={{
                          display: 'block',
                          width: '100%',
                          aspectRatio: '4 / 3',
                          objectFit: 'cover',
                          borderRadius: 1,
                          border: 1,
                          borderColor: 'divider',
                        }}
                      />
                      <Tooltip title="Remove from gallery" describeChild>
                        <IconButton
                          size="small"
                          aria-label="Remove from gallery"
                          onClick={() => setForm({ ...form, gallery: form.gallery.filter((g) => g !== picture) })}
                          sx={{
                            position: 'absolute',
                            top: 6,
                            right: 6,
                            bgcolor: 'background.paper',
                            '&:hover': { bgcolor: 'background.paper' },
                          }}
                        >
                          <RemoveIcon fontSize="small" color="error" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
            )}

            {section === 'all' && (
              <Box sx={{ gridColumn: '1 / -1' }}>
                <RichTextField
                  label="Content"
                  value={form.content}
                  onChange={(content) => setForm({ ...form, content })}
                  helperText="What the page says under its name."
                />
              </Box>
            )}

            {/* The owner shown on the branch page, and the branch's own
                certificate — its accreditation, printed under the details. */}
            {section === 'all' && (
              <TextField
                label="Owner name"
                value={form.owner_name}
                onChange={(e) => setForm({ ...form, owner_name: e.target.value })}
                slotProps={hint('The person shown as the branch owner on its page.')}
              />
            )}
            {section === 'all' && (
              <FileField
                label="Owner photo"
                bucket="banner"
                ratio="1 / 1"
                value={form.owner_photo}
                onChange={(owner_photo) => setForm({ ...form, owner_photo })}
                helperText="A portrait of the owner. Square looks best."
              />
            )}
            {section === 'all' && (
              <FileField
                label="Certificate"
                bucket="banner"
                ratio="4 / 3"
                value={form.certificate}
                onChange={(certificate) => setForm({ ...form, certificate })}
                helperText="The branch's accreditation certificate, as an image."
              />
            )}

            {/*
              A laboratory's own links, on its branch page. Head office's three
              are in Settings -> Company — `section` is never 'social' now, so
              this shows on the branch page and on head office editing one.
            */}
            {section === 'all' && (
            <>
            <TextField
              label="WhatsApp number"
              placeholder="91 98765 43210"
              value={form.whatsapp}
              onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
              slotProps={hint('With the country code. The website opens a WhatsApp chat on it.')}
            />
            <TextField
              label="Facebook link"
              placeholder="https://facebook.com/…"
              value={form.facebook}
              onChange={(e) => setForm({ ...form, facebook: e.target.value })}
              slotProps={hint('The page’s full link, on facebook.com.')}
            />
            <TextField
              label="Instagram link"
              placeholder="https://instagram.com/…"
              value={form.instagram}
              onChange={(e) => setForm({ ...form, instagram: e.target.value })}
              slotProps={hint('The profile’s full link, on instagram.com.')}
            />
            </>
            )}

            <Stack direction="row" sx={{ gridColumn: '1 / -1', justifyContent: 'flex-end' }}>
              <Button type="submit" variant="contained" startIcon={<SaveIcon />} disabled={busy}>
                {busy ? 'Saving…' : 'Save'}
              </Button>
            </Stack>
          </Box>
        )}
      </Box>
    </Panel>
  );
}
