/**
 * openapi-to-mcp — convierte una especificación OpenAPI 3.x en un servidor
 * Model Context Protocol (MCP). Este barrel expone la API pública para usarlo
 * como biblioteca; la CLI vive en `cli.ts`.
 */

export { loadSpec, parseSpecContent } from './openapi/load.js';
export type { LoadOptions } from './openapi/load.js';

export { RefResolver } from './openapi/resolve.js';
export type {
  OpenApiDocument,
  OperationObject,
  ParameterObject,
  PathItemObject,
  RequestBodyObject,
  SchemaObject,
  ServerObject,
  HttpMethod,
} from './openapi/types.js';
export { HTTP_METHODS } from './openapi/types.js';

export { schemaToZod } from './schema/to-zod.js';
export { toJsonSchema } from './schema/to-json.js';
export type { JsonValue } from './schema/to-json.js';

export { buildTools } from './generator/operations.js';
export type {
  BuildToolsOptions,
  BuildToolsResult,
  JsonSchemaObject,
  ParamBinding,
  ToolBinding,
  ToolDefinition,
} from './generator/operations.js';

export { generateServerCode } from './generator/codegen.js';
export type { CodegenOptions } from './generator/codegen.js';

export { executeTool } from './http/client.js';
export type {
  ExecuteOptions,
  FetchInit,
  FetchLike,
  FetchResponse,
  ToolCallResult,
} from './http/client.js';
export { formatResult } from './http/format.js';
export type { FormatMode } from './http/format.js';

export { createMcpServer, PROTOCOL_VERSION, defaultServerLogger } from './mcp/server.js';
export type { McpServer, McpServerOptions } from './mcp/server.js';
export { startStdioServer } from './mcp/stdio.js';
export type { StdioOptions } from './mcp/stdio.js';
export {
  failure,
  isRequest,
  success,
  JSON_RPC_ERROR,
} from './mcp/jsonrpc.js';
export type {
  JsonRpcErrorResponse,
  JsonRpcIncoming,
  JsonRpcNotification,
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcSuccess,
} from './mcp/jsonrpc.js';
