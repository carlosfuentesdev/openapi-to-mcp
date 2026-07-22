/**
 * Errores tipados de la factoría.
 *
 * Todo error que atraviese la frontera HTTP debe ser un `AppError`: así el
 * manejador central sabe qué código devolver y qué exponer al cliente sin
 * filtrar detalles internos.
 */

/** Códigos de error estables que el cliente puede tratar programáticamente. */
export const ERROR_CODES = [
  'bad_request',
  'unauthorized',
  'forbidden',
  'not_found',
  'conflict',
  'payload_too_large',
  'rate_limited',
  'internal_error',
  'not_implemented',
  'service_unavailable',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** Correspondencia entre código de error y estado HTTP. */
const HTTP_STATUS_BY_CODE: Record<ErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  payload_too_large: 413,
  rate_limited: 429,
  internal_error: 500,
  not_implemented: 501,
  service_unavailable: 503,
};

export interface AppErrorOptions {
  /** Detalles adicionales seguros de exponer al cliente (p. ej. errores de validación). */
  readonly details?: unknown;
  /** Error original que provocó este, para la traza interna. Nunca se expone. */
  readonly cause?: unknown;
  /** Cabeceras extra a incluir en la respuesta (p. ej. `Retry-After`). */
  readonly headers?: Readonly<Record<string, string>>;
}

/**
 * Error de aplicación con código estable y estado HTTP asociado.
 *
 * El `message` se considera seguro de mostrar al cliente; usa `cause` para
 * todo lo que deba quedarse en los logs.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: unknown;
  readonly headers: Readonly<Record<string, string>>;

  constructor(code: ErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'AppError';
    this.code = code;
    this.status = HTTP_STATUS_BY_CODE[code];
    this.details = options.details;
    this.headers = options.headers ?? {};
  }

  /** Indica si el error es responsabilidad del cliente (4xx) o nuestra (5xx). */
  get isClientError(): boolean {
    return this.status >= 400 && this.status < 500;
  }
}

/** Comprueba si un valor desconocido es un `AppError`. */
export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

/**
 * Normaliza cualquier valor lanzado a un `AppError`.
 *
 * Los errores inesperados se convierten en `internal_error` con un mensaje
 * genérico: el detalle real viaja en `cause` para la telemetría, no al cliente.
 */
export function toAppError(value: unknown): AppError {
  if (isAppError(value)) return value;
  return new AppError('internal_error', 'Se ha producido un error interno.', { cause: value });
}

// --- Atajos de uso frecuente -------------------------------------------------

export const badRequest = (message: string, details?: unknown): AppError =>
  new AppError('bad_request', message, details === undefined ? {} : { details });

export const unauthorized = (message = 'Credenciales ausentes o no válidas.'): AppError =>
  new AppError('unauthorized', message);

export const forbidden = (message = 'No tienes permiso para realizar esta acción.'): AppError =>
  new AppError('forbidden', message);

export const notFound = (message = 'Recurso no encontrado.'): AppError =>
  new AppError('not_found', message);

export const rateLimited = (message: string, retryAfterSeconds: number): AppError =>
  new AppError('rate_limited', message, {
    headers: { 'Retry-After': String(Math.max(0, Math.ceil(retryAfterSeconds))) },
  });
