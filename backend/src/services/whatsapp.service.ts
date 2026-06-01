import { connectEmployee, disconnectEmployee, listManagedSessions } from '../whatsapp/manager.js';

export { connectEmployee, disconnectEmployee, listManagedSessions };

export const whatsappService = {
  connectEmployee,
  disconnectEmployee,
  listManagedSessions
};
