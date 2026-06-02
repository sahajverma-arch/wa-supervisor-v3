import {
  countChats,
  countMessages,
  getEmployeeBySessionKey,
  insertEmployee,
  listEmployees,
  markAllEmployeesDisconnected,
  updateEmployeeBySessionKey
} from '../supabase/queries.js';
import type { EmployeeRow } from '../types.js';

export async function createEmployeeSession(sessionKey: string) {
  return insertEmployee(sessionKey);
}

export async function getEmployeeSession(sessionKey: string) {
  return getEmployeeBySessionKey(sessionKey);
}

export async function updateEmployeeSession(sessionKey: string, patch: Partial<EmployeeRow> & Record<string, unknown>) {
  return updateEmployeeBySessionKey(sessionKey, patch);
}

export async function getEmployees() {
  return listEmployees();
}

export async function disconnectAllEmployees() {
  return markAllEmployeesDisconnected();
}

export async function getHistoricalDataStats() {
  const [chatCount, messageCount] = await Promise.all([countChats(), countMessages()]);
  return {
    chatCount,
    messageCount,
    available: chatCount > 0 || messageCount > 0
  };
}
