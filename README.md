<div align="center">

# 🔌 openapi-to-mcp

**Turn any OpenAPI 3.x spec into a live MCP server.**
Point it at a spec (file or URL) and every endpoint becomes a validated tool your
AI agent can call — no glue code, no per-API server to write.

[![CI](https://github.com/carlosfuentesdev/openapi-to-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/carlosfuentesdev/openapi-to-mcp/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@karlangas12/openapi-to-mcp?color=cb3837&logo=npm)](https://www.npmjs.com/package/@karlangas12/openapi-to-mcp)
[![tests](https://img.shields.io/badge/tests-32%20passing-brightgreen)](#testing)
[![node](https://img.shields.io/badge/node-%E2%89%A520-brightgreen)](https://nodejs.org)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

[Quick start](#quick-start) · [How it maps](#how-it-maps) · [Config](#configuration) · [Secure it](#pairing-with-mcp-shield-proxy) · [Limits](#honest-limitations) · [Español](README.es.md)

</div>

```
  OpenAPI 3.x spec                         your AI client
 (JSON / YAML, file or URL)               (Claude, Cursor)
          │                                      │
          ▼                                      │  MCP / JSON-RPC (stdio)
 [ openapi-to-mcp ]  ◀───────────────────────────┘
          │  GET /pets/{id} → tool "get_pet_by_id"
          ▼  HTTP + your auth header
   the underlying REST API
```

---

## Why

MCP lets an agent call tools, but someone has to write those tools. If the
capability you want already exists as a REST API with an OpenAPI spec, writing a
bespoke MCP server for it is busywork.

`openapi-to-mcp` reads the spec and does the mapping for you: each `METHOD /path`
becomes a tool, each parameter and request body becomes a **Zod-validated** input,
and every call is turned into an HTTP request with your auth header attached. The
response comes back trimmed for an LLM context window.

## Quick start

No install needed — run it straight from npm:

```bash
npx @karlangas12/openapi-to-mcp --spec https://api.example.com/openapi.json \
  --auth-header "Authorization: Bearer YOUR_TOKEN"
```

See what tools a spec produces without starting a server:

```bash
npx @karlangas12/openapi-to-mcp --spec ./openapi.yaml --list
```

### Claude Desktop — `claude_desktop_config.json`

```jsonc
{
  "mcpServers": {
    "petstore": {
      "command": "npx",
      "args": [
        "-y", "@karlangas12/openapi-to-mcp",
        "--spec", "https://petstore3.swagger.io/api/v3/openapi.json",
        "--auth-header", "Authorization: Bearer YOUR_TOKEN"
      ]
    }
  }
}
```

### Cursor — `.cursor/mcp.json`

```jsonc
{
  "mcpServers": {
    "my-api": {
      "command": "npx",
      "args": [
        "-y", "@karlangas12/openapi-to-mcp",
        "--spec", "./openapi.yaml",
        "--base-url", "https://api.internal.company.com"
      ]
    }
  }
}
```

That's the whole integration. Restart the client and the API's endpoints show up
as tools.

## How it maps

| OpenAPI | Becomes |
| --- | --- |
| `operationId`, or `METHOD /path` if absent | Tool name (`get_pets_by_pet_id`) |
| `summary` / `description` | Tool description |
| Path, query and header parameters | Tool input properties (path params are required) |
| `requestBody` (`application/json`) | A `body` input property |
| Every input schema | A **Zod** validator + a JSON Schema for `tools/list` |
| Local `$ref` (`#/components/...`) | Resolved inline |
| `enum`, `minimum`/`maximum`, `required`, `nullable`, `oneOf`/`anyOf`/`allOf` | Enforced on input |

When the agent calls a tool, arguments are validated **before** any HTTP request
goes out. Path params are substituted into the URL, query params are appended,
header params and your static `--auth-header` values are sent, and a JSON body is
serialized. A `4xx`/`5xx` response comes back as an error result the model can
read and react to — not a silent failure.

## Configuration

```
openapi-to-mcp --spec <path|url> [options]

  -s, --spec <path|url>    OpenAPI 3.x spec (JSON or YAML, local or remote)
      --base-url <url>     API base URL (when the spec declares no "servers")
  -H, --auth-header <h>    Header to forward, "Name: value" (repeatable)
      --format <mode>      Response format: markdown (default) or json
  -n, --name <name>        MCP server name
      --list               Print the generated tools and exit
  -h, --help / -v, --version
```

Multiple headers:

```bash
npx @karlangas12/openapi-to-mcp --spec ./api.yaml \
  --auth-header "Authorization: Bearer XYZ" \
  --auth-header "X-Api-Version: 2024-01"
```

### Export a standalone server (codegen)

```bash
npx @karlangas12/openapi-to-mcp codegen --spec ./api.yaml -o server.ts
```

Writes a single self-contained TypeScript file that embeds the spec and boots the
server via this package — handy for committing a pinned server to a repo.

## Pairing with mcp-shield-proxy

`openapi-to-mcp` talks to a **third-party API** on your behalf, with your
credentials. If you want a policy, credential masking and an audit trail around
that, wrap it with [mcp-shield-proxy](https://www.npmjs.com/package/mcp-shield-proxy)
— they compose with one extra line:

```jsonc
{
  "mcpServers": {
    "petstore": {
      "command": "npx",
      "args": [
        "-y", "mcp-shield-proxy", "--",          // ← inspect, mask, audit
        "npx", "-y", "@karlangas12/openapi-to-mcp",
        "--spec", "https://api.example.com/openapi.json",
        "--auth-header", "Authorization: Bearer YOUR_TOKEN"
      ]
    }
  }
}
```

Now every generated tool call is policy-checked, credentials in the traffic are
masked, and the whole session lands in a verifiable audit log.

## Use as a library

```ts
import { loadSpec, buildTools, createMcpServer, startStdioServer } from '@karlangas12/openapi-to-mcp';

const doc = await loadSpec('./openapi.yaml');
const { tools, baseUrl } = buildTools(doc);

const server = createMcpServer({
  tools,
  baseUrl: baseUrl ?? 'https://api.example.com',
  headers: { Authorization: 'Bearer YOUR_TOKEN' },
  fetchFn: (url, init) => fetch(url, init as RequestInit),
});

startStdioServer(server);
```

The parser, the schema→Zod converter and the tool builder are all exported
independently.

## Honest limitations

- **stdio transport only.** The MCP server speaks stdio, which covers Claude
  Desktop, Cursor and Claude Code. Native HTTP/SSE serving isn't implemented yet.
- **Local `$ref` only.** References inside the document (`#/components/...`) are
  resolved. External refs (other files or URLs) are not — they raise a clear
  error rather than failing quietly.
- **`application/json` bodies.** Request bodies are mapped for JSON content.
  `multipart/form-data` and `application/x-www-form-urlencoded` aren't mapped yet.
- **It's a mapper, not a gateway.** It doesn't add retries, caching or rate
  limiting. Pair it with a proxy if you need those.

## Performance

The spec is parsed once at startup; after that, each tool call is a schema
validation plus one HTTP request. Parsing and tool generation for a typical spec
is sub-millisecond — the latency you feel is the underlying API's, not this.

## Testing

```bash
npm test          # 32 tests
npm run typecheck # strict TypeScript
```

Coverage includes JSON **and** YAML parsing, endpoint→tool conversion with Zod
schemas, and a full `tools/call` round trip over JSON-RPC against a mocked HTTP
backend (asserting the URL, method, headers and body that reach it).

## License

MIT
