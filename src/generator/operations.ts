import { z } from 'zod';
import { RefResolver } from '../openapi/resolve.js';
import { HTTP_METHODS } from '../openapi/types.js';
import type {
  HttpMethod,
  OpenApiDocument,
  ParameterObject,
  SchemaObject,
} from '../openapi/types.js';
import { schemaToZod } from '../schema/to-zod.js';
import { toJsonSchema } from '../schema/to-json.js';
import type { JsonValue } from '../schema/to-json.js';

export interface ParamBinding {
  readonly name: string;
  readonly in: 'path' | 'query' | 'header' | 'cookie';
  readonly required: boolean;
}

export interface ToolBinding {
  readonly method: HttpMethod;
  readonly pathTemplate: string;
  readonly params: readonly ParamBinding[];
  readonly requestBody?: { readonly required: boolean; readonly contentType: string };
}

export interface JsonSchemaObject {
  readonly type: 'object';
  readonly properties: Readonly<Record<string, JsonValue>>;
  readonly required: readonly string[];
  readonly additionalProperties: boolean;
}

export interface ToolDefinition {
  /** Nombre de la herramienta MCP, único y válido (`[a-z0-9_]`). */
  readonly name: string;
  readonly description: string;
  /** JSON Schema que se expone en `tools/list`. */
  readonly inputSchema: JsonSchemaObject;
  /** Validador Zod de los argumentos entrantes. */
  readonly input: z.ZodTypeAny;
  readonly binding: ToolBinding;
}

export interface BuildToolsResult {
  readonly tools: readonly ToolDefinition[];
  /** URL base resuelta (opción explícita o primer `servers[].url`). */
  readonly baseUrl: string | undefined;
}

export interface BuildToolsOptions {
  /** Fuerza la URL base, ignorando la declarada en la especificación. */
  readonly baseUrl?: string;
}

/** Tipo de contenido preferido para los cuerpos de petición. */
const PREFERRED_CONTENT = 'application/json';

/**
 * Construye la lista de herramientas MCP a partir de un documento OpenAPI: cada
 * par método + ruta se convierte en una herramienta con su schema y su binding.
 */
export function buildTools(doc: OpenApiDocument, options: BuildToolsOptions = {}): BuildToolsResult {
  const resolver = new RefResolver(doc);
  const baseUrl = options.baseUrl ?? firstServerUrl(doc);
  const tools: ToolDefinition[] = [];
  const usedNames = new Set<string>();

  for (const [path, pathItem] of Object.entries(doc.paths ?? {})) {
    const pathParams = pathItem.parameters ?? [];

    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (operation === undefined) continue;

      const params = mergeParameters(pathParams, operation.parameters ?? [], resolver);
      const name = uniqueName(toolName(operation.operationId, method, path), usedNames);

      const properties: Record<string, JsonValue> = {};
      const shape: Record<string, z.ZodTypeAny> = {};
      const required: string[] = [];
      const paramBindings: ParamBinding[] = [];

      for (const param of params) {
        if (param.name === undefined || param.in === undefined) continue;
        const isRequired = param.required === true || param.in === 'path';
        const schema: SchemaObject = param.schema ?? { type: 'string' };

        if (param.in !== 'cookie') {
          properties[param.name] = toJsonSchema(schema, resolver);
          const zod = schemaToZod(schema, resolver);
          shape[param.name] = isRequired ? zod : zod.optional();
          if (isRequired) required.push(param.name);
        }
        paramBindings.push({ name: param.name, in: param.in, required: isRequired });
      }

      let requestBody: ToolBinding['requestBody'];
      const bodySchema = jsonBodySchema(operation.requestBody?.content);
      if (bodySchema !== undefined) {
        const bodyRequired = operation.requestBody?.required === true;
        properties['body'] = toJsonSchema(bodySchema, resolver);
        const zod = schemaToZod(bodySchema, resolver);
        shape['body'] = bodyRequired ? zod : zod.optional();
        if (bodyRequired) required.push('body');
        requestBody = { required: bodyRequired, contentType: PREFERRED_CONTENT };
      }

      const inputSchema: JsonSchemaObject = {
        type: 'object',
        properties,
        required,
        additionalProperties: false,
      };

      tools.push({
        name,
        description: describe(operation.summary, operation.description, method, path),
        inputSchema,
        input: z.object(shape).passthrough(),
        binding: {
          method,
          pathTemplate: path,
          params: paramBindings,
          ...(requestBody === undefined ? {} : { requestBody }),
        },
      });
    }
  }

  return { tools, baseUrl };
}

function firstServerUrl(doc: OpenApiDocument): string | undefined {
  const url = doc.servers?.[0]?.url;
  return typeof url === 'string' && url.length > 0 ? url : undefined;
}

/** Fusiona parámetros de nivel de ruta y de operación; la operación gana. */
function mergeParameters(
  pathParams: readonly ParameterObject[],
  operationParams: readonly ParameterObject[],
  resolver: RefResolver,
): ParameterObject[] {
  const byKey = new Map<string, ParameterObject>();
  for (const raw of [...pathParams, ...operationParams]) {
    const param = raw.$ref !== undefined ? (resolver.resolve(raw.$ref) as unknown as ParameterObject) : raw;
    if (param.name === undefined || param.in === undefined) continue;
    byKey.set(`${param.in}:${param.name}`, param);
  }
  return [...byKey.values()];
}

/** Extrae el schema del cuerpo JSON, si la operación declara uno. */
function jsonBodySchema(
  content: Readonly<Record<string, { schema?: SchemaObject }>> | undefined,
): SchemaObject | undefined {
  if (content === undefined) return undefined;
  const direct = content[PREFERRED_CONTENT]?.schema;
  if (direct !== undefined) return direct;
  // Cualquier tipo `*/*+json` o similar también vale.
  for (const [type, media] of Object.entries(content)) {
    if (/json/i.test(type) && media.schema !== undefined) return media.schema;
  }
  return undefined;
}

/** Deriva el nombre de la herramienta: `operationId` o `metodo_ruta`. */
function toolName(operationId: string | undefined, method: HttpMethod, path: string): string {
  if (operationId !== undefined && operationId.trim() !== '') {
    return sanitizeName(operationId);
  }
  const segments = path
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.replace(/^\{(.+)\}$/, 'by_$1'));
  return sanitizeName([method, ...segments].join('_'));
}

/** Normaliza a `snake_case` válido para un nombre de herramienta MCP. */
function sanitizeName(raw: string): string {
  const snake = raw
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return snake.length > 0 ? snake : 'tool';
}

/** Garantiza que el nombre no colisione con otro ya generado. */
function uniqueName(base: string, used: Set<string>): string {
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let index = 2;
  while (used.has(`${base}_${index}`)) index += 1;
  const name = `${base}_${index}`;
  used.add(name);
  return name;
}

function describe(
  summary: string | undefined,
  description: string | undefined,
  method: HttpMethod,
  path: string,
): string {
  const text = summary ?? description;
  const suffix = `(${method.toUpperCase()} ${path})`;
  return text !== undefined && text.trim() !== '' ? `${text} ${suffix}` : `${method.toUpperCase()} ${path}`;
}
