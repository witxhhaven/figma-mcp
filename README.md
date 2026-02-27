# Figma MCP Bridge

An MCP (Model Context Protocol) server that lets Claude read and modify Figma files. It pairs a lightweight Figma plugin with a local Node.js server — Claude handles all the intelligence, the plugin is just a bridge.

```
Claude ←(stdio)→ MCP Server ←(WebSocket)→ Figma Plugin ←(Plugin API)→ Figma
```

## Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [Figma](https://www.figma.com/downloads/) desktop app
- **Claude Code** (CLI) or **Claude Desktop** app

## Quick Start

### Step 1: Install and build

```bash
git clone <repo-url> figma-mcp
cd figma-mcp
npm install
npm run build:plugin
```

### Step 2: Load the plugin in Figma

1. Open the **Figma desktop app**
2. Open any Figma file (or create a new one)
3. Go to the menu: **Plugins → Development → Import plugin from manifest...**
4. Navigate to `figma-mcp/plugin/manifest.json` and select it
5. Run the plugin: **Plugins → Development → Figma MCP Bridge**
6. A small status window appears — it will show a **red dot** (not connected yet)

> The plugin stays available in your Development menu after importing. You only need to import once.

### Step 3: Connect to Claude

Choose **one** of the two options below depending on which Claude client you use.

---

#### Option A: Claude Code (CLI)

The `.mcp.json` in the project root is auto-detected. Just open Claude Code in this directory:

```bash
cd figma-mcp
claude
```

The MCP server starts automatically. The Figma plugin status should turn to a **green dot**.

**To use from a different project repo**, add a `.mcp.json` to that project's root:

```json
{
  "mcpServers": {
    "figma-bridge": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/figma-mcp/server/index.ts"]
    }
  }
}
```

---

#### Option B: Claude Desktop App

