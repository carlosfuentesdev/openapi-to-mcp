import { describe, expect, it } from 'vitest';
import { buildTools } from '../src/generator/operations.js';
import { createMcpServer, PROTOCOL_VERSION } from '../src/mcp/server.js';
import type { FetchLike, FetchResponse } from '../src/http/client.js';
import type { JsonRpcRequest, JsonRpcSuccess } from '../src/mcp/jsonrpc.js';
import { petstore } from './fixtures/petstore.js';

interface RecordedCall {
  url: string;
  method: string | undefined;
  headers: Record<string, string> | undefined;
  body: string | undefined;
}

/** Doble de `fetch` que registra las llamadas y devuelve una respuesta fija. */
function mockFetch(status = 200, body: unknown = { ok: true }): {
  fetchFn: FetchLike;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const fetchFn: FetchLike = (url, init) => {
    calls.push({ url, method: init?.method, headers: init?.headers, body: init?.body });
    const response: FetchResponse = {
      status,
      ok: status >= 200 && status < 300,
      headers: { get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) },
      text: () => Promise.resolve(JSON.stringify(body)),
    };
    return Promise.resolve(response);
  };
  return { fetchFn, calls };
}

function req(id: number, method: string, params?: unknown): JsonRpcRequest {
  return { jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) };
}

function makeServer(status = 200, body: unknown = { ok: true }) {
  const { tools } = buildTools(petstore);
  const mock = mockFetch(status, body);
  const server = createMcpServer({
    tools,
    baseUrl: 'https://api.petstore.test/v1',
    headers: { Authorization: 'Bearer XYZ' },
    fetchFn: mock.fetchFn,
  });
  return { server, calls: mock.calls };
}

describe('createMcpServer', () => {
  it('responde a initialize con versión de protocolo y capacidad de tools', async () => {
    const { server } = makeServer();
    const res = (await server.handle(req(1, 'initialize'))) as JsonRpcSuccess;
    const result = res.result as { protocolVersion: string; capabilities: Record<string, unknown> };
    expect(result.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(result.capabilities).toHaveProperty('tools');
  });

  it('lista las herramientas con su inputSchema', async () => {
    const { server } = makeServer();
    const res = (await server.handle(req(2, 'tools/list'))) as JsonRpcSuccess;
    const result = res.result as { tools: { name: string; inputSchema: unknown }[] };
    expect(result.tools).toHaveLength(3);
    expect(result.tools.every((t) => typeof t.inputSchema === 'object')).toBe(true);
  });

  it('ignora las notificaciones (sin id) devolviendo null', async () => {
    const { server } = makeServer();
    const res = await server.handle({ jsonrpc: '2.0', method: 'notifications/initialized' });
    expect(res).toBeNull();
  });

  it('ejecuta tools/call haciendo un GET con parámetros de query', async () => {
    const { server, calls } = makeServer();
    await server.handle(
      req(3, 'tools/call', { name: 'list_pets', arguments: { limit: 10, status: 'available' } }),
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe('GET');
    expect(calls[0]?.url).toBe('https://api.petstore.test/v1/pets?limit=10&status=available');
    // La cabecera de autenticación se propaga a la API subyacente.
    expect(calls[0]?.headers?.['Authorization']).toBe('Bearer XYZ');
  });

  it('sustituye el parámetro de ruta en la URL', async () => {
    const { server, calls } = makeServer();
    await server.handle(req(4, 'tools/call', { name: 'get_pets_by_pet_id', arguments: { petId: 'abc123' } }));
    expect(calls[0]?.url).toBe('https://api.petstore.test/v1/pets/abc123');
    expect(calls[0]?.method).toBe('GET');
  });

  it('envía el cuerpo JSON en un POST con content-type', async () => {
    const { server, calls } = makeServer(201);
    await server.handle(
      req(5, 'tools/call', { name: 'create_pet', arguments: { body: { name: 'Rex', tag: 'dog' } } }),
    );
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.url).toBe('https://api.petstore.test/v1/pets');
    expect(calls[0]?.headers?.['content-type']).toMatch(/json/);
    expect(JSON.parse(calls[0]?.body ?? '{}')).toEqual({ name: 'Rex', tag: 'dog' });
  });

  it('devuelve el cuerpo de la respuesta formateado en el resultado', async () => {
    const { server } = makeServer(200, { id: 1, name: 'Rex' });
    const res = (await server.handle(
      req(6, 'tools/call', { name: 'get_pets_by_pet_id', arguments: { petId: '1' } }),
    )) as JsonRpcSuccess;
    const result = res.result as { content: { type: string; text: string }[]; isError: boolean };
    expect(result.isError).toBe(false);
    expect(result.content[0]?.text).toContain('Rex');
  });

  it('rechaza argumentos inválidos como resultado de herramienta (isError), sin llamar a la API', async () => {
    const { server, calls } = makeServer();
    const res = (await server.handle(
      req(7, 'tools/call', { name: 'list_pets', arguments: { status: 'no-existe' } }),
    )) as JsonRpcSuccess;
    const result = res.result as { isError: boolean; content: { text: string }[] };
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/inválidos/i);
    expect(calls).toHaveLength(0);
  });

  it('devuelve error de protocolo ante una herramienta desconocida', async () => {
    const { server } = makeServer();
    const res = await server.handle(req(8, 'tools/call', { name: 'no_existe', arguments: {} }));
    expect(res).not.toBeNull();
    expect(res).toHaveProperty('error');
  });

  it('marca isError cuando la API responde con un estado de error', async () => {
    const { server } = makeServer(404, { message: 'not found' });
    const res = (await server.handle(
      req(9, 'tools/call', { name: 'get_pets_by_pet_id', arguments: { petId: 'x' } }),
    )) as JsonRpcSuccess;
    const result = res.result as { isError: boolean };
    expect(result.isError).toBe(true);
  });
});
