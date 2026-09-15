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
  whatsapp: string | null;
  facebook: string | null;
  instagram: string | null;
}

type Form = { banner: string | null; content: string; gallery: string[]; whatsapp: string; facebook: string; instagram: string };

const GALLERY_MAX = 24;

const toForm = (p: Profile): Form => ({
  banner: p.banner,
  content: p.content ?? '',
  gallery: p.gallery ?? [],
  whatsapp: p.whatsapp ?? '',
  facebook: p.facebook ?? '',
  instagram: p.instagram ?? '',
});

/** Which part of a page a screen edits. A branch page is all of it. */
type Section = 'all' | 'social' | 'gallery';

/** The fields each section saves. Only those are sent: the API changes what it is sent. */
const SAVES: Record<Section, Array<keyof Form>> = {
  all: ['banner', 'content', 'gallery', 'whatsapp', 'facebook', 'instagram'],
  social: ['whatsapp', 'facebook', 'instagram'],
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
    section === 'social'
      ? 'Social Media'
      : section === 'gallery'
        ? 'Gallery'
        : labId
          ? `Website page — ${lab?.fullname ?? 'Laboratory'}`
          : 'Branch page';
  const shows = (part: Section) => section === 'all' || section === part;

  // Head office has no branch page of its own: its settings are the two screens.
  if (section === 'all' && !labId && isSuper(user)) return <Navigate to="/site/social" replace />;

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

            {shows('social') && (
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
