import type { ReactNode } from 'react';
import { Box, Paper, Typography } from '@mui/material';

/**
 * The card the three signed-out pages are made of: sign in, forgotten
 * password, and choosing a new one.
 *
 * They are one design — logo, title, a line of explanation, a form — and were
 * three copies of the same forty lines until this existed. Only the contents
 * differ, so only the contents live in the pages.
 */
export default function AuthCard({
  title,
  subtitle,
  onSubmit,
  children,
  footer,
}: {
  title: string;
  subtitle?: ReactNode;
  /** Omitted on a page with nothing to submit, which then renders no form. */
  onSubmit?: (e: React.FormEvent) => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        p: 3,
        bgcolor: 'background.default',
      }}
    >
      <Paper
        variant="outlined"
        {...(onSubmit ? { component: 'form' as const, onSubmit } : {})}
        sx={{
          width: '100%',
          maxWidth: 420,
          // Generous vertical padding: the card is the only thing on the page,
          // so it should feel like a destination rather than a widget.
          px: { xs: 4, sm: 6 },
          py: 6,
          textAlign: 'center',
          borderTop: 4,
          borderTopColor: 'primary.main',
        }}
      >
        <Box
          component="img"
          src="/logo.png"
          alt="IIGL"
          sx={{ height: 84, width: 'auto', mx: 'auto', mb: 3, display: 'block' }}
        />

        <Typography variant="h1" sx={{ mb: 1 }}>
          {title}
        </Typography>
        {subtitle && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
            {subtitle}
          </Typography>
        )}

        {/* Fields read left-aligned even inside a centred card: a label above a
            box belongs over its left edge, and centred input text is hard to
            scan while typing. */}
        {children}

        {footer && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 4 }}>
            {footer}
          </Typography>
        )}
      </Paper>
    </Box>
  );
}
