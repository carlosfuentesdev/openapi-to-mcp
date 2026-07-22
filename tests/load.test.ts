import { describe, expect, it } from 'vitest';
import { parseSpecContent } from '../src/openapi/load.js';

const jsonSpec = `{
  "openapi": "3.0.3",
  "info": { "title": "Pet Store", "version": "1.0.0" },
  "servers": [{ "url": "https://api.petstore.test/v1" }],
  "paths": {
    "/pets": {
      "get": { "operationId": "listPets", "summary": "List pets" }
    }
  }
}`;

const yamlSpec = `openapi: 3.0.3
info:
  title: Pet Store
  version: 1.0.0
servers:
  - url: https://api.petstore.test/v1
paths:
  /pets:
    get:
      operationId: listPets
      summary: List pets
`;

describe('parseSpecContent', () => {
  it('interpreta una especificación en JSON', () => {
    const doc = parseSpecContent(jsonSpec);
    expect(doc.openapi).toBe('3.0.3');
    expect(doc.info?.title).toBe('Pet Store');
    expect(doc.paths?.['/pets']?.get?.operationId).toBe('listPets');
  });

  it('interpreta la misma especificación en YAML y produce la misma estructura', () => {
    const fromJson = parseSpecContent(jsonSpec);
    const fromYaml = parseSpecContent(yamlSpec);
    expect(fromYaml).toEqual(fromJson);
  });

  it('rechaza contenido que no es OpenAPI 3.x', () => {
    expect(() => parseSpecContent('{"swagger":"2.0","paths":{}}')).toThrow();
  });

  it('rechaza contenido ilegible', () => {
    expect(() => parseSpecContent('{ esto no es: json ni: yaml : :')).toThrow();
  });
});
