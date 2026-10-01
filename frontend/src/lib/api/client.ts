export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly body: unknown,
  ) {
    super(code);
  }
}

type Options = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  raw?: BodyInit;
  contentType?: string;
  signal?: AbortSignal;
};

export async function api<T>(path: string, { method = "GET", body, raw, contentType, signal }: Options = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  let payload: BodyInit | undefined = raw;
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  } else if (raw !== undefined && contentType) {
    headers["Content-Type"] = contentType;
  }
  const response = await fetch(`/api${path}`, { method, headers, body: payload, credentials: "same-origin", signal });
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  const data = text ? safeJson(text) : undefined;
  if (!response.ok) {
    const detail = (data as { detail?: unknown } | undefined)?.detail;
    throw new ApiError(response.status, typeof detail === "string" ? detail : `http_${response.status}`, data);
  }
  return data as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function errorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return "Something went wrong. Check your connection and try again.";
  const messages: Record<string, string> = {
    email_taken: "An account with this email already exists.",
    invalid_credentials: "Email or password is incorrect.",
    wrong_password: "Current password is incorrect.",
    rate_limited: "Too many attempts. Wait a minute and try again.",
    not_authenticated: "Your session ended. Log in again.",
    forbidden: "You don't have permission to do that.",
    last_owner: "A workspace needs at least one owner.",
    last_workspace: "You can't delete your only workspace.",
    not_jam_participant: "Only people who joined a jam here can be added directly. Send an invite link instead.",
    already_member: "This person is already a member.",
    invite_invalid: "This invite link has expired or was revoked.",
    folder_cycle: "A folder can't be moved into itself.",
    invalid_bpmn: "This file isn't a valid BPMN 2.0 diagram.",
    xml_too_large: "The file is too large (5 MB max).",
    jam_not_found: "No live jam with this code. Check the code or ask the host for a new one.",
    not_in_trash: "Move it to the trash first.",
  };
  if (messages[error.code]) return messages[error.code];
  if (error.status === 404) return "Not found. It may have been deleted.";
  if (error.status === 422) return "Some fields are invalid.";
  return "Something went wrong. Try again.";
}
