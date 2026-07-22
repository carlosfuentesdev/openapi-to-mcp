import { z } from 'zod';
import type { RefResolver } from '../openapi/resolve.js';
import type { SchemaObject } from '../openapi/types.js';

/** Profundidad máxima de recursión, como red de seguridad ante schemas cíclicos. */
const MAX_DEPTH = 40;

/**
 * Convierte un Objeto Schema de OpenAPI en un validador Zod para comprobar los
 * argumentos entrantes de una herramienta antes de tocar la API subyacente.
 */
export function schemaToZod(
  schema: SchemaObject,
  resolver: RefResolver,
  depth = 0,
): z.ZodTypeAny {
  if (depth > MAX_DEPTH) return z.any();

  if (schema.$ref !== undefined) {
    return schemaToZod(resolver.resolve(schema.$ref), resolver, depth + 1);
  }

  const nullableByType = Array.isArray(schema.type) && schema.type.includes('null');
  const isNullable = schema.nullable === true || nullableByType;

  let zod = buildBase(schema, resolver, depth);
  if (isNullable) zod = zod.nullable();
  if (schema.description !== undefined) zod = zod.describe(schema.description);

  return zod;
}

function buildBase(schema: SchemaObject, resolver: RefResolver, depth: number): z.ZodTypeAny {
  // Combinadores primero: mandan sobre `type`.
  if (schema.enum !== undefined && schema.enum.length > 0) {
    return literalUnion(schema.enum);
  }
  if (schema.allOf !== undefined && schema.allOf.length > 0) {
    return schema.allOf
      .map((sub) => schemaToZod(sub, resolver, depth + 1))
      .reduce((acc, next) => z.intersection(acc, next));
  }
  if (schema.oneOf !== undefined && schema.oneOf.length > 0) {
    return unionOf(schema.oneOf.map((sub) => schemaToZod(sub, resolver, depth + 1)));
  }
  if (schema.anyOf !== undefined && schema.anyOf.length > 0) {
    return unionOf(schema.anyOf.map((sub) => schemaToZod(sub, resolver, depth + 1)));
  }

  const type = normalizeType(schema.type);

  switch (type) {
    case 'string':
      return buildString(schema);
    case 'integer':
      return applyNumberBounds(z.number().int(), schema);
    case 'number':
      return applyNumberBounds(z.number(), schema);
    case 'boolean':
      return z.boolean();
    case 'array': {
      const items = schema.items ? schemaToZod(schema.items, resolver, depth + 1) : z.any();
      return applyArrayBounds(z.array(items), schema);
    }
    case 'object':
      return buildObject(schema, resolver, depth);
    default:
      // Sin `type` pero con `properties`: se trata como objeto.
      if (schema.properties !== undefined) return buildObject(schema, resolver, depth);
      return z.any();
  }
}

function buildString(schema: SchemaObject): z.ZodTypeAny {
  let str = z.string();
  if (typeof schema.minLength === 'number') str = str.min(schema.minLength);
  if (typeof schema.maxLength === 'number') str = str.max(schema.maxLength);
  switch (schema.format) {
    case 'email':
      return str.email();
    case 'uri':
    case 'url':
      return str.url();
    case 'uuid':
      return str.uuid();
    default:
      return str;
  }
}

function applyNumberBounds(base: z.ZodNumber, schema: SchemaObject): z.ZodNumber {
  let num = base;
  if (typeof schema.minimum === 'number') num = num.min(schema.minimum);
  if (typeof schema.maximum === 'number') num = num.max(schema.maximum);
  return num;
}

function applyArrayBounds(base: z.ZodArray<z.ZodTypeAny>, schema: SchemaObject): z.ZodTypeAny {
  let arr = base;
  if (typeof schema.minItems === 'number') arr = arr.min(schema.minItems);
  if (typeof schema.maxItems === 'number') arr = arr.max(schema.maxItems);
  return arr;
}

function buildObject(schema: SchemaObject, resolver: RefResolver, depth: number): z.ZodTypeAny {
  const properties = schema.properties ?? {};
  const required = new Set(schema.required ?? []);
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const [key, propSchema] of Object.entries(properties)) {
    const zod = schemaToZod(propSchema, resolver, depth + 1);
    shape[key] = required.has(key) ? zod : zod.optional();
  }

  const base = z.object(shape);
  // Permisivo por defecto: una API puede añadir campos y no queremos rechazar
  // argumentos válidos. Sólo se cierra si el schema prohíbe extras explícitamente.
  return schema.additionalProperties === false ? base.strict() : base.passthrough();
}

function normalizeType(type: SchemaObject['type']): string | undefined {
  if (type === undefined) return undefined;
  if (Array.isArray(type)) return type.find((t) => t !== 'null');
  return type as string;
}

function literalUnion(values: readonly unknown[]): z.ZodTypeAny {
  const literals = values
    .filter((v): v is string | number | boolean => ['string', 'number', 'boolean'].includes(typeof v))
    .map((v) => z.literal(v));
  if (literals.length === 0) return z.any();
  return unionOf(literals);
}

function unionOf(members: readonly z.ZodTypeAny[]): z.ZodTypeAny {
  if (members.length === 0) return z.any();
  if (members.length === 1) return members[0] as z.ZodTypeAny;
  return z.union(members as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]);
}
