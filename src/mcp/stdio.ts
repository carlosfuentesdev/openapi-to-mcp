import { failure, JSON_RPC_ERROR } from './jsonrpc.js';
import type { JsonRpcIncoming } from './jsonrpc.js';
import type { McpServer } from './server.js';

export interface StdioOptions {
  readonly input?: NodeJS.ReadableStream;
  readonly output?: NodeJS.WritableStream;
}

/**
 * Conecta un servidor MCP al transporte stdio: mensajes JSON-RPC delimitados por
 * saltos de línea, uno por línea, tal como define el transporte stdio de MCP.
 */
export function startStdioServer(server: McpServer, options: StdioOptions = {}): void {
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  let buffer = '';

  input.setEncoding('utf8');
  input.on('data', (chunk: string) => {
    buffer += chunk;
    let newlineIndex = buffer.indexOf('\n');
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line !== '') void processLine(line);
      newlineIndex = buffer.indexOf('\n');
    }
  });

  async function processLine(line: string): Promise<void> {
    let message: JsonRpcIncoming;
    try {
      message = JSON.parse(line) as JsonRpcIncoming;
    } catch {
      write(failure(null, JSON_RPC_ERROR.parse, 'Mensaje JSON-RPC no interpretable.'));
      return;
    }

    try {
      const response = await server.handle(message);
      if (response !== null) write(response);
    } catch (cause) {
      const id = readId(message);
      write(failure(id, JSON_RPC_ERROR.internal, cause instanceof Error ? cause.message : 'Error interno.'));
    }
  }

  function write(value: unknown): void {
    output.write(`${JSON.stringify(value)}\n`);
  }
}

function readId(message: JsonRpcIncoming): string | number | null {
  const id = (message as { id?: unknown }).id;
  return typeof id === 'string' || typeof id === 'number' ? id : null;
}
