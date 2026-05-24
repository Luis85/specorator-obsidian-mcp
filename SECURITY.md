# Security policy

## Supported versions

The latest released version on the `main` branch is supported. Older versions receive security updates only on a best-effort basis.

## Reporting a vulnerability

If you discover a security vulnerability, please **do not** open a public issue. Instead, use GitHub's private vulnerability reporting:

- **GitHub Security Advisories:** [Report a vulnerability](https://github.com/Luis85/specorator-obsidian-mcp/security/advisories/new)
- **Response time:** best-effort within 7 days.

Please include:
- A description of the vulnerability
- Steps to reproduce
- Affected version(s)
- Suggested mitigation if any

We will acknowledge receipt, work on a fix, and coordinate disclosure with you.

## Trust model

This plugin runs a local HTTP server on `127.0.0.1` that exposes the user's vault as a typed agent tool surface. The trust boundary is the user's machine — anything running locally can reach the server. The server is **disabled by default**; the user explicitly starts it.

See [ADR-001](docs/adr/ADR-001-loopback-mcp-server.md) and [ADR-002](docs/adr/ADR-002-permission-modes.md) for the detailed security model.

## Hardening checklist

The plugin applies:
- Loopback-only HTTP bind (127.0.0.1)
- Host-header gate (rejects non-loopback hosts with HTTP 421)
- Origin header gate (rejects cross-origin browser requests)
- Settings-driven allow/ask/deny permission gate per tool
- Path deny-list (glob-matched, applied to every path-shaped param)
- Vault path normalization (rejects `..` traversal and absolute paths)
- Atomic writes to user config files (tmp + rename)
- Symlink guard before writing user config files
- `.bak` backup before rotating user config files
- No source maps in production builds
