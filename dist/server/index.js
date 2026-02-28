#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { WebSocketServer, WebSocket } from "ws";
import { z } from "zod";
import crypto from "crypto";
import { execSync } from "child_process";
// ── Configuration ──
const WS_PORT = 3002;
const REQUEST_TIMEOUT_MS = 30000;
// ── Kill any existing process on the port ──
try {
    const output = execSync(`lsof -ti :${WS_PORT}`, { encoding: "utf-8" }).trim();
    if (output) {
        for (const pid of output.split("\n")) {
            if (pid && pid !== String(process.pid)) {
                console.error(`[figma-bridge] Killing existing process on port ${WS_PORT} (PID ${pid})`);
                process.kill(Number(pid), "SIGTERM");
            }
        }
        // Brief pause to let the port free up
        execSync("sleep 0.5");
    }
}
catch {
    // No process on port — that's fine
}
// ── WebSocket bridge to Figma plugin ──
let pluginSocket = null;
const pendingRequests = new Map();
const wss = new WebSocketServer({ port: WS_PORT });
wss.on("connection", (ws) => {
    pluginSocket = ws;
    // Use stderr — stdout is reserved for MCP stdio transport
    console.error(`[figma-bridge] Plugin connected (ws://localhost:${WS_PORT})`);
    ws.on("message", (data) => {
        try {
            const msg = JSON.parse(data.toString());
            if (msg.type === "BRIDGE_RESPONSE" && msg.id) {
                const pending = pendingRequests.get(msg.id);
                if (pending) {
                    pendingRequests.delete(msg.id);
                    if (msg.error) {
                        pending.reject(new Error(msg.error));
                    }
                    else {
                        pending.resolve(msg.result);
                    }
                }
            }
        }
        catch (e) {
            console.error("[figma-bridge] Failed to parse message:", e);
        }
    });
    ws.on("close", () => {
        pluginSocket = null;
        console.error("[figma-bridge] Plugin disconnected");
        // Reject all pending requests
        for (const [id, pending] of pendingRequests) {
            pending.reject(new Error("Plugin disconnected"));
            pendingRequests.delete(id);
        }
    });
});
wss.on("listening", () => {
    console.error(`[figma-bridge] WebSocket server listening on ws://localhost:${WS_PORT}`);
});
/**
 * Send a request to the Figma plugin and wait for a response.
 * Uses request IDs for correlation since WebSocket is async.
 */
function sendToPlugin(action, params) {
    return new Promise((resolve, reject) => {
        if (!pluginSocket || pluginSocket.readyState !== WebSocket.OPEN) {
            reject(new Error("Figma plugin not connected. Open the Figma MCP Bridge plugin in Figma."));
            return;
        }
        const id = crypto.randomUUID();
        pendingRequests.set(id, { resolve, reject });
        pluginSocket.send(JSON.stringify({ type: "BRIDGE_REQUEST", id, action, params }));
        // Timeout — don't let requests hang forever
        setTimeout(() => {
            if (pendingRequests.has(id)) {
                pendingRequests.delete(id);
                reject(new Error(`Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`));
            }
        }, REQUEST_TIMEOUT_MS);
    });
}
// ── MCP Server ──
const server = new McpServer({
    name: "figma-bridge",
    version: "1.0.0",
});
// Tool: get the full scene context
server.tool("get_scene", "Get the current Figma scene context including selected nodes, variables, text styles, and page info. Returns a JSON representation of what's currently visible/selected in Figma.", {}, async () => {
    const result = await sendToPlugin("get_scene");
    return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
});
// Tool: get current selection summary
server.tool("get_selection", "Get a summary of the currently selected nodes in Figma (IDs, names, types).", {}, async () => {
    const result = await sendToPlugin("get_selection");
    return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
});
// Tool: execute Figma Plugin API code
server.tool("execute_code", `Execute Figma Plugin API code in the plugin sandbox. The code runs inside an async IIFE and has full access to the Figma Plugin API.

IMPORTANT rules for the code:
- All Figma API calls MUST be async (e.g. figma.getNodeByIdAsync(), not figma.getNodeById())
- Load fonts before any text operation: await figma.loadFontAsync({ family, style })
- Colors are 0-1 floats, not 0-255
- Fills/strokes use {r,g,b} + opacity on paint; effects use {r,g,b,a}
- layoutSizingHorizontal/Vertical require layoutMode to be set first
- Always null-check results from getNodeByIdAsync(), findOne(), etc.`, {
    code: z.string().describe("Figma Plugin API code to execute"),
}, async ({ code }) => {
    const result = await sendToPlugin("execute_code", { code });
    if (result.success) {
        return {
            content: [{ type: "text", text: "Code executed successfully." }],
        };
    }
    else {
        return {
            content: [{ type: "text", text: `Execution error: ${result.error}` }],
            isError: true,
        };
    }
});
// Tool: export a node as PNG
server.tool("export_image", "Export a Figma node as a PNG image. If no nodeId is provided, exports the first selected node.", {
    nodeId: z.string().optional().describe("The Figma node ID to export. Omit to use current selection."),
}, async ({ nodeId }) => {
    const result = await sendToPlugin("export_image", { nodeId });
    if (result.base64) {
        return {
            content: [
                {
                    type: "image",
                    data: result.base64,
                    mimeType: "image/png",
                },
            ],
        };
    }
    return {
        content: [{ type: "text", text: result.error || "No image could be exported" }],
        isError: true,
    };
});
// Tool: check connection status
server.tool("connection_status", "Check if the Figma plugin is connected to the bridge.", {}, async () => {
    const connected = pluginSocket !== null && pluginSocket.readyState === WebSocket.OPEN;
    return {
        content: [
            {
                type: "text",
                text: connected
                    ? "Figma plugin is connected and ready."
                    : "Figma plugin is NOT connected. Please open the Figma MCP Bridge plugin in Figma.",
            },
        ],
    };
});
// ── Start ──
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("[figma-bridge] MCP server started (stdio transport)");
}
main().catch((e) => {
    console.error("[figma-bridge] Fatal error:", e);
    process.exit(1);
});
