import { connectEmployee, disconnectEmployee, listManagedSessions, resyncEmployee } from '../whatsapp/manager.js';

export { connectEmployee, disconnectEmployee, listManagedSessions, resyncEmployee };

export const whatsappService = {
  connectEmployee,
  disconnectEmployee,
  listManagedSessions,
  resyncEmployee
};
