import 'dotenv/config';
import http from 'node:http';
import { createApp } from './app.js';
import { initializeSocket } from './socket/index.js';
import { disconnectAllEmployees, getEmployees, getHistoricalDataStats } from './services/employee.service.js';
import { getClientOrigins, inspectWhatsAppAuthStorage, resolveWhatsAppAuthPath } from './utils/env.js';
import { logger } from './utils/logger.js';

const port = Number(process.env.PORT ?? 4000);
const clientOrigins = getClientOrigins();
const authPath = await resolveWhatsAppAuthPath();

const app = createApp();
const server = http.createServer(app);

initializeSocket(server, clientOrigins);

const authStorage = await inspectWhatsAppAuthStorage(authPath);
logger.info('AUTH_PATH', {
  authPath: authStorage.authPath
});
logger.info('AUTH_EXISTS', {
  authPath: authStorage.authPath,
  exists: authStorage.exists
});
logger.info('SESSION_COUNT', {
  authPath: authStorage.authPath,
  sessionCount: authStorage.sessionCount
});

const employees = await getEmployees();
logger.info('EMPLOYEES_LOADED', {
  count: employees.length
});

const disconnectedEmployees = await disconnectAllEmployees();
logger.info('EMPLOYEES_MARKED_DISCONNECTED', {
  count: disconnectedEmployees.length
});

const historicalData = await getHistoricalDataStats();
logger.info('HISTORICAL_DATA_AVAILABLE', {
  available: historicalData.available,
  chatCount: historicalData.chatCount,
  messageCount: historicalData.messageCount
});

server.listen(port, () => {
  logger.info(`Backend listening on port ${port}`);
});
