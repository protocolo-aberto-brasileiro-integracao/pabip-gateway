export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  errors?: string[];
  [extension: string]: unknown;
}

export class AdminApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly problem: ProblemDetails,
  ) {
    super(problem.detail ?? problem.title);
    this.name = 'AdminApiError';
  }
}

export interface ClientConfig {
  baseUrl: string;
  token: string;
}

const ADMIN_TOKEN_HEADER = 'X-Admin-Token';

export async function request<T = unknown>(
  config: ClientConfig,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`${config.baseUrl}${path}`, {
    method,
    headers: {
      ...(config.token ? { [ADMIN_TOKEN_HEADER]: config.token } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const raw = await response.text();
  const parsed: unknown = raw.length > 0 ? tryParseJson(raw) : undefined;

  if (!response.ok) {
    throw new AdminApiError(response.status, toProblemDetails(parsed, raw, response));
  }

  return parsed as T;
}

function tryParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

function toProblemDetails(parsed: unknown, raw: string, response: Response): ProblemDetails {
  if (isProblemDetails(parsed)) {
    return parsed;
  }
  return {
    type: 'about:blank',
    title: response.statusText,
    status: response.status,
    ...(raw ? { detail: raw } : {}),
  };
}

function isProblemDetails(value: unknown): value is ProblemDetails {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { status?: unknown }).status === 'number' &&
    typeof (value as { title?: unknown }).title === 'string'
  );
}
