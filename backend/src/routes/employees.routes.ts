import { Router } from 'express';
import {
  connectEmployeeHandler,
  disconnectEmployeeHandler,
  deleteEmployeeHandler,
  listChatsHandler,
  listEmployeesHandler,
  listMessagesHandler
} from '../controllers/employees.controller.js';

export const employeesRouter = Router();

employeesRouter.post('/connect', connectEmployeeHandler);
employeesRouter.post('/disconnect', disconnectEmployeeHandler);
employeesRouter.delete('/:sessionKey', deleteEmployeeHandler);
employeesRouter.get('/', listEmployeesHandler);
employeesRouter.get('/:session/chats', listChatsHandler);
employeesRouter.get('/:session/messages/:chatId', listMessagesHandler);
