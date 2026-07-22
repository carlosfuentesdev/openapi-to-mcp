import { describe, expect, it } from 'vitest';
import { generateServerCode } from '../src/generator/codegen.js';
import { petstore } from './fixtures/petstore.js';

describe('generateServerCode', () => {
  it('genera un servidor autocontenido que importa el runtime e incrusta la spec', () => {
    const code = generateServerCode(petstore, { packageName: '@karlangas12/openapi-to-mcp' });
    expect(code).toContain("import { buildTools, createMcpServer, startStdioServer } from '@karlangas12/openapi-to-mcp'");
    expect(code).toContain('startStdioServer(server)');
    // La especificación queda incrustada literalmente.
    expect(code).toContain('"Pet Store"');
    expect(code).toContain('/pets/{petId}');
  });

  it('incrusta la URL base indicada cuando la spec no declara servers', () => {
    const code = generateServerCode({ openapi: '3.0.3', paths: {} }, { baseUrl: 'https://x.test' });
    expect(code).toContain('https://x.test');
  });
});
