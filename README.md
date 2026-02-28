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

### 1. Install and Build

```bash
git clone <repo-url> figma-mcp
cd figma-mcp
npm install
npm run build          # compile the MCP server
npm run build:plugin   # bundle the Figma plugin
```

### 2. Load the Plugin in Figma

1. Open the Figma desktop app and open any file
2. Go to **Plugins → Development → Import plugin from manifest...**
3. Select `figma-mcp/plugin/manifest.json`
4. Run it: **Plugins → Development → Figma MCP Bridge**
5. A small status window appears with a **red dot** (not connected yet)

> You only need to import once. After that, just re-run the plugin from the Development menu whenever you open Figma.

### 3. Connect to Claude

Pick **one** of the two options below.

#### Option A: Claude Code (CLI)

The project includes a `.mcp.json` that Claude Code auto-detects. Just open Claude Code from this directory:

```bash
cd figma-mcp
claude
```

The MCP server starts automatically and the plugin's dot turns **green**.

#### Option B: Claude Desktop

1. Open (or create) the config file:

   **macOS:**
   ```
   ~/Library/Application Support/Claude/claude_desktop_config.json
   ```

   **Windows:**
   ```
   %APPDATA%\Claude\claude_desktop_config.json
   ```

2. Add the server config:

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

3. **Fully quit** Claude Desktop (Cmd+Q / Alt+F4) and reopen it
4. You should see an MCP tools icon in the chat input. The plugin dot turns **green**.

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

## Using From Other Projects

You don't have to work inside the `figma-mcp` directory. Link the package globally once:

```bash
cd figma-mcp
npm run build
npm link
```

Then use `figma-mcp` as a command anywhere.

### Per-project (Claude Code)

Add `.mcp.json` to the root of any project:

```json
{
  "mcpServers": {
    "figma-bridge": {
      "command": "figma-mcp"
    }
  }
}
```

### Global (Claude Code)

Available in every Claude Code session:

```bash
claude mcp add figma-bridge -s user -- figma-mcp
```

Or add to `~/.claude.json` manually:

```json
{
  "mcpServers": {
    "figma-bridge": {
      "command": "figma-mcp"
    }
  }
}
```

### Claude Desktop

After `npm link`, simplify your Claude Desktop config to:

```json
{
  "mcpServers": {
    "figma-bridge": {
      "command": "figma-mcp"
    }
  }
}
```

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
├── dist/                     # Compiled server output
├── .mcp.json                 # Claude Code auto-detection config
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
- Make sure the MCP server is running (in Claude Code it starts automatically; for Claude Desktop, restart the app)
- Check port 3002 isn't in use: `lsof -i :3002`
- The plugin auto-reconnects every 3 seconds — wait a moment after starting the server

**Claude doesn't show Figma tools**
- *Claude Code:* make sure you're in a directory with `.mcp.json`, or the `figma-mcp` directory itself
- *Claude Desktop:* verify `claude_desktop_config.json` has the correct path, then fully restart the app (Cmd+Q)

**"Font not loaded" errors**
- `execute_code` auto-retries with font loading up to 3 times
- If it still fails, load fonts explicitly:
  ```javascript
  await figma.loadFontAsync({ family: "Inter", style: "Regular" });
  textNode.characters = "Hello";
  ```

**Plugin disappears after restarting Figma**
- Re-run it from **Plugins → Development → Figma MCP Bridge** (the import persists, you just need to launch it each session)
