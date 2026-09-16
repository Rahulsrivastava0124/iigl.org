import { Router } from 'express';
import { wrap } from '../lib/async.js';
import { requireAdmin, requireLabScope } from '../middleware/auth.js';
import {
  assertMayReadPayment,
  confirmPayment,
  paymentConfig,
  startCommissionPayment,
  startEnrolmentPayment,
  startRegistrationPayment,
} from '../services/payment.service.js';

/**
 * Online payment through Cashfree, for signed-in accounts. The website's own
 * (no session) endpoints and Cashfree's webhook are in public.routes.ts.
 *
 * Starting a payment returns the Cashfree `payment_session_id` the panel opens
 * the checkout with; nothing is recorded as paid until `confirm` has read the
 * order back from Cashfree.
 */
export const paymentRoutes = Router();
paymentRoutes.use(requireLabScope);

/** Whether online payment is set up, and whether it is test mode. */
paymentRoutes.get('/config', (_req, res) => {
  res.json({ data: paymentConfig() });
});

/** A laboratory paying commission to head office online. */
paymentRoutes.post(
  '/commission',
  wrap(async (req, res) => {
    res.status(201).json({ data: await startCommissionPayment(req.user, req.body ?? {}) });
  }),
);

/** Head office registering a student and taking the course fee online. */
paymentRoutes.post(
  '/student-registration',
  requireAdmin,
  wrap(async (req, res) => {
    res.status(201).json({ data: await startRegistrationPayment(req.body ?? {}, req.user) });
  }),
);

/** Head office taking (part of) the fee on an enrolment online. */
paymentRoutes.post(
  '/enrolment-fee',
  requireAdmin,
  wrap(async (req, res) => {
    res.status(201).json({ data: await startEnrolmentPayment(req.user, req.body ?? {}) });
  }),
);

/**
 * Where a payment stands, checked with Cashfree; if it has just been paid, what
 * it pays for is made now. Head office, or the account that started it.
 */
paymentRoutes.post(
  '/:orderId/confirm',
  wrap(async (req, res) => {
    const orderId = String(req.params.orderId);
    await assertMayReadPayment(req.user, orderId);
    res.json({ data: await confirmPayment(orderId) });
  }),
);
