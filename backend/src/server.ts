import 'dotenv/config';
import http from 'node:http';
import { createApp } from './app.js';
import { initializeSocket } from './socket/index.js';
import { getClientOrigins } from './utils/env.js';
import { logger } from './utils/logger.js';

const port = Number(process.env.PORT ?? 4000);
const clientOrigins = getClientOrigins();

const app = createApp();
const server = http.createServer(app);

initializeSocket(server, clientOrigins);

server.listen(port, () => {
  logger.info(`Backend listening on port ${port}`);
});