1. Open this file in a text editor (create it if it doesn't exist):

   ```
   ~/Library/Application Support/Claude/claude_desktop_config.json
   ```

   On macOS you can open it with:

   ```bash
   open -a TextEdit ~/Library/Application\ Support/Claude/claude_desktop_config.json
   ```

2. Add the `mcpServers` section. If the file already has content, merge it:

   ```json
   {
     "mcpServers": {
       "figma-bridge": {
         "command": "npx",
         "args": ["tsx", "/absolute/path/to/figma-mcp/server/index.ts"]
       }
     }
   }
   ```

   **Replace `/absolute/path/to/figma-mcp`** with the actual path on your machine.

3. **Quit and reopen Claude Desktop** (fully quit, not just close the window).

4. In Claude Desktop, you should see a tools icon indicating MCP tools are available. The Figma plugin status should turn to a **green dot**.

---

### Step 4: Verify the connection

You should see:

| Where | What to look for |
|-------|-----------------|
| **Figma plugin window** | Green dot + "Connected to MCP server" |
| **Claude Code** | Figma bridge tools available (try asking "check figma connection") |
| **Claude Desktop** | MCP tools icon visible in the chat input area |

If the green dot doesn't appear, see [Troubleshooting](#troubleshooting) below.

### Step 5: Use it

With the plugin connected, ask Claude to work with your Figma file. Examples:

- *"What's on my current Figma page?"*
- *"Read the selected frame and generate React code for it"*
- *"Create a card component with a title, description, and button"*
- *"Export the selected frame as a screenshot"*
- *"Change all the text colors to blue"*

## Available Tools

| Tool | Description |
|------|-------------|
| `get_scene` | Returns the full scene context — selected nodes, their properties, variables, text styles, and page info |
| `get_selection` | Returns a quick summary of selected nodes (IDs, names, types) |
| `execute_code` | Runs Figma Plugin API code in the sandbox (create nodes, modify properties, etc.) |
| `export_image` | Exports a node as PNG (by node ID or current selection) |
| `connection_status` | Checks if the Figma plugin is connected |

## Using From Another Project

You don't need to work inside the `figma-mcp` directory. There are two ways to make it available elsewhere.

### Option 1: Repo-level (per-project)

The MCP is only available when Claude Code runs inside that specific repo.

Add a `.mcp.json` to the **root** of your target project:

```json
{
  "mcpServers": {
    "figma-bridge": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/figma-mcp/server/index.ts"]
    }
  }
}
```

Replace `/absolute/path/to/figma-mcp` with where you cloned this repo.

### Option 2: User-level (global)

The MCP is available in **every** Claude Code session, regardless of which repo you're in.

**Using the CLI:**

```bash
claude mcp add figma-bridge -s user -- npx tsx /absolute/path/to/figma-mcp/server/index.ts
```

**Or manually** — add to `~/.claude.json`:

```json
{
  "mcpServers": {
    "figma-bridge": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/figma-mcp/server/index.ts"]
    }
  }
}
```

### Claude Desktop

The Claude Desktop config is global by nature, so it works from any conversation automatically once configured (see [Option B](#option-b-claude-desktop-app) above).

---

> **Note:** Whichever method you use, make sure `npm install` has been run in the `figma-mcp` directory and the Figma plugin is running.

## Development

```bash
npm run build:plugin    # Build the plugin once
npm run watch:plugin    # Rebuild plugin on file changes
npm run mcp             # Start MCP server standalone
npm run dev             # Both at once
```

### Project structure

```
figma-mcp/
├── server/
│   └── index.ts             # MCP server + WebSocket server
├── plugin/
│   ├── src/
│   │   ├── code.ts          # Sandbox: handles bridge commands
│   │   ├── scene.ts         # Serializes Figma nodes to JSON
│   │   ├── executor.ts      # Code runner with font auto-retry
│   │   ├── types.ts         # Shared types + bridge protocol
│   │   └── ui/
│   │       └── ui.html      # Minimal UI: WebSocket client + status
│   ├── dist/                # Built output (git-ignored)
│   ├── manifest.json        # Figma plugin manifest
│   └── esbuild.config.js    # Build config
├── .mcp.json                # Claude Code auto-detection config
├── package.json
└── tsconfig.json
```

## Figma Plugin API Notes

The plugin uses `documentAccess: "dynamic-page"`, so all Figma API calls in `execute_code` **must be async**:

```javascript
// Correct
const node = await figma.getNodeByIdAsync("1:2");
await figma.loadFontAsync({ family: "Inter", style: "Regular" });

// Wrong — will throw
const node = figma.getNodeById("1:2");
```

Other rules:
- **Colors** are 0–1 floats, not 0–255 (`{ r: 0.5, g: 0, b: 1 }`)
- **Load fonts** before any text operation: `await figma.loadFontAsync({ family, style })`
- **Set `layoutMode`** before setting `layoutSizingHorizontal`/`Vertical`
- **Always null-check** results from `getNodeByIdAsync()`, `findOne()`, etc.

## Troubleshooting

### Plugin shows red dot (not connected)

- Make sure the MCP server is running. In Claude Code, it starts automatically. For Claude Desktop, restart the app.
- Check that nothing else is using port **3002**: `lsof -i :3002`
- The plugin auto-reconnects every 3 seconds — wait a moment after starting the server.

### Claude doesn't show Figma tools

- **Claude Code**: Make sure you're in a directory with `.mcp.json`, or the `figma-mcp` directory itself.
- **Claude Desktop**: Verify `claude_desktop_config.json` has the correct absolute path. Restart the app fully (Cmd+Q, then reopen).

### "Font not loaded" errors

The `execute_code` tool auto-retries with font loading up to 3 times. If it still fails, load fonts explicitly before text operations:

```javascript
await figma.loadFontAsync({ family: "Inter", style: "Regular" });
textNode.characters = "Hello";
```

### Plugin disappears after restarting Figma

Re-run it from **Plugins → Development → Figma MCP Bridge**. The import is persistent, you just need to run it each time you open Figma.

## Data Flow

1. You ask Claude something about Figma (e.g., *"read the selected frame"*)
2. Claude calls an MCP tool (e.g., `get_scene`)
3. MCP server receives it via stdio, assigns a request ID, sends it over WebSocket
4. Plugin UI receives the message, forwards it to the Figma sandbox via `postMessage`
5. Sandbox executes the command using the Figma Plugin API
6. Result flows back: Sandbox → UI → WebSocket → MCP server → Claude
7. Claude processes the result and responds to you
