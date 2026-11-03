import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { env } from './config/env.js';
import { authenticate } from './middleware/auth.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import activityRoutes from './routes/activity.js';
import authRoutes from './routes/auth.js';
import boardRoutes from './routes/boards.js';
import columnRoutes from './routes/columns.js';
import organizationRoutes from './routes/organizations.js';
import taskRoutes from './routes/tasks.js';
import tenantRoutes from './routes/tenants.js';

const app = express();
if (env.NODE_ENV === 'production') app.set('trust proxy', 1); // behind Render/Railway

const limiter = (limit) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many requests, slow down' },
  });

app.use(helmet());
app.use(cors({ origin: env.clientOrigins }));
app.use(express.json({ limit: '100kb' }));
app.use('/api', limiter(1000));

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/auth', limiter(50), authRoutes); // tighter limit against password guessing

// everything below needs a valid token; tenant checks happen inside each route
app.use('/api/organizations', authenticate, organizationRoutes);
app.use('/api/tenants', authenticate, tenantRoutes);
app.use('/api/boards', authenticate, boardRoutes);
app.use('/api/columns', authenticate, columnRoutes);
app.use('/api/tasks', authenticate, taskRoutes);
app.use('/api/activity', authenticate, activityRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
