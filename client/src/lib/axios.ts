export type AxiosResponse<T> = { data: T };

const jsonHeaders = {
  "Content-Type": "application/json",
};

const request = async <T>(url: string, options: RequestInit = {}): Promise<AxiosResponse<T>> => {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = data?.message || `Request failed with status ${response.status}`;
    const error = new Error(message) as Error & { response?: { status: number; data: unknown } };
    error.response = { status: response.status, data };
    throw error;
  }

  return { data };
};

export const axios = {
  get: <T>(url: string, options: { headers?: Record<string, string> } = {}) =>
    request<T>(url, { method: "GET", headers: options.headers }),

  post: <T>(url: string, body?: unknown, options: { headers?: Record<string, string> } = {}) =>
    request<T>(url, {
      method: "POST",
      headers: { ...jsonHeaders, ...(options.headers || {}) },
      body: JSON.stringify(body ?? {}),
    }),

  patch: <T>(url: string, body?: unknown, options: { headers?: Record<string, string> } = {}) =>
    request<T>(url, {
      method: "PATCH",
      headers: { ...jsonHeaders, ...(options.headers || {}) },
      body: JSON.stringify(body ?? {}),
    }),
};
