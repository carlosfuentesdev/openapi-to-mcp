import type { OpenApiDocument } from '../openapi/types.js';

export interface CodegenOptions {
  /** Nombre del paquete del que importar el runtime. */
  readonly packageName?: string;
  /** URL base a incrustar (si la especificación no declara servers). */
  readonly baseUrl?: string;
  /** Nombre del servidor anunciado en `initialize`. */
  readonly serverName?: string;
}

/**
 * Genera el código de un servidor MCP autocontenido en TypeScript que sirve una
 * especificación concreta. El resultado incrusta la especificación y arranca el
 * runtime de este paquete: un único fichero listo para ejecutar con `tsx`/`node`.
 */
export function generateServerCode(doc: OpenApiDocument, options: CodegenOptions = {}): string {
  const packageName = options.packageName ?? '@karlangas12/openapi-to-mcp';
  const serverName = options.serverName ?? doc.info?.title ?? 'openapi-mcp-server';
  const baseUrlLiteral = JSON.stringify(options.baseUrl ?? doc.servers?.[0]?.url ?? '');
  const specLiteral = JSON.stringify(doc, null, 2);

  return `#!/usr/bin/env node
// Servidor MCP generado por openapi-to-mcp. No editar a mano: regenéralo.
import { buildTools, createMcpServer, startStdioServer } from '${packageName}';

const spec = ${specLiteral} as const;

const { tools, baseUrl } = buildTools(spec);
const resolvedBaseUrl = baseUrl ?? ${baseUrlLiteral};
if (resolvedBaseUrl === '') {
  throw new Error('No hay URL base: define servers[] en la especificación o pásala al generar.');
}

const server = createMcpServer({
  tools,
  baseUrl: resolvedBaseUrl,
  serverInfo: { name: ${JSON.stringify(serverName)}, version: '0.1.0' },
  fetchFn: (url, init) => fetch(url, init as RequestInit | undefined) as never,
});

startStdioServer(server);
`;
}
