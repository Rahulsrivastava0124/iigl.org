import express from 'express';
import session from 'express-session';
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
import { requireAuth } from './middleware/auth.js';
import { loginLimiter, verifyLogLimiter, renderLimiter } from './middleware/limits.js';
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

  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.use(
    session({
      name: 'iigl.sid',
      secret: env.sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: env.isProd,
        maxAge: 1000 * 60 * 60 * 8,
      },
    }),
  );

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
  app.use('/api/public/verify-log', verifyLogLimiter);
  app.use('/api/cards', renderLimiter);

  app.use('/api/auth', authRoutes);
  app.use('/api/public', publicRoutes);

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

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
