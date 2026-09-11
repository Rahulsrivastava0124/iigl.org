import { Router } from 'express';
import { wrap } from '../lib/async.js';
import { badRequest, forbidden } from '../lib/errors.js';
import { ROLE } from '../middleware/auth.js';
import { labStatements, statementHtml, statementPdf } from '../services/statement.service.js';

/**
 * A laboratory's commission statements.
 *
 * Head office names the laboratory with `lab_id`; a laboratory reads its own.
 * A laboratory's staff are told only where it stands — whether certificate
 * generation is locked — and not its commission figures.
 */
export const statementRoutes = Router();

const labOf = (req: { user: { roleId: number | null; labId: number | null }; query: Record<string, unknown> }) => {
  if (req.user.roleId === ROLE.SUPER) {
    const id = Number(req.query.lab_id);
    if (!Number.isInteger(id) || id < 1) throw badRequest('Name the laboratory with lab_id.');
    return id;
  }
  if (req.user.labId === null) throw forbidden('Your account is not linked to a laboratory.');
  return req.user.labId;
};

statementRoutes.get(
  '/',
  wrap(async (req, res) => {
    const book = await labStatements(labOf(req));
    const insider = req.user.roleId === ROLE.SUPER || req.user.roleId === ROLE.LAB;
    res.json({ data: insider ? book : { standing: book.standing } });
  }),
);

statementRoutes.get(
  '/:key/download',
  wrap(async (req, res) => {
    if (req.user.roleId !== ROLE.SUPER && req.user.roleId !== ROLE.LAB) {
      throw forbidden('Only the laboratory and head office can download its statements.');
    }
    const key = String(req.params.key);
    if (!/^\d{4}-\d{2}$/.test(key)) throw badRequest('The period is its first month, YYYY-MM.');
    const labId = labOf(req);
    const issuedBy = req.user.fullname ?? 'IIGL';

    if (req.query.format === 'html') {
      res.type('html').send(await statementHtml(labId, key, issuedBy));
      return;
    }
    const pdf = await statementPdf(labId, key, issuedBy);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="statement-${labId}-${key}.pdf"`);
    res.setHeader('Content-Length', String(pdf.length));
    res.end(pdf);
  }),
);
