import { describe, expect, it } from 'vitest';
import { RefResolver } from '../src/openapi/resolve.js';
import { schemaToZod } from '../src/schema/to-zod.js';
import type { OpenApiDocument, SchemaObject } from '../src/openapi/types.js';

/** Un documento con componentes reutilizables para probar la resolución de $ref. */
const doc: OpenApiDocument = {
  openapi: '3.0.3',
  components: {
    schemas: {
      Pet: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' },
          tag: { type: 'string' },
        },
      },
    },
  },
};

function zodOf(schema: SchemaObject) {
  return schemaToZod(schema, new RefResolver(doc));
}

describe('schemaToZod', () => {
  it('valida un string con enum como conjunto cerrado', () => {
    const zod = zodOf({ type: 'string', enum: ['available', 'pending', 'sold'] });
    expect(zod.safeParse('available').success).toBe(true);
    expect(zod.safeParse('unknown').success).toBe(false);
  });

  it('respeta enteros con mínimo y máximo', () => {
    const zod = zodOf({ type: 'integer', minimum: 1, maximum: 100 });
    expect(zod.safeParse(50).success).toBe(true);
    expect(zod.safeParse(0).success).toBe(false);
    expect(zod.safeParse(5.5).success).toBe(false); // no es entero
    expect(zod.safeParse(200).success).toBe(false);
  });

  it('exige las propiedades requeridas de un objeto y permite las opcionales', () => {
    const zod = zodOf({
      type: 'object',
      required: ['name'],
      properties: { name: { type: 'string' }, tag: { type: 'string' } },
    });
    expect(zod.safeParse({ name: 'Rex' }).success).toBe(true);
    expect(zod.safeParse({ tag: 'dog' }).success).toBe(false); // falta name
  });

  it('valida arrays con restricciones de tamaño', () => {
    const zod = zodOf({ type: 'array', items: { type: 'string' }, minItems: 1 });
    expect(zod.safeParse(['a']).success).toBe(true);
    expect(zod.safeParse([]).success).toBe(false);
    expect(zod.safeParse([1]).success).toBe(false); // el item no es string
  });

  it('resuelve un $ref a un componente y aplica su validación', () => {
    const zod = zodOf({ $ref: '#/components/schemas/Pet' });
    expect(zod.safeParse({ name: 'Rex', tag: 'dog' }).success).toBe(true);
    expect(zod.safeParse({ tag: 'dog' }).success).toBe(false);
  });

  it('admite null cuando el schema es nullable', () => {
    const zod = zodOf({ type: 'string', nullable: true });
    expect(zod.safeParse(null).success).toBe(true);
    expect(zod.safeParse('x').success).toBe(true);
    expect(zod.safeParse(3).success).toBe(false);
  });

  it('convierte oneOf en una unión', () => {
    const zod = zodOf({ oneOf: [{ type: 'string' }, { type: 'number' }] });
    expect(zod.safeParse('x').success).toBe(true);
    expect(zod.safeParse(3).success).toBe(true);
    expect(zod.safeParse(true).success).toBe(false);
  });
});
