export const socketEvents = {
  qrGenerated: 'qr_generated',
  employeeConnected: 'employee_connected',
  employeeDisconnected: 'employee_disconnected',
  employeeDeleted: 'employee_deleted',
  chatUpdated: 'chat_updated',
  messageReceived: 'message_received',
  messageAck: 'message_ack',
  historySynced: 'history_synced'
} as const;

export const socketEventAliases = {
  qrGenerated: 'qr.generated',
  employeeConnected: 'employee.updated',
  employeeDisconnected: 'employee.updated',
  employeeDeleted: 'employee.updated',
  chatUpdated: 'chat.updated',
  messageReceived: 'message.created',
  historySynced: 'history.synced',
  messageAck: 'message.ack'
} as const;
