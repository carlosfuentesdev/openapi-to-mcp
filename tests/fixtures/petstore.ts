import type { OpenApiDocument } from '../../src/openapi/types.js';

/**
 * Especificación de ejemplo que ejercita las piezas relevantes del generador:
 * operationId explícito y ausente, parámetros de ruta/query, cuerpo con $ref,
 * enum y campos requeridos.
 */
export const petstore: OpenApiDocument = {
  openapi: '3.0.3',
  info: { title: 'Pet Store', version: '1.0.0' },
  servers: [{ url: 'https://api.petstore.test/v1' }],
  paths: {
    '/pets': {
      get: {
        operationId: 'listPets',
        summary: 'List all pets',
        parameters: [
          { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 100 } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['available', 'pending', 'sold'] } },
        ],
      },
      post: {
        operationId: 'createPet',
        summary: 'Create a pet',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/NewPet' } } },
        },
      },
    },
    '/pets/{petId}': {
      get: {
        // Sin operationId: el nombre se deriva de método + ruta.
        summary: 'Get a pet by id',
        parameters: [{ name: 'petId', in: 'path', required: true, schema: { type: 'string' } }],
      },
    },
  },
  components: {
    schemas: {
      NewPet: {
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
