import type { RefResolver } from '../openapi/resolve.js';
import type { SchemaObject } from '../openapi/types.js';

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

const MAX_DEPTH = 40;

/**
 * Devuelve una copia del schema con todas las referencias `$ref` locales ya
 * resueltas, apta para exponer como `inputSchema` de una herramienta MCP (JSON
 * Schema plano, sin `$ref` que el cliente tendría que resolver por su cuenta).
 *
 * Los ciclos de referencias se cortan sustituyendo la rama por `{}` (equivalente
 * a "cualquier valor"), en vez de expandir infinitamente.
 */
export function toJsonSchema(schema: SchemaObject, resolver: RefResolver): JsonValue {
  return deref(schema as unknown, resolver, new Set(), 0);
}

function deref(node: unknown, resolver: RefResolver, path: ReadonlySet<string>, depth: number): JsonValue {
  if (depth > MAX_DEPTH) return {};

  if (Array.isArray(node)) {
    return node.map((item) => deref(item, resolver, path, depth + 1));
  }

  if (node !== null && typeof node === 'object') {
    const obj = node as Record<string, unknown>;

    const ref = obj['$ref'];
    if (typeof ref === 'string') {
      if (path.has(ref)) return {};
      const nextPath = new Set(path);
      nextPath.add(ref);
      return deref(resolver.resolve(ref), resolver, nextPath, depth + 1);
    }

    const out: Record<string, JsonValue> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value === undefined) continue;
      out[key] = deref(value, resolver, path, depth + 1);
    }
    return out;
  }

  if (node === undefined) return null;
  return node as JsonValue;
}
