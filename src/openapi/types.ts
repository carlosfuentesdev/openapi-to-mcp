/**
 * Modelo interno mínimo de OpenAPI 3.0 / 3.1.
 *
 * No pretende cubrir la especificación entera: sólo las piezas que el generador
 * consume para producir herramientas MCP. Todos los campos son opcionales porque
 * las especificaciones del mundo real son irregulares; la validación estricta se
 * hace en la frontera de entrada (`load.ts`) y al construir cada herramienta.
 */

/** Objeto Schema de OpenAPI (superconjunto práctico de JSON Schema). */
export interface SchemaObject {
  $ref?: string;
  type?: string | readonly string[];
  format?: string;
  enum?: readonly unknown[];
  const?: unknown;
  /** OpenAPI 3.0: marca el valor como anulable. En 3.1 se usa `type: [..,'null']`. */
  nullable?: boolean;
  items?: SchemaObject;
  properties?: Readonly<Record<string, SchemaObject>>;
  required?: readonly string[];
  additionalProperties?: boolean | SchemaObject;
  allOf?: readonly SchemaObject[];
  oneOf?: readonly SchemaObject[];
  anyOf?: readonly SchemaObject[];
  description?: string;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  pattern?: string;
  example?: unknown;
}

/** Objeto Parameter de OpenAPI. */
export interface ParameterObject {
  $ref?: string;
  name?: string;
  in?: 'path' | 'query' | 'header' | 'cookie';
  required?: boolean;
  description?: string;
  schema?: SchemaObject;
}

/** Cuerpo de la petición. */
export interface RequestBodyObject {
  required?: boolean;
  description?: string;
  content?: Readonly<Record<string, { schema?: SchemaObject }>>;
}

/** Una operación (método) sobre una ruta. */
export interface OperationObject {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: readonly string[];
  parameters?: readonly ParameterObject[];
  requestBody?: RequestBodyObject;
  deprecated?: boolean;
}

/** Un elemento de `paths`: agrupa las operaciones por método. */
export interface PathItemObject {
  parameters?: readonly ParameterObject[];
  get?: OperationObject;
  put?: OperationObject;
  post?: OperationObject;
  delete?: OperationObject;
  patch?: OperationObject;
  head?: OperationObject;
  options?: OperationObject;
  trace?: OperationObject;
}

/** Servidor declarado en la especificación. */
export interface ServerObject {
  url?: string;
  description?: string;
}

/** Documento OpenAPI completo (lo que consumimos de él). */
export interface OpenApiDocument {
  openapi?: string;
  info?: { title?: string; version?: string; description?: string };
  servers?: readonly ServerObject[];
  paths?: Readonly<Record<string, PathItemObject>>;
  components?: Readonly<Record<string, unknown>>;
}

/** Los verbos HTTP que se convierten en herramientas. */
export const HTTP_METHODS = [
  'get',
  'put',
  'post',
  'delete',
  'patch',
  'head',
  'options',
  'trace',
] as const;

export type HttpMethod = (typeof HTTP_METHODS)[number];
