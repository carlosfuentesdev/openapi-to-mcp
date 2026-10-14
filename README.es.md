<div align="center">

# 🔌 openapi-to-mcp

**Convierte cualquier especificación OpenAPI 3.x en un servidor MCP en vivo.**
Apúntalo a una spec (fichero o URL) y cada endpoint se vuelve una herramienta
validada que tu agente de IA puede invocar — sin código pegamento, sin escribir
un servidor por cada API.

[![CI](https://github.com/carlosfuentesdev/openapi-to-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/carlosfuentesdev/openapi-to-mcp/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@karlangas12/openapi-to-mcp?color=cb3837&logo=npm)](https://www.npmjs.com/package/@karlangas12/openapi-to-mcp)
[![tests](https://img.shields.io/badge/tests-32%20passing-brightgreen)](#pruebas)
[![node](https://img.shields.io/badge/node-%E2%89%A520-brightgreen)](https://nodejs.org)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

[English](README.md)

</div>

---

## Por qué

MCP permite a un agente invocar herramientas, pero alguien tiene que escribirlas.
Si la capacidad que quieres ya existe como una API REST con especificación
OpenAPI, escribir un servidor MCP a medida para ella es trabajo mecánico.

`openapi-to-mcp` lee la especificación y hace el mapeo por ti: cada
`MÉTODO /ruta` se convierte en una herramienta, cada parámetro y cuerpo de
petición se vuelve una entrada **validada con Zod**, y cada llamada se traduce a
una petición HTTP con tu cabecera de autenticación. La respuesta vuelve recortada
para la ventana de contexto de un LLM.

## Inicio rápido

Sin instalación: ejecútalo directamente desde npm.

```bash
npx @karlangas12/openapi-to-mcp --spec https://api.example.com/openapi.json \
  --auth-header "Authorization: Bearer TU_TOKEN"
```

Mira qué herramientas produce una spec sin arrancar el servidor:

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
        "--auth-header", "Authorization: Bearer TU_TOKEN"
      ]
    }
  }
}
```

Reinicia el cliente y los endpoints de la API aparecen como herramientas.

## Cómo mapea

| OpenAPI | Se convierte en |
| --- | --- |
| `operationId`, o `MÉTODO /ruta` si falta | Nombre de la herramienta (`get_pets_by_pet_id`) |
| `summary` / `description` | Descripción de la herramienta |
| Parámetros de ruta, query y cabecera | Propiedades de entrada (los de ruta son obligatorios) |
| `requestBody` (`application/json`) | Una propiedad `body` |
| Cada schema de entrada | Un validador **Zod** + un JSON Schema para `tools/list` |
| `$ref` local (`#/components/...`) | Resuelto en línea |
| `enum`, `minimum`/`maximum`, `required`, `nullable`, `oneOf`/`anyOf`/`allOf` | Exigidos en la entrada |

Los argumentos se validan **antes** de que salga ninguna petición HTTP. Una
respuesta `4xx`/`5xx` vuelve como resultado de error que el modelo puede leer y
corregir, no como un fallo silencioso.

## Emparejar con mcp-shield-proxy

`openapi-to-mcp` habla con una **API de terceros** en tu nombre y con tus
credenciales. Si quieres una política, enmascarado de credenciales y un registro
de auditoría alrededor, envuélvelo con
[mcp-shield-proxy](https://www.npmjs.com/package/mcp-shield-proxy) — se componen
con una línea más:

```jsonc
{
  "mcpServers": {
    "petstore": {
      "command": "npx",
      "args": [
        "-y", "mcp-shield-proxy", "--",
        "npx", "-y", "@karlangas12/openapi-to-mcp",
        "--spec", "https://api.example.com/openapi.json",
        "--auth-header", "Authorization: Bearer TU_TOKEN"
      ]
    }
  }
}
```

## Limitaciones honestas

- **Sólo transporte stdio.** Cubre Claude Desktop, Cursor y Claude Code. Servir
  por HTTP/SSE nativo aún no está implementado.
- **Sólo `$ref` locales.** Las referencias internas (`#/components/...`) se
  resuelven; las externas (a otros ficheros o URLs) dan un error claro.
- **Cuerpos `application/json`.** `multipart/form-data` y formularios aún no.
- **Es un mapeador, no una pasarela.** No añade reintentos, caché ni límites de
  tasa. Emparéjalo con un proxy si los necesitas.

## Pruebas

```bash
npm test          # 32 tests
npm run typecheck # TypeScript estricto
```

Cubre el parseo JSON **y** YAML, la conversión endpoint→herramienta con esquemas
Zod, y un `tools/call` completo por JSON-RPC contra un backend HTTP simulado.

## Licencia

MIT
