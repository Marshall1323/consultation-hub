export type UserRole = "CLIENT" | "SPECIALIST" | "ADMIN";

export type AuthUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  createdAt: string;
};

type AuthResponse = {
  user: AuthUser;
  token: string;
};

type RegisterInput = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
};

type LoginInput = {
  email: string;
  password: string;
};

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const request = async <T>(path: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  const body = (await response.json().catch(() => null)) as
    | { code?: string; message?: string }
    | null;

  if (!response.ok) {
    throw new ApiError(body?.code ?? "REQUEST_FAILED", body?.message ?? "Request failed");
  }

  return body as T;
};

export const register = (input: RegisterInput) =>
  request<AuthResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify(input),
  });

export const login = (input: LoginInput) =>
  request<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(input),
  });

export const getCurrentUser = (token: string) =>
  request<{ user: AuthUser }>("/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
