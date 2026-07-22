import { badRequest } from '../utils/errors.js';
import type { OpenApiDocument, SchemaObject } from './types.js';

/**
 * Resuelve referencias locales `$ref` (`#/components/schemas/...`) contra el
 * documento raíz.
 *
 * Sólo se soportan referencias internas: las externas (a otros ficheros o URLs)
 * quedan fuera del alcance de esta versión y provocan un error explícito, en vez
 * de un fallo silencioso más difícil de diagnosticar.
 */
export class RefResolver {
  constructor(private readonly root: OpenApiDocument) {}

  /** Devuelve el nodo apuntado por un `$ref`, o lanza si no resuelve. */
  resolve(ref: string): SchemaObject {
    if (!ref.startsWith('#/')) {
      throw badRequest(
        `Referencia $ref no soportada: "${ref}". Sólo se admiten referencias locales que empiezan por "#/".`,
      );
    }

    const segments = ref
      .slice(2)
      .split('/')
      .map(decodePointerSegment);

    let node: unknown = this.root;
    for (const segment of segments) {
      if (node === null || typeof node !== 'object') {
        throw badRequest(`La referencia $ref "${ref}" no resuelve a ningún nodo.`);
      }
      node = (node as Record<string, unknown>)[segment];
    }

    if (node === null || typeof node !== 'object') {
      throw badRequest(`La referencia $ref "${ref}" no apunta a un objeto Schema.`);
    }

    return node as SchemaObject;
  }

  /**
   * Sigue la cadena de `$ref` hasta llegar a un schema concreto. Un ciclo de
   * referencias (poco habitual, pero posible) se corta lanzando un error.
   */
  deref(schema: SchemaObject): SchemaObject {
    const visited = new Set<string>();
    let current = schema;
    while (current.$ref !== undefined) {
      if (visited.has(current.$ref)) {
        throw badRequest(`Ciclo de referencias $ref detectado en "${current.$ref}".`);
      }
      visited.add(current.$ref);
      current = this.resolve(current.$ref);
    }
    return current;
  }
}

/** Decodifica el escape de JSON Pointer: `~1` → `/`, `~0` → `~`. */
function decodePointerSegment(segment: string): string {
  return segment.replace(/~1/g, '/').replace(/~0/g, '~');
}
