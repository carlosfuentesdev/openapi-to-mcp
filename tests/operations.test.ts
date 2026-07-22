import { describe, expect, it } from 'vitest';
import { buildTools } from '../src/generator/operations.js';
import type { ToolDefinition } from '../src/generator/operations.js';
import { petstore } from './fixtures/petstore.js';

function byName(tools: readonly ToolDefinition[], name: string): ToolDefinition {
  const tool = tools.find((t) => t.name === name);
  if (tool === undefined) throw new Error(`No se generó la herramienta ${name}`);
  return tool;
}

describe('buildTools', () => {
  it('resuelve la URL base desde servers[]', () => {
    const { baseUrl } = buildTools(petstore);
    expect(baseUrl).toBe('https://api.petstore.test/v1');
  });

  it('genera una herramienta por cada operación', () => {
    const { tools } = buildTools(petstore);
    expect(tools.map((t) => t.name).sort()).toEqual(
      ['create_pet', 'get_pets_by_pet_id', 'list_pets'].sort(),
    );
  });

  it('usa operationId como nombre y deriva método_ruta cuando falta', () => {
    const { tools } = buildTools(petstore);
    expect(tools.some((t) => t.name === 'list_pets')).toBe(true);
    // GET /pets/{petId} sin operationId → nombre derivado.
    expect(tools.some((t) => t.name === 'get_pets_by_pet_id')).toBe(true);
  });

  it('mapea los parámetros de query al inputSchema sin marcarlos como requeridos', () => {
    const listPets = byName(buildTools(petstore).tools, 'list_pets');
    expect(Object.keys(listPets.inputSchema.properties).sort()).toEqual(['limit', 'status']);
    expect(listPets.inputSchema.required).toEqual([]);
    expect(listPets.binding.method).toBe('get');
    expect(listPets.binding.pathTemplate).toBe('/pets');
  });

  it('marca el parámetro de ruta como requerido', () => {
    const getPet = byName(buildTools(petstore).tools, 'get_pets_by_pet_id');
    expect(getPet.inputSchema.required).toContain('petId');
    expect(getPet.binding.params).toContainEqual({ name: 'petId', in: 'path', required: true });
  });

  it('resuelve el $ref del cuerpo y lo expone como propiedad "body" requerida', () => {
    const createPet = byName(buildTools(petstore).tools, 'create_pet');
    expect(createPet.binding.requestBody).toEqual({ required: true, contentType: 'application/json' });
    expect(createPet.inputSchema.required).toContain('body');
    const body = createPet.inputSchema.properties['body'] as { properties?: Record<string, unknown> };
    // El $ref a NewPet quedó resuelto: sus propiedades están presentes, sin $ref.
    expect(body.properties).toBeDefined();
    expect(Object.keys(body.properties ?? {}).sort()).toEqual(['name', 'tag']);
  });

  it('valida los argumentos con el schema Zod generado', () => {
    const listPets = byName(buildTools(petstore).tools, 'list_pets');
    expect(listPets.input.safeParse({ limit: 10, status: 'available' }).success).toBe(true);
    expect(listPets.input.safeParse({ status: 'invalid' }).success).toBe(false);
    expect(listPets.input.safeParse({ limit: 999 }).success).toBe(false);
  });
});
