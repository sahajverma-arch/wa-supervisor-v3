import { getEmployeeBySessionKey, insertEmployee, listEmployees, updateEmployeeBySessionKey } from '../supabase/queries.js';
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
