import { readFile } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';
import { badRequest } from '../utils/errors.js';
import type { FetchLike } from '../http/client.js';
import type { OpenApiDocument } from './types.js';

export interface LoadOptions {
  /** Cliente HTTP para especificaciones remotas. Inyectable para los tests. */
  readonly fetchFn?: FetchLike;
  /** Lector de ficheros. Inyectable para los tests. */
  readonly readFileFn?: (path: string) => Promise<string>;
}

/**
 * Carga una especificación OpenAPI desde una ruta local o una URL, en JSON o
 * YAML, y la devuelve como documento tras validar que es OpenAPI 3.x.
 */
export async function loadSpec(source: string, options: LoadOptions = {}): Promise<OpenApiDocument> {
  const text = await readSource(source, options);
  return parseSpecContent(text, source);
}

/** Interpreta el contenido de una especificación (JSON o YAML) y lo valida. */
export function parseSpecContent(text: string, source = '<inline>'): OpenApiDocument {
  const trimmed = text.trimStart();
  const looksLikeJson = trimmed.startsWith('{') || trimmed.startsWith('[');

  let parsed: unknown;
  try {
    parsed = looksLikeJson ? JSON.parse(text) : parseYaml(text);
  } catch (cause) {
    throw badRequest(
      `No se ha podido interpretar la especificación de "${source}": no es JSON ni YAML válido.`,
      cause instanceof Error ? cause.message : undefined,
    );
  }

  return assertOpenApiDocument(parsed, source);
}

/** Valida la forma mínima de un documento OpenAPI 3.x. */
function assertOpenApiDocument(value: unknown, source: string): OpenApiDocument {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw badRequest(`La especificación de "${source}" no es un objeto OpenAPI.`);
  }

  const doc = value as Record<string, unknown>;
  const version = doc['openapi'];
  if (typeof version !== 'string' || !version.startsWith('3.')) {
    throw badRequest(
      `Sólo se admite OpenAPI 3.x. La especificación de "${source}" declara openapi="${String(version)}".`,
    );
  }

  if (doc['paths'] !== undefined && (typeof doc['paths'] !== 'object' || doc['paths'] === null)) {
    throw badRequest(`El campo "paths" de "${source}" no es un objeto.`);
  }

  return value as OpenApiDocument;
}

/** Obtiene el texto de la especificación desde el origen indicado. */
async function readSource(source: string, options: LoadOptions): Promise<string> {
  if (/^https?:\/\//i.test(source)) {
    const fetchFn = options.fetchFn ?? defaultFetch;
    const response = await fetchFn(source, { method: 'GET' });
    if (!response.ok) {
      throw badRequest(
        `No se ha podido descargar la especificación de "${source}": HTTP ${response.status}.`,
      );
    }
    return response.text();
  }

  const readFileFn = options.readFileFn ?? ((path: string) => readFile(path, 'utf8'));
  try {
    return await readFileFn(source);
  } catch (cause) {
    throw badRequest(
      `No se ha podido leer la especificación en "${source}".`,
      cause instanceof Error ? cause.message : undefined,
    );
  }
}

/** Envoltorio del `fetch` global con la forma desacoplada `FetchLike`. */
const defaultFetch: FetchLike = (url, init) =>
  fetch(url, init as RequestInit | undefined) as unknown as ReturnType<FetchLike>;
