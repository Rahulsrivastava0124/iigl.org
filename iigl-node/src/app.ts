import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { env } from './lib/env.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { authRoutes } from './routes/auth.routes.js';
import { catalogRoutes } from './routes/catalog.routes.js';
import { publicRoutes } from './routes/public.routes.js';
import { orderRoutes } from './routes/order.routes.js';
import { reportRoutes } from './routes/report.routes.js';
import { transactionRoutes } from './routes/transaction.routes.js';
import { userRoutes } from './routes/user.routes.js';
import { dashboardRoutes } from './routes/dashboard.routes.js';
import { cardRoutes } from './routes/card.routes.js';import { adminRoutes } from './routes/admin.routes.js';
import { uploadRoutes } from './routes/upload.routes.js';
import { attendanceRoutes } from './routes/attendance.routes.js';
import { contentRoutes } from './routes/content.routes.js';
import { customerRoutes } from './routes/customer.routes.js';
import { messageRoutes } from './routes/message.routes.js';
import { roleRoutes } from './routes/role.routes.js';
import { studentRoutes } from './routes/student.routes.js';
import { courseRoutes } from './routes/course.routes.js';
import { studentCertificateRoutes } from './routes/student-certificate.routes.js';
import { enquiryRoutes } from './routes/enquiry.routes.js';
import { couponRoutes } from './routes/coupon.routes.js';
import { fileRoutes } from './routes/file.routes.js';
import { masterRoutes } from './routes/master.routes.js';
import { settingsRoutes } from './routes/settings.routes.js';
import { holidayRoutes } from './routes/holiday.routes.js';
import { statementRoutes } from './routes/statement.routes.js';
import { requireAuth } from './middleware/auth.js';
import { loginLimiter, resetLimiter, verifyLogLimiter, renderLimiter } from './middleware/limits.js';
import { openApiDocument } from './docs/openapi.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  // Nothing is gained by naming the framework in every response.
  app.disable('x-powered-by');

  app.use(
    helmet({
      // Swagger UI needs inline styles and its own scripts; the API itself
      // returns JSON, so a strict policy here would only break the docs.
      contentSecurityPolicy: false,
      // Card PDFs are served for viewing in a browser tab.
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );

  app.use(
    cors({
      origin: env.corsOrigins,
      // Authentication is a session cookie, so the browser must be allowed to
      // send it. This is why the origin list is explicit rather than a wildcard.
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    }),
  );

  // Cross-site sessions give up the browser's own CSRF protection, so it has to
  // be done here instead.
  //
  // With SameSite=Lax the browser simply refuses to attach the session to a
  // request that started on another site, and that refusal was the whole
  // defence. SESSION_CROSS_SITE turns it off on purpose so a panel on its own
  // domain can stay signed in — which leaves every state-changing endpoint
  // reachable by a form posted from any page on the internet, with the
  // visitor's cookie attached.
  //
  // CORS does not cover this. It governs whether a response may be *read*, not
  // whether the request runs: a cross-site POST still reaches the handler and
  // still commits, and the attacker never needed to see the reply.
  //
  // Only the mutating methods. A GET has no side effect worth protecting and
  // blocking one would break a card PDF opened from anywhere. A missing Origin
  // header means the caller is not a browser — curl, the sweep script, another
  // server — and those carry no cookie they did not set themselves.
  if (env.sessionCrossSite) {
    const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
    app.use((req, res, next) => {
      if (!MUTATING.has(req.method)) return next();
      const origin = req.get('origin');
      if (!origin || env.corsOrigins.includes(origin)) return next();
      res.status(403).json({ error: 'Origin not allowed.' });
    });
  }

  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.get('/health', (_req, res) => res.json({ ok: true }));

  // Interactive reference. Served before the session guard so the docs are
  // reachable without signing in; Try it out still needs a real login.
  app.get('/openapi.json', (_req, res) => res.json(openApiDocument));
  app.use(
    '/docs',
    swaggerUi.serve,
    swaggerUi.setup(openApiDocument, {
      customSiteTitle: 'IIGL API',
      swaggerOptions: {
        // Send the session cookie with Try it out requests.
        requestInterceptor: (r: { credentials?: string }) => {
          r.credentials = 'include';
          return r;
        },
        persistAuthorization: true,
        docExpansion: 'list',
        defaultModelsExpandDepth: 0,
        tagsSorter: 'alpha',
      },
    }),
  );

  // Public surface: the marketing site and certificate verification.
  app.use('/api/auth/login', loginLimiter);
  app.use('/api/auth/forgot-password', resetLimiter);
  app.use('/api/auth/reset-password', resetLimiter);
  app.use('/api/public/verify-log', verifyLogLimiter);
  app.use('/api/cards', renderLimiter);

  app.use('/api/auth', authRoutes);
  app.use('/api/public', publicRoutes);

  // Uploaded files, from the legacy disk first and R2 after (see the note
  // where they are mounted for everyone else, below the session guard).
  const files = express
    .Router()
    .use((req, res, next) => {
      // Express does not normalise a raw path, and R2 and the disk both would:
      // `website/../signature/x.png` names a private file under a public
      // folder. No stored path has a dot segment, so any is refused.
      let decoded = '..';
      try {
        decoded = decodeURIComponent(req.path);
      } catch {
        // Malformed escapes are refused along with the rest.
      }
      if (/[\\\0]/.test(decoded) || decoded.split('/').some((s) => s === '.' || s === '..')) {
        res.status(404).json({ message: 'Not found.' });
        return;
      }
      next();
    })
    .use(express.static(path.resolve(env.legacyPublicRoot, 'uploads'), { index: false }), fileRoutes);

  // The website's own pictures are as public as the pages they sit on: what
  // Website Setup uploads (banner), the course cards (website), and category
  // pictures (icon — which also holds attribute pictures and laboratory logos,
  // branding printed on every certificate). Only those three folders: reports,
  // signatures, employee and laboratory papers keep the session guard.
  const PUBLIC_UPLOADS = new Set(['website', 'banner', 'icon']);
  app.use('/api/files', (req, res, next) =>
    PUBLIC_UPLOADS.has(req.path.split('/')[1] ?? '') ? files(req, res, next) : next(),
  );

  // Everything below requires a session. Routes are private by default —
  // the inverse of the Laravel app, where 15 routes sat outside all middleware.
  app.use('/api', requireAuth);
  app.use('/api/catalog', catalogRoutes);
  app.use('/api/orders', orderRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/transactions', transactionRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/cards', cardRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/uploads', uploadRoutes);
  app.use('/api/coupons', couponRoutes);

  // Reading back what was uploaded. Every image path in the database is
  // `public/uploads/<bucket>/<file>`, and until now nothing served those files
  // at all — the panel could upload an icon and never show it again.
  //
  // Two sources, in this order. The legacy disk holds everything Laravel wrote
  // and everything uploaded before R2; R2 holds everything since. Disk is tried
  // first because it costs a stat rather than a request over the network, and
  // `express.static` calls next() on a miss, which is what makes the fallback
  // possible at all.
  //
  // Only `uploads/` is mounted, not the whole Laravel public root, which also
  // holds the application's own source. `screenshots/` — payment proof — is
  // deliberately left out; it is evidence attached to a transaction rather than
  // a picture a list needs to render.
  app.use('/api/files', files);
  app.use('/api/attendance', attendanceRoutes);
  app.use('/api/content', contentRoutes);
  app.use('/api/customers', customerRoutes);
  app.use('/api/messages', messageRoutes);
  app.use('/api/roles', roleRoutes);
  app.use('/api/students', studentRoutes);
  app.use('/api/courses', courseRoutes);
  app.use('/api/student-certificates', studentCertificateRoutes);
  app.use('/api/enquiries', enquiryRoutes);
  app.use('/api/master', masterRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/holidays', holidayRoutes);
  app.use('/api/statements', statementRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
