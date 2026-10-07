import useSWR, { mutate as globalMutate, type SWRConfiguration } from 'swr';

export class ApiError extends Error {
  constructor(public status: number, message: string, public fields?: Record<string, string[]>) {
    super(message);
  }
}

async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'include',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401 && typeof window !== 'undefined' && window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'Something went wrong. Try again', data.fields);
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, 'POST', body ?? {}),
  put: <T>(path: string, body: unknown) => request<T>(path, 'PUT', body),
  patch: <T>(path: string, body: unknown) => request<T>(path, 'PATCH', body),
  del: (path: string) => request<void>(path, 'DELETE'),
};

/** Reads from the API and keeps the result fresh. Pass null to wait. */
export function useApi<T>(path: string | null, config?: SWRConfiguration<T, ApiError>) {
  return useSWR<T, ApiError>(path, (p: string) => api.get<T>(p), { revalidateOnFocus: false, ...config });
}

/** Refetches every cached request whose path starts with the given prefix. */
export const refresh = (prefix: string) => globalMutate((key) => typeof key === 'string' && key.startsWith(prefix));

export const errorText = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong. Try again');
