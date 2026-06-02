import type { ChatsResponse, EmployeesResponse, MessagesResponse } from '../types';

function getBackendUrl() {
  const backendUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!backendUrl) {
    throw new Error('NEXT_PUBLIC_API_URL is required');
  }
  return backendUrl;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getBackendUrl()}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {})
    },
    ...init
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export const api = {
  employees: {
    list: (): Promise<EmployeesResponse> => request<EmployeesResponse>('/employees'),
    connect: (): Promise<{ employee: EmployeesResponse['employees'][number]; sessionKey: string }> =>
      request<{ employee: EmployeesResponse['employees'][number]; sessionKey: string }>('/employees/connect', { method: 'POST', body: '{}' }),
    disconnect: (sessionKey: string): Promise<{ success: boolean }> =>
      request<{ success: boolean }>('/employees/disconnect', { method: 'POST', body: JSON.stringify({ sessionKey }) }),
    resync: (sessionKey: string): Promise<{ success: boolean; started: boolean; requiresQr: boolean; employee: EmployeesResponse['employees'][number]; sessionKey: string }> =>
      request<{ success: boolean; started: boolean; requiresQr: boolean; employee: EmployeesResponse['employees'][number]; sessionKey: string }>(
        `/employees/${encodeURIComponent(sessionKey)}/resync`,
        { method: 'POST' }
      ),
    delete: (sessionKey: string): Promise<{ success: boolean }> =>
      request<{ success: boolean }>(`/employees/${encodeURIComponent(sessionKey)}`, { method: 'DELETE' })
  },
  chats: {
    list: (sessionKey: string, search?: string): Promise<ChatsResponse> =>
      request<ChatsResponse>(`/employees/${encodeURIComponent(sessionKey)}/chats${search ? `?search=${encodeURIComponent(search)}` : ''}`)
  },
  messages: {
    list: (sessionKey: string, chatId: string, before?: string): Promise<MessagesResponse> =>
      request<MessagesResponse>(
        `/employees/${encodeURIComponent(sessionKey)}/messages/${encodeURIComponent(chatId)}${before ? `?before=${encodeURIComponent(before)}&limit=100` : '?limit=100'}`
      )
  }
};
