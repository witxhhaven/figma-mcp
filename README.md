# Figma MCP Bridge

Let Claude read and modify your Figma files through an MCP server. A lightweight Figma plugin connects to a local Node.js server — Claude handles the intelligence, the plugin is just a bridge.

```
Claude ←(stdio)→ MCP Server ←(WebSocket)→ Figma Plugin ←(Plugin API)→ Figma
```

## What You Need

- [Node.js](https://nodejs.org/) v18+
- [Figma](https://www.figma.com/downloads/) desktop app
- **Claude Code** (CLI) or **Claude Desktop** app

## Setup

### 1. Install, Build, and Link

```bash
git clone <repo-url> figma-mcp
cd figma-mcp
npm install
npm run build          # compile the MCP server
npm run build:plugin   # bundle the Figma plugin
npm link               # make `figma-mcp` available globally
```

`npm link` creates a global `figma-mcp` command so other repos can use the server without knowing the path to this repo. You only need to do this once (and again after a fresh `npm run build` if you pull changes).

> **Note:** You do **not** need to manually start the MCP server. Claude Code and Claude Desktop launch it automatically when they connect. Just make sure the Figma plugin is running.

### 2. Load the Plugin in Figma

1. Open the Figma desktop app and open any file
2. Go to **Plugins → Development → Import plugin from manifest...**
3. Select `figma-mcp/plugin/manifest.json`
4. Run it: **Plugins → Development → Figma MCP Bridge**
5. A small status window appears with a **red dot** (not connected yet)

> You only need to import once. After that, just re-run the plugin from the Development menu whenever you open Figma.

### 3. Add Figma MCP to Other Repos

Copy the `.mcp.json` from the `mcp-config/` folder into the root of any repo where you want Claude Code to have Figma access:

```bash
cp /path/to/figma-mcp/mcp-config/.mcp.json /path/to/your-project/
```

The file contents:

```json
{
  "mcpServers": {
    "figma-bridge": {
      "command": "figma-mcp"
    }
  }
}
```

Then just open Claude Code from that project directory — the Figma tools will be available automatically.

#### Other ways to connect

**Global (Claude Code)** — available in every Claude Code session:

```bash
claude mcp add figma-bridge -s user -- figma-mcp
```

**Claude Desktop** — add to your config file (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "figma-bridge": {
      "command": "figma-mcp"
    }
  }
}
```

### 4. Verify It Works

| Where | What to look for |
|---|---|
| Figma plugin window | Green dot + "Connected to MCP server" |
| Claude Code | Figma tools available (ask *"check figma connection"*) |
| Claude Desktop | MCP tools icon in the chat input area |

### 5. Start Using It

Ask Claude anything about your Figma file:

- *"What's on my current Figma page?"*
- *"Read the selected frame and generate React code for it"*
- *"Create a card component with a title, description, and button"*
- *"Export the selected frame as a screenshot"*
- *"Change all the text colors to blue"*

## Tools

| Tool | What it does |
|---|---|
| `get_scene` | Full scene dump — selected nodes, their properties, variables, text styles, page info |
| `get_selection` | Quick summary of selected nodes (IDs, names, types) |
| `execute_code` | Runs Figma Plugin API code in the sandbox (create nodes, modify properties, etc.) |
| `export_image` | Exports a node as PNG (by node ID or current selection) |
| `connection_status` | Checks if the Figma plugin is connected |

## Development

```bash
npm run dev             # plugin watcher + MCP server together
npm run build           # compile server (TypeScript → dist/)
npm run build:plugin    # bundle plugin once
npm run watch:plugin    # rebuild plugin on file changes
npm run mcp             # start MCP server via tsx (no build needed)
```

### Project Structure

```
figma-mcp/
├── server/
│   └── index.ts              # MCP server + WebSocket server
├── plugin/
│   ├── manifest.json         # Figma plugin manifest
│   ├── esbuild.config.cjs    # Plugin build config
│   └── src/
│       ├── code.ts           # Sandbox: dispatches bridge commands
│       ├── scene.ts          # Serializes Figma nodes to JSON
│       ├── executor.ts       # Code runner with font auto-retry
│       ├── types.ts          # Shared types + bridge protocol
│       └── ui/
│           └── ui.html       # WebSocket client + status UI
├── mcp-config/               # .mcp.json to copy into other repos
├── dist/                     # Compiled server output
├── package.json
└── tsconfig.json
```

### How It Works

1. You ask Claude something about Figma (e.g., *"read the selected frame"*)
2. Claude calls an MCP tool (e.g., `get_scene`)
3. The MCP server assigns a request ID and sends it over WebSocket
4. The plugin UI receives the message and forwards it to the Figma sandbox
5. The sandbox executes the command using the Figma Plugin API
6. The result flows back: Sandbox → UI → WebSocket → MCP server → Claude

### Figma Plugin API Notes

The plugin uses `documentAccess: "dynamic-page"`, so all Figma API calls in `execute_code` **must be async**:

```javascript
// correct
const node = await figma.getNodeByIdAsync("1:2");
await figma.loadFontAsync({ family: "Inter", style: "Regular" });

// wrong — will throw
const node = figma.getNodeById("1:2");
```

Other things to know:
- **Colors** are 0–1 floats, not 0–255 (`{ r: 0.5, g: 0, b: 1 }`)
- **Load fonts** before any text operation
- **Set `layoutMode`** before setting `layoutSizingHorizontal`/`Vertical`
- **Always null-check** results from `getNodeByIdAsync()`, `findOne()`, etc.

## Troubleshooting

**Plugin shows red dot (not connected)**
- Make sure the Figma plugin is running and Claude Code / Claude Desktop is open
- Check port 3002 isn't in use: `lsof -i :3002`
- The plugin auto-reconnects every 3 seconds — wait a moment after starting the server

**Claude doesn't show Figma tools**
- *Claude Code:* make sure you're in a directory with `.mcp.json`, or you've added it globally
- *Claude Desktop:* verify `claude_desktop_config.json` has the correct config, then fully restart the app (Cmd+Q)

**"Font not loaded" errors**
- `execute_code` auto-retries with font loading up to 3 times
- If it still fails, load fonts explicitly:
  ```javascript
  await figma.loadFontAsync({ family: "Inter", style: "Regular" });
  textNode.characters = "Hello";
  ```

**Plugin disappears after restarting Figma**
- Re-run it from **Plugins → Development → Figma MCP Bridge** (the import persists, you just need to launch it each session)
