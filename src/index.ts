import express from 'express';
import { hsUsersRouter } from './routes/hsUsers';
import { hsClientsRouter } from './routes/hsClients';
import { hsApplicationsRouter } from './routes/hsApplications';

const PORT = Number(process.env.PORT) || 3030;

const app = express();

app.use(express.json());

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.header('Access-Control-Allow-Headers', req.header('Access-Control-Request-Headers') ?? 'Authorization,x-tenant-id');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
});

app.use('/api/v1/hs-users', hsUsersRouter);
app.use('/api/v1/hs-clients', hsClientsRouter);
app.use('/api/v1/hs-applications', hsApplicationsRouter);

const server = app.listen(PORT, () => {
  console.log(`Proxy server listening on port ${PORT}`);
});

server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Set PORT to a free port and restart the server.`);
    process.exit(1);
  }

  console.error('Failed to start proxy server', error);
  process.exit(1);
});
