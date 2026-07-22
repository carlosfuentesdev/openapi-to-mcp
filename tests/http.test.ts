import { describe, expect, it } from 'vitest';
import { buildTools } from '../src/generator/operations.js';
import { executeTool } from '../src/http/client.js';
import type { FetchLike, FetchResponse } from '../src/http/client.js';
import type { OpenApiDocument } from '../src/openapi/types.js';

const spec: OpenApiDocument = {
  openapi: '3.0.3',
  servers: [{ url: 'https://api.example.test' }],
  paths: {
    '/search/{index}': {
      post: {
        operationId: 'search',
        parameters: [
          { name: 'index', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'X-Trace-Id', in: 'header', schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', properties: { q: { type: 'string' } } } } },
        },
      },
    },
  },
};

function mockFetch(): { fetchFn: FetchLike; last: () => { url: string; init: Parameters<FetchLike>[1] } } {
  let recorded: { url: string; init: Parameters<FetchLike>[1] } | undefined;
  const fetchFn: FetchLike = (url, init) => {
    recorded = { url, init };
    const response: FetchResponse = {
      status: 200,
      ok: true,
      headers: { get: () => 'application/json' },
      text: () => Promise.resolve('{"hits":3}'),
    };
    return Promise.resolve(response);
  };
  return {
    fetchFn,
    last: () => {
      if (recorded === undefined) throw new Error('fetch no fue invocado');
      return recorded;
    },
  };
}

describe('executeTool', () => {
  it('mapea ruta, query, cabecera y cuerpo a la petición HTTP', async () => {
    const { tools, baseUrl } = buildTools(spec);
    const tool = tools[0];
    if (tool === undefined || baseUrl === undefined) throw new Error('spec inválida en el test');

    const mock = mockFetch();
    const result = await executeTool(
      tool,
      { index: 'books', page: 2, 'X-Trace-Id': 't-1', body: { q: 'zod' } },
      { baseUrl, headers: { Authorization: 'Bearer K' }, fetchFn: mock.fetchFn },
    );

    const { url, init } = mock.last();
    expect(url).toBe('https://api.example.test/search/books?page=2');
    expect(init?.method).toBe('POST');
    expect(init?.headers?.['X-Trace-Id']).toBe('t-1');
    expect(init?.headers?.['Authorization']).toBe('Bearer K');
    expect(JSON.parse(init?.body ?? '{}')).toEqual({ q: 'zod' });

    // La respuesta JSON se interpreta.
    expect(result.ok).toBe(true);
    expect(result.body).toEqual({ hits: 3 });
  });

  it('codifica los valores de los parámetros de ruta', async () => {
    const { tools, baseUrl } = buildTools(spec);
    const tool = tools[0];
    if (tool === undefined || baseUrl === undefined) throw new Error('spec inválida en el test');

    const mock = mockFetch();
    await executeTool(tool, { index: 'a/b c', body: { q: 'x' } }, { baseUrl, fetchFn: mock.fetchFn });
    expect(mock.last().url).toBe('https://api.example.test/search/a%2Fb%20c');
  });
});
