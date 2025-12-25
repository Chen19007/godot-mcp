# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Test Commands

```bash
npm install          # Install dependencies
npm start            # Run MCP server (node index.js)
npm test             # Run server tests (node test-server.cjs)
```

## Project Overview

This is an **MCP (Model Context Protocol) server** for Godot GDScript automated checking. It provides 5 tools to lint, format, validate exports, and check errors in Godot projects.

## Architecture

- **Main Server**: `index.js` - Uses `@modelcontextprotocol/sdk` to implement an MCP server with StdioServerTransport
- **Tool Handler**: `handleTool()` function dispatches to 5 tools based on name
- **Path Handling**: `getProjectPath()` and `validateProjectPath()` handle project path resolution and validation

## Key Tools

| Tool | Purpose | Required Parameters |
|------|---------|---------------------|
| `gdlint` | Run gdlint on GDScript files | `project` (abs), `file` (abs), `all` (bool) |
| `gdformat` | Format GDScript files with gdformat | `project` (abs), `file` (abs), `check` (bool) |
| `godot_export_validate` | Validate exports using Godot's --export-pack flag | `project` (abs), `preset` (str) |
| `godot_check_all` | Run lint + format + export validation sequentially | `project` (abs), `file` (optional, abs) |
| `godot_get_errors` | Parse error logs for ERROR/Error/error patterns | `project` (abs), `log_file` (optional, abs) |

## Path Requirements

**ALL path parameters MUST be absolute paths:**
- `project`: Godot project root directory (must be absolute)
- `file`: GDScript file path (must be absolute)
- `log_file`: Log file path (must be absolute)
- `output`: Export output path (must be absolute)

Relative paths will be rejected with an error.

## Configuration

- `GODOT_BIN` environment variable: Path to Godot executable (defaults to `godot` in PATH)
- Project paths: Must be absolute paths
- Temporary pack files from export validation are automatically cleaned up

## Important Implementation Notes

- Use `process.stderr.write()` for server errors - never `console.log/error` as they interfere with MCP protocol communication on stdout
- Tool results return `{ success, output, errors, project }` structure
- The `godot_check_all` tool chains multiple tool calls and aggregates results

