import { Router } from 'express';
import { wrap } from '../lib/async.js';
import { requireAdmin } from '../middleware/auth.js';
import { allSettings, saveSettings } from '../services/settings.service.js';

/**
 * Settings.
 *
 * One resource, not one per group: the screen reads them all at once and saves
 * whichever it changed, and a group is only the part of a key before the dot.
 *
 * Administrators only. These decide what customers are billed and what is
 * printed on a certificate.
 */
export const settingsRoutes = Router();
settingsRoutes.use(requireAdmin);

/** Every setting, its value, its default, and whether it has been set. */
settingsRoutes.get(
  '/',
  wrap(async (_req, res) => {
    res.json({ data: await allSettings() });
  }),
);

/**
 * Saves the ones sent. An empty value puts a setting back to its default
 * rather than storing an empty string — except a secret, where empty means
 * "leave what is stored", so the form never has to echo a password back.
 */
settingsRoutes.patch(
  '/',
  wrap(async (req, res) => {
    const written = await saveSettings((req.body ?? {}) as Record<string, unknown>, req.user.id);
    res.json({ data: { written } });
  }),
);
