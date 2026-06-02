import type { Request, Response } from 'express';
import { getEmployees, getEmployeeSession } from '../services/employee.service.js';
import { getChatsForEmployee } from '../services/chat.service.js';
import { getChat } from '../services/chat.service.js';
import { getMessagesForChat } from '../services/message.service.js';
import { whatsappService } from '../services/whatsapp.service.js';
import { logger } from '../utils/logger.js';
import { supabase } from '../supabase/client.js';
import { deleteEmployeeSession } from '../whatsapp/manager.js';
import { getSocketServer } from '../socket/index.js';
import { socketEvents } from '../socket/events.js';

export async function connectEmployeeHandler(_req: Request, res: Response) {
  const { employee, sessionKey } = await whatsappService.connectEmployee();
  res.status(201).json({ employee, sessionKey });
}

export async function disconnectEmployeeHandler(req: Request, res: Response) {
  const sessionKey = String(req.body?.sessionKey ?? '');
  if (!sessionKey) {
    return res.status(400).json({ error: 'sessionKey is required' });
  }

  await whatsappService.disconnectEmployee(sessionKey);
  res.json({ success: true });
}

export async function resyncEmployeeHandler(req: Request, res: Response) {
  const sessionKey = String(req.params.sessionKey ?? '');
  if (!sessionKey) {
    return res.status(400).json({ error: 'sessionKey is required' });
  }

  const employee = await getEmployeeSession(sessionKey);
  if (!employee) {
    return res.status(404).json({ error: 'Employee not found' });
  }

  const started = await whatsappService.resyncEmployee(sessionKey);
  res.json({ success: true, started, requiresQr: started, employee, sessionKey });
}

export async function deleteEmployeeHandler(req: Request, res: Response) {
  const sessionKey = String(req.params.sessionKey ?? '');
  if (!sessionKey) {
    return res.status(400).json({ error: 'sessionKey is required' });
  }

  const employee = await getEmployeeSession(sessionKey);
  if (!employee) {
    return res.status(404).json({ error: 'Employee not found' });
  }

  await deleteEmployeeSession(sessionKey);

  const { error } = await supabase.from('employees').delete().eq('session_key', sessionKey);
  if (error) {
    throw error;
  }

  getSocketServer().emit(socketEvents.employeeDeleted, {
    employeeId: employee.id,
    sessionKey
  });

  res.json({ success: true });
}

export async function listEmployeesHandler(_req: Request, res: Response) {
  const employees = await getEmployees();
  res.json({ employees });
}

export async function listChatsHandler(req: Request, res: Response) {
  const sessionKey = String(req.params.session ?? '');
  const search = typeof req.query.search === 'string' ? req.query.search : undefined;
  const employee = await getEmployeeSession(sessionKey);
  if (!employee) {
    return res.status(404).json({ error: 'Employee not found' });
  }

  const chats = await getChatsForEmployee(employee.id, search);
  logger.info('TOTAL_CHATS_RETURNED_TO_FRONTEND', {
    employeeId: employee.id,
    sessionKey,
    search: search ?? null,
    TOTAL_CHATS_RETURNED_TO_FRONTEND: chats.length
  });
  res.json({ employee, chats });
}

export async function listMessagesHandler(req: Request, res: Response) {
  const sessionKey = String(req.params.session ?? '');
  const chatId = String(req.params.chatId ?? '');
  const before = typeof req.query.before === 'string' ? req.query.before : undefined;
  const limit = Number.isFinite(Number(req.query.limit)) ? Math.min(Number(req.query.limit), 100) : 50;
  const employee = await getEmployeeSession(sessionKey);
  if (!employee) {
    return res.status(404).json({ error: 'Employee not found' });
  }

  const chat = await getChat(chatId);
  if (!chat || chat.employee_id !== employee.id) {
    return res.status(404).json({ error: 'Chat not found' });
  }

  const messages = await getMessagesForChat(chatId, limit, before);
  res.json({ employee, chat, messages });
}
