'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import { getSocket } from '../socket/client';
import type {
  Chat,
  Employee,
  MessagesResponse,
  SocketChatUpdatedPayload,
  SocketEmployeeConnectedPayload,
  SocketEmployeeDeletedPayload,
  SocketEmployeeDisconnectedPayload,
  SocketHistorySyncedPayload,
  SocketMessageReceivedPayload,
  SocketQrPayload
} from '../types';

export function useSupervisor() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedSessionKey, setSelectedSessionKey] = useState<string | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessagesResponse['messages']>([]);
  const [chatSearch, setChatSearch] = useState('');
  const [connectModalOpen, setConnectModalOpen] = useState(false);
  const [connectSessionKey, setConnectSessionKey] = useState<string | null>(null);
  const [connectEmployeeName, setConnectEmployeeName] = useState<string | null>(null);
  const [connectQrDataUrl, setConnectQrDataUrl] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);

  const selectedEmployee = useMemo(
    () => employees.find(employee => employee.session_key === selectedSessionKey) ?? null,
    [employees, selectedSessionKey]
  );
  const selectedChat = useMemo(() => chats.find(chat => chat.id === selectedChatId) ?? null, [chats, selectedChatId]);

  async function loadEmployees() {
    const response = await api.employees.list();
    setEmployees(response.employees);
    return response;
  }

  async function loadChats(sessionKey: string, search = '') {
    const response = await api.chats.list(sessionKey, search);
    setChats(response.chats);
    if (!response.chats.some(chat => chat.id === selectedChatId)) {
      setSelectedChatId(response.chats[0]?.id ?? null);
    }
  }

  async function loadMessages(sessionKey: string, chatId: string) {
    const response = await api.messages.list(sessionKey, chatId);
    const ordered = response.messages.slice().reverse();
    const deduped = ordered.filter((message, index, array) => array.findIndex(candidate => candidate.external_message_id === message.external_message_id) === index);
    setMessages(deduped);
  }

  async function connectEmployee() {
    const response = await api.employees.connect();
    setEmployees(current => [response.employee, ...current.filter(employee => employee.id !== response.employee.id)]);
    setSelectedSessionKey(response.employee.session_key);
    setSelectedChatId(null);
    setChats([]);
    setMessages([]);
    setConnectSessionKey(response.sessionKey);
    setConnectEmployeeName(response.employee.display_name);
    setConnectQrDataUrl(null);
    setConnectModalOpen(true);
  }

  async function disconnectEmployee(sessionKey: string) {
    await api.employees.disconnect(sessionKey);
  }

  function requestDeleteEmployee(employee: Employee | null) {
    setDeleteTarget(employee);
  }

  async function confirmDeleteEmployee() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    setEmployees(current => current.filter(employee => employee.id !== target.id));
    if (selectedSessionKey === target.session_key) {
      setSelectedSessionKey(null);
      setChats([]);
      setMessages([]);
      setSelectedChatId(null);
    }

    try {
      await api.employees.delete(target.session_key);
    } catch (error) {
      await loadEmployees().catch(() => undefined);
      throw error;
    }
  }

  useEffect(() => {
    let mounted = true;
    loadEmployees()
      .then(response => {
        setSelectedSessionKey(current => current ?? response.employees[0]?.session_key ?? null);
      })
      .catch(() => undefined)
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const socket = getSocket();

    const handleQr = (payload: SocketQrPayload) => {
      if (payload.sessionKey !== connectSessionKey) return;
      setConnectModalOpen(true);
      setConnectQrDataUrl(payload.qrDataUrl);
    };

    const handleEmployeeConnected = (payload: SocketEmployeeConnectedPayload) => {
      setEmployees(current =>
        current.map(employee => (employee.id === payload.employee.id ? { ...employee, ...payload.employee } : employee))
      );
    };

    const handleEmployeeDisconnected = (payload: SocketEmployeeDisconnectedPayload) => {
      setEmployees(current =>
        current.map(employee =>
          employee.id === payload.employeeId
            ? { ...employee, status: 'disconnected', session_status: 'disconnected', presence: 'offline', last_error: payload.reason }
            : employee
        )
      );
    };

    const handleEmployeeDeleted = (payload: SocketEmployeeDeletedPayload) => {
      setEmployees(current => current.filter(employee => employee.id !== payload.employeeId));
      if (selectedEmployee?.id === payload.employeeId || selectedSessionKey === payload.sessionKey) {
        setSelectedSessionKey(null);
        setSelectedChatId(null);
        setChats([]);
        setMessages([]);
      }
    };

    const handleChatUpdated = (payload: SocketChatUpdatedPayload) => {
      if (selectedEmployee?.id !== payload.employeeId) return;
      setChats(current => {
        const next = current.filter(chat => chat.id !== payload.chat.id);
        return [payload.chat, ...next].sort((a, b) => (b.last_message_at ?? '').localeCompare(a.last_message_at ?? ''));
      });
    };

    const handleMessageReceived = (payload: SocketMessageReceivedPayload) => {
      if (selectedEmployee?.id !== payload.employeeId) return;
      setChats(current =>
        current.map(chat =>
          chat.id === payload.chatId
            ? {
                ...chat,
                last_message_preview: payload.message.body ?? payload.message.caption ?? chat.last_message_preview,
                last_message_at: payload.message.message_timestamp,
                unread_count: chat.unread_count
              }
              : chat
        )
      );
      if (payload.chatId === selectedChatId) {
        setMessages(current => {
          if (current.some(message => message.external_message_id === payload.message.external_message_id)) {
            return current;
          }
          return [...current, payload.message];
        });
      }
    };

    const handleHistorySynced = (_payload: SocketHistorySyncedPayload) => {
      if (selectedSessionKey) {
        loadChats(selectedSessionKey, chatSearch).catch(() => undefined);
        if (selectedChatId) {
          loadMessages(selectedSessionKey, selectedChatId).catch(() => undefined);
        }
      }
    };

    socket.on('qr_generated', handleQr);
    socket.on('employee_connected', handleEmployeeConnected);
    socket.on('employee_disconnected', handleEmployeeDisconnected);
    socket.on('employee_deleted', handleEmployeeDeleted);
    socket.on('chat_updated', handleChatUpdated);
    socket.on('message_received', handleMessageReceived);
    socket.on('history_synced', handleHistorySynced);

    return () => {
      socket.off('qr_generated', handleQr);
      socket.off('employee_connected', handleEmployeeConnected);
      socket.off('employee_disconnected', handleEmployeeDisconnected);
      socket.off('employee_deleted', handleEmployeeDeleted);
      socket.off('chat_updated', handleChatUpdated);
      socket.off('message_received', handleMessageReceived);
      socket.off('history_synced', handleHistorySynced);
    };
  }, [chatSearch, connectSessionKey, selectedChatId, selectedEmployee?.id, selectedSessionKey]);

  useEffect(() => {
    if (!selectedSessionKey) return;
    loadChats(selectedSessionKey, chatSearch).catch(() => undefined);
  }, [chatSearch, selectedSessionKey]);

  useEffect(() => {
    if (!selectedSessionKey || !selectedChatId) return;
    loadMessages(selectedSessionKey, selectedChatId).catch(() => undefined);
  }, [selectedChatId, selectedSessionKey]);

  function selectEmployee(employee: Employee) {
    setSelectedSessionKey(employee.session_key);
    setConnectSessionKey(null);
    setConnectEmployeeName(null);
    setConnectQrDataUrl(null);
    setConnectModalOpen(false);
  }

  function selectChat(chat: Chat) {
    setSelectedChatId(chat.id);
  }

  return {
    employees,
    loading,
    selectedEmployee,
    chats,
    selectedChat,
    messages,
    chatSearch,
    setChatSearch,
    selectedSessionKey,
    selectedChatId,
    selectEmployee,
    selectChat,
    connectEmployee,
    disconnectEmployee,
    connectModalOpen,
    connectSessionKey,
    connectEmployeeName,
    connectQrDataUrl,
    setConnectModalOpen,
    deleteTarget,
    requestDeleteEmployee,
    confirmDeleteEmployee
  };
}
