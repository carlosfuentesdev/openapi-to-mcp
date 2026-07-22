/**
 * Tipos y utilidades del protocolo JSON-RPC 2.0, que es la base del transporte
 * MCP. Se mantienen mínimos y sin dependencias: sólo lo que el servidor usa.
 */

export interface JsonRpcRequest {
  readonly jsonrpc: '2.0';
  readonly id: string | number;
  readonly method: string;
  readonly params?: unknown;
}

export interface JsonRpcNotification {
  readonly jsonrpc: '2.0';
  readonly method: string;
  readonly params?: unknown;
}

export type JsonRpcIncoming = JsonRpcRequest | JsonRpcNotification;

export interface JsonRpcSuccess {
  readonly jsonrpc: '2.0';
  readonly id: string | number;
  readonly result: unknown;
}

export interface JsonRpcErrorResponse {
  readonly jsonrpc: '2.0';
  readonly id: string | number | null;
  readonly error: { readonly code: number; readonly message: string; readonly data?: unknown };
}

export type JsonRpcResponse = JsonRpcSuccess | JsonRpcErrorResponse;

/** Códigos de error estándar de JSON-RPC 2.0. */
export const JSON_RPC_ERROR = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internal: -32603,
} as const;

export function success(id: string | number, result: unknown): JsonRpcSuccess {
  return { jsonrpc: '2.0', id, result };
}

export function failure(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcErrorResponse {
  return {
    jsonrpc: '2.0',
    id,
    error: { code, message, ...(data === undefined ? {} : { data }) },
  };
}

/** Distingue una petición (con `id`) de una notificación (sin `id`). */
export function isRequest(message: JsonRpcIncoming): message is JsonRpcRequest {
  return 'id' in message && (message as JsonRpcRequest).id !== undefined;
}
