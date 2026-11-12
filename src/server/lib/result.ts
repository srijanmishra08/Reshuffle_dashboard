import { NextResponse } from "next/server";

export type ErrorCode = "VALIDATION" | "NOT_FOUND" | "CONFLICT" | "FORBIDDEN";

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: ErrorCode; details?: unknown };

export function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function fail(code: ErrorCode, error: string, details?: unknown): Result<never> {
  return { ok: false, code, error, details };
}

const statusByCode: Record<ErrorCode, number> = {
  VALIDATION: 400,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
};

/** Map a service result to an HTTP response. */
export function respond<T>(result: Result<T>, successStatus = 200): NextResponse {
  if (result.ok) {
    return NextResponse.json({ data: result.data }, { status: successStatus });
  }

  return NextResponse.json(
    { error: result.error, details: result.details },
    { status: statusByCode[result.code] }
  );
}
