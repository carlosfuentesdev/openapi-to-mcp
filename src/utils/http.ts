/**
 * Utilidades de respuesta HTTP.
 *
 * Toda la factoría habla el mismo dialecto JSON, de modo que cualquier cliente
 * (o cualquier activo que consuma a otro) pueda tratar las respuestas igual:
 *
 *   Éxito:  { "ok": true,  "data": ... }
 *   Error:  { "ok": false, "error": { "code": ..., "message": ..., "details"?: ... } }
 */

import { AppError, toAppError } from './errors.js';

export interface SuccessBody<T> {
  readonly ok: true;
  readonly data: T;
}

export interface ErrorBody {
  readonly ok: false;
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly details?: unknown;
  };
}

export type ApiBody<T> = SuccessBody<T> | ErrorBody;

export interface ResponseOptions {
  readonly status?: number;
  readonly headers?: Readonly<Record<string, string>>;
}

/** Construye una respuesta JSON con las cabeceras correctas. */
export function json<T>(body: T, options: ResponseOptions = {}): Response {
  return new Response(JSON.stringify(body), {
    status: options.status ?? 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...options.headers,
    },
  });
}

/** Respuesta de éxito envuelta en el sobre estándar. */
export function ok<T>(data: T, options: ResponseOptions = {}): Response {
  const body: SuccessBody<T> = { ok: true, data };
  return json(body, options);
}

/** Respuesta 204 sin cuerpo, para operaciones que no devuelven nada. */
export function noContent(headers: Readonly<Record<string, string>> = {}): Response {
  return new Response(null, { status: 204, headers: { ...headers } });
}

/**
 * Respuesta de error a partir de cualquier valor lanzado.
 *
 * Los errores 5xx nunca exponen el mensaje original: se sustituye por uno
 * genérico para no filtrar detalles de implementación.
 */
export function fail(error: unknown, options: ResponseOptions = {}): Response {
  const appError: AppError = toAppError(error);
  const safeMessage = appError.isClientError
    ? appError.message
    : 'Se ha producido un error interno.';

  const body: ErrorBody = {
    ok: false,
    error: {
      code: appError.code,
      message: safeMessage,
      ...(appError.isClientError && appError.details !== undefined
        ? { details: appError.details }
        : {}),
    },
  };

  return json(body, {
    status: options.status ?? appError.status,
    headers: { ...appError.headers, ...options.headers },
  });
}

/**
 * Lee y parsea el cuerpo JSON de una petición.
 *
 * Lanza `bad_request` si el cuerpo no es JSON válido, en lugar de dejar
 * escapar un `SyntaxError` crudo hasta el manejador de errores.
 */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch (cause) {
    throw new AppError('bad_request', 'El cuerpo de la petición no es JSON válido.', { cause });
  }
}
