export class ApiError extends Error {
  constructor(public readonly status: number, message: string, public readonly code?: string) { super(message); }
}

export async function readApiResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `API request failed (${response.status})`;
    let code: string | undefined;
    try { const body = await response.json() as { error?: { message?: string; code?: string } }; message = body.error?.message ?? message; code = body.error?.code; } catch { /* preserve the status error when the response is not JSON */ }
    throw new ApiError(response.status, message, code);
  }
  return response.json() as Promise<T>;
}

