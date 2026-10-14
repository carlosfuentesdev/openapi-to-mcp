# Security Policy

## Supported versions

`openapi-to-mcp` is pre-1.0. Security fixes are applied to the latest published
release. Pin a version if you need stability, and watch releases for advisories.

| Version | Supported |
| --- | --- |
| Latest `0.x` | ✅ |
| Older `0.x` | ❌ |

## Reporting a vulnerability

**Please do not open a public issue for a security vulnerability.** Public
disclosure before a fix puts every user at risk.

Report privately through **GitHub's private vulnerability reporting**:

1. Go to the [**Security** tab](https://github.com/carlosfuentesdev/openapi-to-mcp/security)
   of this repository.
2. Click **Report a vulnerability**.
3. Describe the issue, the affected version, and a reproduction if you have one.

## What to expect

- **Acknowledgement within 48 hours.**
- An initial assessment and a proposed timeline shortly after.
- Credit in the release notes when the fix is published, unless you prefer to
  remain anonymous.

## Scope

This tool builds an MCP server that forwards calls to an API **you point it at**,
using credentials **you supply**. Keep in mind:

- It is a mapper, not a sandbox or a gateway — it does not confine the API it
  talks to. To inspect, mask credentials in, and audit the generated traffic,
  wrap it with [mcp-shield-proxy](https://www.npmjs.com/package/mcp-shield-proxy).

Genuinely in scope: a crafted spec that makes the generator emit a request to an
unintended host, that leaks a configured auth header to the wrong origin, or that
bypasses the Zod validation of tool arguments before the HTTP call.
