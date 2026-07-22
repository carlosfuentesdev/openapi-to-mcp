import { z } from 'zod';
import { createLogger, silentLogger } from '../core/telemetry/index.js';
import type { Logger } from '../core/telemetry/index.js';
import { executeTool } from '../http/client.js';
import type { FetchLike } from '../http/client.js';
import { formatResult } from '../http/format.js';
import type { FormatMode } from '../http/format.js';
import type { ToolDefinition } from '../generator/operations.js';
import {
  failure,
  isRequest,
  JSON_RPC_ERROR,
  success,
} from './jsonrpc.js';
import type { JsonRpcIncoming, JsonRpcResponse } from './jsonrpc.js';

/** Versión del protocolo MCP que anunciamos en `initialize`. */
export const PROTOCOL_VERSION = '2024-11-05';

export interface McpServerOptions {
  readonly tools: readonly ToolDefinition[];
  readonly baseUrl: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly fetchFn: FetchLike;
  readonly formatMode?: FormatMode;
  readonly serverInfo?: { readonly name: string; readonly version: string };
  readonly logger?: Logger;
}

export interface McpServer {
  /** Procesa un mensaje entrante y devuelve la respuesta, o `null` si era una notificación. */
  handle(message: JsonRpcIncoming): Promise<JsonRpcResponse | null>;
  readonly tools: readonly ToolDefinition[];
}

const callParamsSchema = z.object({
  name: z.string(),
  arguments: z.record(z.unknown()).optional(),
});

/**
 * Crea el servidor MCP a partir de las herramientas generadas. Es agnóstico del
 * transporte: recibe mensajes ya interpretados y devuelve respuestas, de modo
 * que puede probarse sin tocar stdin/stdout ni la red.
 */
export function createMcpServer(options: McpServerOptions): McpServer {
  const logger = options.logger ?? silentLogger;
  const byName = new Map(options.tools.map((tool) => [tool.name, tool]));
  const serverInfo = options.serverInfo ?? { name: 'openapi-to-mcp', version: '0.1.0' };

  async function handle(message: JsonRpcIncoming): Promise<JsonRpcResponse | null> {
    if (!isRequest(message)) {
      // Notificaciones (p. ej. `notifications/initialized`): sin respuesta.
      return null;
    }

    const { id, method } = message;

    switch (method) {
      case 'initialize':
        return success(id, {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo,
        });

      case 'ping':
        return success(id, {});

      case 'tools/list':
        return success(id, {
          tools: options.tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
          })),
        });

      case 'tools/call':
        return handleToolCall(id, message.params);

      default:
        return failure(id, JSON_RPC_ERROR.methodNotFound, `Método no soportado: ${method}`);
    }
  }

  async function handleToolCall(id: string | number, params: unknown): Promise<JsonRpcResponse> {
    const parsedParams = callParamsSchema.safeParse(params);
    if (!parsedParams.success) {
      return failure(id, JSON_RPC_ERROR.invalidParams, 'Parámetros de tools/call inválidos.');
    }

    const tool = byName.get(parsedParams.data.name);
    if (tool === undefined) {
      return failure(
        id,
        JSON_RPC_ERROR.invalidParams,
        `Herramienta desconocida: "${parsedParams.data.name}".`,
      );
    }

    const args = parsedParams.data.arguments ?? {};
    const validated = tool.input.safeParse(args);
    if (!validated.success) {
      // Se devuelve como resultado de herramienta (isError), no como error de
      // protocolo, para que el modelo lea el motivo y reintente corrigiendo.
      return success(id, toolError(`Argumentos inválidos: ${formatZodError(validated.error)}`));
    }

    try {
      const result = await executeTool(tool, validated.data as Record<string, unknown>, {
        baseUrl: options.baseUrl,
        ...(options.headers === undefined ? {} : { headers: options.headers }),
        fetchFn: options.fetchFn,
      });
      logger.info('tools/call', { tool: tool.name, status: result.status });
      const text = formatResult(result, options.formatMode ?? 'markdown');
      return success(id, {
        content: [{ type: 'text', text }],
        isError: !result.ok,
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      logger.error('fallo al ejecutar la herramienta', { tool: tool.name, error: message });
      return success(id, toolError(`Error al llamar a la API: ${message}`));
    }
  }

  return { handle, tools: options.tools };
}

function toolError(text: string): { content: { type: 'text'; text: string }[]; isError: true } {
  return { content: [{ type: 'text', text }], isError: true };
}

function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join('.') || '(raíz)'}: ${issue.message}`)
    .join('; ');
}

/** Logger de consola para el modo servidor (los logs van a stderr en la CLI). */
export function defaultServerLogger(): Logger {
  return createLogger({ service: 'openapi-to-mcp', level: 'info' });
}
