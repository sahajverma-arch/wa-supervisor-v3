export const socketEvents = {
  qrGenerated: 'qr_generated',
  employeeConnected: 'employee_connected',
  employeeDisconnected: 'employee_disconnected',
  employeeDeleted: 'employee_deleted',
  chatUpdated: 'chat_updated',
  messageReceived: 'message_received',
  historySynced: 'history_synced'
} as const;
