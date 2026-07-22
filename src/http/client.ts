import type { ToolDefinition } from '../generator/operations.js';

/**
 * Forma mínima del cliente HTTP que necesita el activo, desacoplada del `fetch`
 * global. Cualquier `fetch` de Node lo satisface de forma estructural, y un test
 * puede inyectar un doble sin depender de la red.
 */
export type FetchLike = (input: string, init?: FetchInit) => Promise<FetchResponse>;

export interface FetchInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface FetchResponse {
  status: number;
  ok: boolean;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}

export interface ExecuteOptions {
  /** URL base de la API subyacente (sin barra final relevante). */
  readonly baseUrl: string;
  /** Cabeceras estáticas (autenticación, contenido) que se envían siempre. */
  readonly headers?: Readonly<Record<string, string>>;
  /** Cliente HTTP. Inyectable para los tests. */
  readonly fetchFn: FetchLike;
}

export interface ToolCallResult {
  readonly status: number;
  readonly ok: boolean;
  readonly contentType: string | null;
  /** Cuerpo ya interpretado si era JSON; si no, el texto crudo. */
  readonly body: unknown;
  /** Texto crudo de la respuesta, por si el llamante lo necesita. */
  readonly raw: string;
  /** Método y URL finales, útiles para depurar y auditar. */
  readonly request: { method: string; url: string };
}

/**
 * Ejecuta la llamada HTTP que representa una herramienta, mapeando los
 * argumentos validados a parámetros de ruta, query, cabecera y cuerpo.
 */
export async function executeTool(
  tool: ToolDefinition,
  args: Readonly<Record<string, unknown>>,
  options: ExecuteOptions,
): Promise<ToolCallResult> {
  const { binding } = tool;

  // 1. Ruta: sustituye los marcadores {name} por los parámetros de ruta.
  let path = binding.pathTemplate;
  for (const param of binding.params) {
    if (param.in !== 'path') continue;
    const value = args[param.name];
    path = path.replace(`{${param.name}}`, encodeURIComponent(stringifyValue(value)));
  }

  // 2. Query: añade los parámetros presentes en los argumentos.
  const query = new URLSearchParams();
  for (const param of binding.params) {
    if (param.in !== 'query') continue;
    const value = args[param.name];
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) query.append(param.name, stringifyValue(item));
    } else {
      query.append(param.name, stringifyValue(value));
    }
  }

  // 3. Cabeceras: estáticas + parámetros de cabecera de la operación.
  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  for (const param of binding.params) {
    if (param.in !== 'header') continue;
    const value = args[param.name];
    if (value === undefined || value === null) continue;
    headers[param.name] = stringifyValue(value);
  }

  // 4. Cuerpo: sólo si la operación lo declara y viene en los argumentos.
  let body: string | undefined;
  if (binding.requestBody && args['body'] !== undefined) {
    body = JSON.stringify(args['body']);
    if (headers['content-type'] === undefined && headers['Content-Type'] === undefined) {
      headers['content-type'] = binding.requestBody.contentType;
    }
  }

  const queryString = query.toString();
  const url = `${trimTrailingSlash(options.baseUrl)}${path}${queryString ? `?${queryString}` : ''}`;
  const method = binding.method.toUpperCase();

  const response = await options.fetchFn(url, {
    method,
    headers,
    ...(body === undefined ? {} : { body }),
  });

  const raw = await response.text();
  const contentType = response.headers.get('content-type');
  const parsed = isJsonContent(contentType) ? tryParseJson(raw) : raw;

  return {
    status: response.status,
    ok: response.ok,
    contentType,
    body: parsed,
    raw,
    request: { method, url },
  };
}

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function trimTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function isJsonContent(contentType: string | null): boolean {
  return contentType !== null && /\bjson\b/i.test(contentType);
}

function tryParseJson(raw: string): unknown {
  if (raw.trim() === '') return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
