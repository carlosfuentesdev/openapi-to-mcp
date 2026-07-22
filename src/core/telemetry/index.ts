/**
 * Telemetría unificada: logging estructurado y métricas.
 *
 * Diseño pensado para el edge:
 * - Sin dependencias externas: el transporte por defecto es la consola.
 * - Estructurado en JSON, para que Better Stack / Axiom lo indexen tal cual.
 * - Redacción automática de secretos: nunca queremos una API key en los logs.
 *
 * Uso típico en un Worker:
 *
 *   const log = createLogger({ level: config.LOG_LEVEL, service: 'mi-activo' });
 *   log.info('petición recibida', { path: '/v1/generar' });
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Prioridad numérica de cada nivel, para filtrar por umbral. */
const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/** Campos arbitrarios que acompañan a un registro. */
export type LogContext = Readonly<Record<string, unknown>>;

/** Un registro ya estructurado, listo para enviarse al transporte. */
export interface LogRecord {
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly message: string;
  readonly service: string;
  readonly context: Record<string, unknown>;
}

/** Destino de los registros. Implementa uno propio para Axiom, Better Stack, etc. */
export interface Transport {
  emit(record: LogRecord): void;
}

/**
 * Claves cuyo valor se sustituye por `[REDACTADO]`.
 *
 * La comparación es por subcadena y sin distinguir mayúsculas, de modo que
 * `x-api-key`, `API_KEY` o `stripeSecret` quedan cubiertos por igual.
 */
const REDACTED_KEY_PATTERNS = [
  'key',
  'token',
  'secret',
  'password',
  'authorization',
  'cookie',
  'signature',
];

const REDACTED_PLACEHOLDER = '[REDACTADO]';

/** Indica si el nombre de un campo debe redactarse. */
function shouldRedact(key: string): boolean {
  const normalized = key.toLowerCase();
  return REDACTED_KEY_PATTERNS.some((pattern) => normalized.includes(pattern));
}

/**
 * Recorre un valor y redacta los campos sensibles.
 *
 * Limita la profundidad para no atascarse con estructuras enormes o cíclicas
 * (un log nunca debe ser el cuello de botella de una petición).
 */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[PROFUNDIDAD_MÁXIMA]';
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (Array.isArray(value)) {
    return value.map((item) => redact(item, depth + 1));
  }

  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    result[key] = shouldRedact(key) ? REDACTED_PLACEHOLDER : redact(item, depth + 1);
  }
  return result;
}

/** Transporte por defecto: una línea JSON por registro en la consola. */
export const consoleTransport: Transport = {
  emit(record: LogRecord): void {
    const line = JSON.stringify(record);
    if (record.level === 'error') console.error(line);
    else if (record.level === 'warn') console.warn(line);
    else console.log(line);
  },
};

/**
 * Transporte HTTP genérico para Better Stack, Axiom o cualquier colector que
 * acepte JSON por POST.
 *
 * Los envíos son "fire and forget": si el colector falla no queremos tumbar la
 * petición del usuario. Pasa el `Promise` a `ctx.waitUntil()` en un Worker si
 * necesitas garantizar la entrega antes de que muera el aislado.
 */
export function createHttpTransport(options: {
  readonly url: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly onFlush?: (promise: Promise<unknown>) => void;
}): Transport {
  return {
    emit(record: LogRecord): void {
      const promise = fetch(options.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...options.headers },
        body: JSON.stringify(record),
      }).catch((error: unknown) => {
        // Fallo del colector: lo dejamos en consola y seguimos.
        console.error(
          JSON.stringify({
            level: 'error',
            message: 'No se pudo enviar la telemetría al colector remoto.',
            error: String(error),
          }),
        );
      });
      options.onFlush?.(promise);
    },
  };
}

/** Emite cada registro a varios destinos a la vez. */
export function combineTransports(...transports: readonly Transport[]): Transport {
  return {
    emit(record: LogRecord): void {
      for (const transport of transports) transport.emit(record);
    },
  };
}

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  /** Deriva un logger hijo que arrastra contexto fijo (petición, usuario...). */
  child(context: LogContext): Logger;
  /** Registra una métrica puntual (contador, duración, etc.). */
  metric(name: string, value: number, context?: LogContext): void;
}

export interface LoggerOptions {
  /** Umbral mínimo: los registros por debajo se descartan. */
  readonly level?: LogLevel;
  /** Nombre del activo, para distinguir orígenes en el colector. */
  readonly service?: string;
  /** Destino de los registros. Por defecto, la consola. */
  readonly transport?: Transport;
  /** Contexto fijo que acompaña a todos los registros. */
  readonly context?: LogContext;
  /** Fuente de la marca de tiempo. Inyectable para los tests. */
  readonly now?: () => number;
}

/** Crea un logger estructurado. */
export function createLogger(options: LoggerOptions = {}): Logger {
  const level = options.level ?? 'info';
  const service = options.service ?? 'motor3';
  const transport = options.transport ?? consoleTransport;
  const baseContext = options.context ?? {};
  const now = options.now ?? (() => Date.now());
  const threshold = LEVEL_PRIORITY[level];

  const write = (recordLevel: LogLevel, message: string, context?: LogContext): void => {
    if (LEVEL_PRIORITY[recordLevel] < threshold) return;

    const merged = { ...baseContext, ...context };
    transport.emit({
      timestamp: new Date(now()).toISOString(),
      level: recordLevel,
      message,
      service,
      context: redact(merged) as Record<string, unknown>,
    });
  };

  return {
    debug: (message, context) => write('debug', message, context),
    info: (message, context) => write('info', message, context),
    warn: (message, context) => write('warn', message, context),
    error: (message, context) => write('error', message, context),
    metric: (name, value, context) =>
      write('info', `métrica: ${name}`, { ...context, metric: name, value }),
    child: (context) =>
      createLogger({
        level,
        service,
        transport,
        context: { ...baseContext, ...context },
        now,
      }),
  };
}

/** Logger silencioso, útil en tests que no deben ensuciar la salida. */
export const silentLogger: Logger = createLogger({
  transport: { emit: () => undefined },
});
