import express from 'express';
import cors from 'cors';
import { employeesRouter } from './routes/employees.routes.js';
import { healthRouter } from './routes/health.routes.js';
import { getClientOrigins } from './utils/env.js';

export function createApp() {
  const app = express();
  const clientOrigins = getClientOrigins();

  app.use(
    cors({
      origin: clientOrigins,
      credentials: true
    })
  );
  app.use(express.json({ limit: '20mb' }));

  app.use('/health', healthRouter);
  app.use('/employees', employeesRouter);

  app.get('/', (_req, res) => {
    res.json({ ok: true, name: 'WhatsApp Supervisor Console V3 Backend' });
  });

  return app;
}
