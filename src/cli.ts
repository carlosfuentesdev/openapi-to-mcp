#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { createLogger } from './core/telemetry/index.js';
import type { Transport } from './core/telemetry/index.js';
import { toAppError } from './utils/errors.js';
import { loadSpec } from './openapi/load.js';
import { buildTools } from './generator/operations.js';
import { generateServerCode } from './generator/codegen.js';
import { createMcpServer } from './mcp/server.js';
import { startStdioServer } from './mcp/stdio.js';
import type { FetchLike } from './http/client.js';
import type { FormatMode } from './http/format.js';

const VERSION = '0.1.0';

/** Transporte que manda TODO a stderr: stdout queda limpio para el protocolo MCP. */
const stderrTransport: Transport = {
  emit(record) {
    process.stderr.write(`${JSON.stringify(record)}\n`);
  },
};

/** Envoltorio del `fetch` global con la forma desacoplada `FetchLike`. */
const nodeFetch: FetchLike = (url, init) =>
  fetch(url, init as RequestInit | undefined) as unknown as ReturnType<FetchLike>;

interface CliOptions {
  spec?: string;
  baseUrl?: string;
  headers: Record<string, string>;
  format: FormatMode;
  name?: string;
  list: boolean;
  codegenOut?: string;
}

async function runCli(argv: readonly string[]): Promise<void> {
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    printHelp();
    return;
  }
  if (argv.includes('--version') || argv.includes('-v')) {
    process.stdout.write(`openapi-to-mcp v${VERSION}\n`);
    return;
  }

  const isCodegen = argv[0] === 'codegen';
  const options = parseArgs(isCodegen ? argv.slice(1) : argv);

  if (options.spec === undefined) {
    throw toAppError(new Error('Falta --spec <ruta|url> con la especificación OpenAPI.'));
  }

  const doc = await loadSpec(options.spec, { fetchFn: nodeFetch });

  if (isCodegen) {
    await runCodegen(doc, options);
    return;
  }

  const { tools, baseUrl } = buildTools(doc, options.baseUrl === undefined ? {} : { baseUrl: options.baseUrl });

  if (options.list) {
    process.stdout.write(`${tools.length} herramienta(s) generada(s):\n`);
    for (const tool of tools) process.stdout.write(`  ${tool.name}  —  ${tool.description}\n`);
    return;
  }

  const resolvedBaseUrl = options.baseUrl ?? baseUrl;
  if (resolvedBaseUrl === undefined || resolvedBaseUrl === '') {
    throw toAppError(
      new Error(
        'No hay URL base para la API. Declara "servers" en la especificación o pásala con --base-url.',
      ),
    );
  }

  const logger = createLogger({ service: 'openapi-to-mcp', transport: stderrTransport });
  const server = createMcpServer({
    tools,
    baseUrl: resolvedBaseUrl,
    headers: options.headers,
    fetchFn: nodeFetch,
    formatMode: options.format,
    logger,
    ...(options.name === undefined ? {} : { serverInfo: { name: options.name, version: VERSION } }),
  });

  logger.info('servidor MCP listo', { tools: tools.length, baseUrl: resolvedBaseUrl });
  startStdioServer(server);
}

async function runCodegen(
  doc: import('./openapi/types.js').OpenApiDocument,
  options: CliOptions,
): Promise<void> {
  const code = generateServerCode(doc, {
    ...(options.baseUrl === undefined ? {} : { baseUrl: options.baseUrl }),
    ...(options.name === undefined ? {} : { serverName: options.name }),
  });
  if (options.codegenOut === undefined) {
    process.stdout.write(code);
    return;
  }
  await writeFile(options.codegenOut, code, 'utf8');
  process.stdout.write(`✓ Servidor MCP generado en ${options.codegenOut}\n`);
}

function parseArgs(argv: readonly string[]): CliOptions {
  const options: CliOptions = { headers: {}, format: 'markdown', list: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--spec':
      case '-s':
        options.spec = requireValue(argv, (i += 1), arg);
        break;
      case '--url':
        // Alias práctico: si te pasan la URL de la especificación como --url.
        options.spec = requireValue(argv, (i += 1), arg);
        break;
      case '--base-url':
        options.baseUrl = requireValue(argv, (i += 1), arg);
        break;
      case '--auth-header':
      case '--header':
      case '-H': {
        const [name, value] = splitHeader(requireValue(argv, (i += 1), arg));
        options.headers[name] = value;
        break;
      }
      case '--format':
        options.format = parseFormat(requireValue(argv, (i += 1), arg));
        break;
      case '--name':
      case '-n':
        options.name = requireValue(argv, (i += 1), arg);
        break;
      case '--out':
      case '-o':
        options.codegenOut = requireValue(argv, (i += 1), arg);
        break;
      case '--list':
        options.list = true;
        break;
      default:
        // Primer argumento posicional sin bandera: se toma como --spec.
        if (arg !== undefined && !arg.startsWith('-') && options.spec === undefined) {
          options.spec = arg;
        }
        break;
    }
  }

  return options;
}

function requireValue(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index];
  if (value === undefined) {
    throw toAppError(new Error(`La opción ${flag} necesita un valor.`));
  }
  return value;
}

function splitHeader(raw: string): [string, string] {
  const separator = raw.indexOf(':');
  if (separator === -1) {
    throw toAppError(new Error(`Cabecera mal formada: "${raw}". Usa el formato "Nombre: valor".`));
  }
  return [raw.slice(0, separator).trim(), raw.slice(separator + 1).trim()];
}

function parseFormat(raw: string): FormatMode {
  if (raw === 'json' || raw === 'markdown') return raw;
  throw toAppError(new Error(`Formato no válido: "${raw}". Usa "markdown" o "json".`));
}

function printHelp(): void {
  process.stdout.write(`openapi-to-mcp v${VERSION} — sirve cualquier OpenAPI 3.x como servidor MCP

USO
  openapi-to-mcp --spec <ruta|url> [opciones]   Levanta un servidor MCP por stdio
  openapi-to-mcp --spec <ruta|url> --list       Lista las herramientas y sale
  openapi-to-mcp codegen --spec <ruta|url> -o server.ts   Exporta un servidor autocontenido

OPCIONES
  -s, --spec <ruta|url>    Especificación OpenAPI (JSON o YAML, local o remota)
      --base-url <url>     URL base de la API (si la spec no declara "servers")
  -H, --auth-header <h>    Cabecera a propagar, "Nombre: valor" (repetible)
      --format <modo>      Formato de respuesta: markdown (por defecto) o json
  -n, --name <nombre>      Nombre del servidor MCP
      --list               Muestra las herramientas generadas y termina
  -o, --out <fichero>      (codegen) Fichero de salida
  -h, --help               Esta ayuda
  -v, --version            Versión

EJEMPLO
  openapi-to-mcp --spec https://api.example.com/openapi.json \\
    --auth-header "Authorization: Bearer XYZ"
`);
}

void runCli(process.argv.slice(2)).catch((error: unknown) => {
  const appError = toAppError(error);
  process.stderr.write(`✗ ${appError.message}\n`);
  process.exitCode = 1;
});
