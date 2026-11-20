import express from 'express';
import { errorHandler, notFoundHandler } from './lib/errors';
import { entitiesRouter } from './routes/entities';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/api/entities', entitiesRouter);

  app.use('/api', notFoundHandler);
  app.use(errorHandler);
  return app;
}
