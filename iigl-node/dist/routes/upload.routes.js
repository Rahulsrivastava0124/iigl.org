import { Router } from 'express';
import { wrap } from '../lib/async.js';
import { badRequest } from '../lib/errors.js';
import { requireLabScope, ROLE } from '../middleware/auth.js';
import { BUCKETS, isBucket, MAX_UPLOAD_BYTES, storedPath, upload } from '../services/upload.service.js';
export const uploadRoutes = Router();
uploadRoutes.use(requireLabScope);
/** Buckets only an administrator may write to: site content, not lab work. */
const ADMIN_ONLY = new Set(['banner', 'icon', 'website', 'signature', 'documentation']);
/**
 * Accepts one or more files and returns the paths to store on a record.
 *
 * Uploading and attaching are deliberately separate: a certificate form holds
 * several images and is saved once, so the images go up as they are chosen and
 * the paths are submitted with the rest of the form.
 *
 * Nothing here writes to a business table. An orphaned file costs disk; a
 * half-written certificate costs a reissue.
 */
uploadRoutes.post('/:bucket', (req, res, next) => {
    const bucket = String(req.params.bucket);
    if (!isBucket(bucket)) {
        return next(badRequest(`Unknown upload type. Expected one of: ${Object.keys(BUCKETS).join(', ')}.`));
    }
    if (ADMIN_ONLY.has(bucket) && req.user.roleId !== ROLE.SUPER) {
        return next(badRequest('Only an administrator can upload this kind of file.'));
    }
    next();
}, upload.array('files', 10), wrap(async (req, res) => {
    const files = req.files ?? [];
    if (files.length === 0) {
        throw badRequest('Attach at least one file, in a field named "files".');
    }
    const bucket = String(req.params.bucket);
    res.status(201).json({
        data: files.map((f) => ({
            path: storedPath(bucket, f.filename),
            original_name: f.originalname,
            bytes: f.size,
            mime: f.mimetype,
        })),
    });
}));
/** What the client needs to validate a file before sending it. */
uploadRoutes.get('/', (_req, res) => {
    res.json({
        data: {
            buckets: Object.keys(BUCKETS),
            max_bytes: MAX_UPLOAD_BYTES,
            accepts: {
                documentation: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'],
                default: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
            },
            field_name: 'files',
        },
    });
});
