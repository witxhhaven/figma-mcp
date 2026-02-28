import { buildSceneContext } from "./scene";
import { executeAICode } from "./executor";
import { BridgeRequest } from "./types";

// Minimal UI — just shows connection status and relays WebSocket messages
figma.showUI(__html__, { width: 300, height: 70, themeColors: true });

// ── Base64 encoder (sandbox lacks btoa) ──

function uint8ArrayToBase64(bytes: Uint8Array): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let result = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1] || 0, c = bytes[i + 2] || 0;
    result += chars[a >> 2] + chars[((a & 3) << 4) | (b >> 4)]
      + (i + 1 < bytes.length ? chars[((b & 15) << 2) | (c >> 6)] : "=")
      + (i + 2 < bytes.length ? chars[c & 63] : "=");
  }
  return result;
}

// ── Export node as PNG ──

async function exportImage(nodeId?: string): Promise<{ base64?: string; error?: string }> {
  let node: SceneNode | null = null;

  if (nodeId) {
    const found = await figma.getNodeByIdAsync(nodeId);
    if (found && "exportAsync" in found) {
      node = found as SceneNode;
    }
  } else {
    const selection = figma.currentPage.selection;
    if (selection.length > 0) {
      node = selection[0];
    }
  }

  if (!node) {
    return { error: "No node found to export" };
  }

  let scale = 1;
  if (node.width > 2000 || node.height > 2000) {
    scale = 0.5;
  }

  const pngBytes = await node.exportAsync({
    format: "PNG",
    constraint: { type: "SCALE", value: scale },
  });

  return { base64: uint8ArrayToBase64(pngBytes) };
}

// ── Get selection summary ──

function getSelectionInfo() {
  return {
    pageName: figma.currentPage.name,
    nodes: figma.currentPage.selection.map(n => ({
      id: n.id,
      name: n.name,
      type: n.type,
    })),
  };
}

// ── Handle bridge requests from UI ──

figma.ui.onmessage = async (msg: any) => {
  if (msg.type === "RESIZE") {
    figma.ui.resize(msg.width, msg.height);
    return;
  }
  if (msg.type === "BRIDGE_REQUEST") {
    const req = msg as BridgeRequest;
    try {
      let result: any;

      switch (req.action) {
        case "get_scene":
          result = await buildSceneContext();
          break;
        case "execute_code":
          result = await executeAICode(req.params?.code || "");
          break;
        case "get_selection":
          result = getSelectionInfo();
          break;
        case "export_image":
          result = await exportImage(req.params?.nodeId);
          break;
        default:
          result = { error: "Unknown action: " + req.action };
      }

      figma.ui.postMessage({ type: "BRIDGE_RESPONSE", id: req.id, result });
    } catch (error: any) {
      figma.ui.postMessage({
        type: "BRIDGE_RESPONSE",
        id: req.id,
        error: error.message || String(error),
      });
    }
  }
};

// ── Notify UI of selection changes (so MCP server can be informed) ──

function sendSelectionState() {
  figma.ui.postMessage({
    type: "SELECTION_CHANGED",
    nodes: figma.currentPage.selection.map(n => ({
      id: n.id,
      name: n.name,
      type: n.type,
    })),
    pageName: figma.currentPage.name,
  });
}

figma.on("selectionchange", sendSelectionState);
figma.on("currentpagechange", sendSelectionState);
setTimeout(sendSelectionState, 100);
