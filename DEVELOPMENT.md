# Development

```bash
npm run dev             # plugin watcher + MCP server together
npm run build           # compile server (TypeScript → dist/)
npm run build:plugin    # bundle plugin once
npm run watch:plugin    # rebuild plugin on file changes
npm run mcp             # start MCP server via tsx (no build needed)
```

## Project Structure

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
├── screenshots/              # Screenshots for docs
├── dist/                     # Compiled server output
├── DEVELOPMENT.md            # Dev docs (this file)
├── package.json
└── tsconfig.json
```

## How It Works

1. You ask Claude something about Figma (e.g., *"read the selected frame"*)
2. Claude calls an MCP tool (e.g., `get_scene`)
3. The MCP server assigns a request ID and sends it over WebSocket
4. The plugin UI receives the message and forwards it to the Figma sandbox
5. The sandbox executes the command using the Figma Plugin API
6. The result flows back: Sandbox → UI → WebSocket → MCP server → Claude

## Figma Plugin API Notes

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
