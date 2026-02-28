"use strict";
(() => {
  // plugin/src/scene.ts
  function serializeFills(fills, varLookup) {
    return fills.map((fill) => {
      if (fill.type === "SOLID") {
        const result = {
          type: "SOLID",
          color: {
            r: Math.round(fill.color.r * 1e3) / 1e3,
            g: Math.round(fill.color.g * 1e3) / 1e3,
            b: Math.round(fill.color.b * 1e3) / 1e3
          },
          opacity: fill.opacity !== void 0 && fill.opacity !== 1 ? fill.opacity : void 0
        };
        if (fill.boundVariables && fill.boundVariables.color && varLookup) {
          const varId = fill.boundVariables.color.id;
          if (varId && varLookup.has(varId)) {
            result.boundVariable = varLookup.get(varId);
          }
        }
        return result;
      }
      return { type: fill.type };
    });
  }
  async function serializeNode(node, depth, maxDepth, varLookup) {
    const result = {
      id: node.id,
      name: node.name,
      type: node.type,
      x: Math.round(node.x),
      y: Math.round(node.y),
      width: Math.round(node.width),
      height: Math.round(node.height)
    };
    if ("fills" in node && Array.isArray(node.fills) && node.fills.length > 0) {
      result.fills = serializeFills(node.fills, varLookup);
    }
    if ("strokes" in node && Array.isArray(node.strokes) && node.strokes.length > 0) {
      result.strokes = serializeFills(node.strokes, varLookup);
    }
    if ("opacity" in node && node.opacity !== 1) {
      result.opacity = Math.round(node.opacity * 100) / 100;
    }
    if ("visible" in node && node.visible === false) {
      result.visible = false;
    }
    if ("cornerRadius" in node && typeof node.cornerRadius === "number" && node.cornerRadius !== 0) {
      result.cornerRadius = node.cornerRadius;
    }
    if ("effects" in node && Array.isArray(node.effects) && node.effects.length > 0) {
      result.effects = node.effects;
    }
    if ("blendMode" in node && node.blendMode !== "NORMAL" && node.blendMode !== "PASS_THROUGH") {
      result.blendMode = node.blendMode;
    }
    if (node.type === "TEXT") {
      const textNode = node;
      result.characters = textNode.characters;
      if (typeof textNode.fontSize === "number") {
        result.fontSize = textNode.fontSize;
      }
      if (typeof textNode.fontName === "object" && textNode.fontName !== figma.mixed) {
        result.fontFamily = textNode.fontName.family;
        result.fontStyle = textNode.fontName.style;
      }
      if (textNode.textAlignHorizontal !== "LEFT") {
        result.textAlignHorizontal = textNode.textAlignHorizontal;
      }
      if (textNode.textAlignVertical !== "TOP") {
        result.textAlignVertical = textNode.textAlignVertical;
      }
    }
    if ("layoutMode" in node && node.layoutMode !== "NONE") {
      const frame = node;
      result.layoutMode = frame.layoutMode;
      result.paddingTop = frame.paddingTop;
      result.paddingRight = frame.paddingRight;
      result.paddingBottom = frame.paddingBottom;
      result.paddingLeft = frame.paddingLeft;
      result.itemSpacing = frame.itemSpacing;
      result.primaryAxisAlignItems = frame.primaryAxisAlignItems;
      result.counterAxisAlignItems = frame.counterAxisAlignItems;
      if (frame.layoutSizingHorizontal) {
        result.layoutSizingHorizontal = frame.layoutSizingHorizontal;
      }
      if (frame.layoutSizingVertical) {
        result.layoutSizingVertical = frame.layoutSizingVertical;
      }
    }
    if (node.type === "INSTANCE") {
      const inst = node;
      const mainComp = await inst.getMainComponentAsync();
      if (mainComp) result.componentId = mainComp.id;
      if (inst.variantProperties) result.variantProperties = inst.variantProperties;
    }
    if ("children" in node) {
      if (depth < maxDepth) {
        result.children = await Promise.all(
          node.children.map(
            (child) => serializeNode(child, depth + 1, maxDepth, varLookup)
          )
        );
      } else {
        result.childCount = node.children.length;
      }
    }
    return result;
  }
  async function buildSceneContext() {
    const selection = figma.currentPage.selection;
    const pages = figma.root.children.map((page) => ({
      id: page.id,
      name: page.name,
      isCurrent: page.id === figma.currentPage.id
    }));
    const [textStylesRaw, variablesRaw, collectionsRaw] = await Promise.all([
      figma.getLocalTextStylesAsync(),
      figma.variables.getLocalVariablesAsync(),
      figma.variables.getLocalVariableCollectionsAsync()
    ]);
    const textStyles = textStylesRaw.map((s) => ({
      name: s.name,
      fontFamily: s.fontName.family,
      fontStyle: s.fontName.style,
      fontSize: s.fontSize
    }));
    const collectionNames = /* @__PURE__ */ new Map();
    for (const c of collectionsRaw) {
      collectionNames.set(c.id, c.name);
    }
    const varLookup = /* @__PURE__ */ new Map();
    const localVars = variablesRaw.filter((v) => !v.remote);
    for (const v of localVars) {
      varLookup.set(v.id, v.name);
    }
    const variables = localVars.map((v) => {
      const modeId = Object.keys(v.valuesByMode)[0];
      const rawValue = modeId ? v.valuesByMode[modeId] : void 0;
      let value = rawValue;
      if (rawValue && typeof rawValue === "object" && "r" in rawValue && "g" in rawValue && "b" in rawValue) {
        const c = rawValue;
        value = {
          r: Math.round(c.r * 1e3) / 1e3,
          g: Math.round(c.g * 1e3) / 1e3,
          b: Math.round(c.b * 1e3) / 1e3
        };
      }
      return {
        collection: collectionNames.get(v.variableCollectionId) || "",
        name: v.name,
        type: v.resolvedType,
        value
      };
    });
    let scope;
    let nodes;
    let scopeDescription;
    if (selection.length > 0) {
      scope = "selection";
      scopeDescription = `${selection.length} layer${selection.length > 1 ? "s" : ""} selected`;
      nodes = await Promise.all(selection.map((n) => serializeNode(n, 0, 6, varLookup)));
    } else {
      scope = "page";
      scopeDescription = `Page: ${figma.currentPage.name}`;
      nodes = await Promise.all(figma.currentPage.children.map((n) => serializeNode(n, 0, 4, varLookup)));
    }
    const json = JSON.stringify(nodes);
    const estimatedTokens = json.length / 4;
    if (estimatedTokens > 6e3) {
      const reducedMaxDepth = selection.length > 0 ? 4 : 2;
      if (selection.length > 0) {
        nodes = await Promise.all(selection.map((n) => serializeNode(n, 0, reducedMaxDepth, varLookup)));
      } else {
        nodes = await Promise.all(figma.currentPage.children.map(
          (n) => serializeNode(n, 0, reducedMaxDepth, varLookup)
        ));
      }
    }
    const pageChildren = figma.currentPage.children;
    let emptySpot = { x: 0, y: 0 };
    if (pageChildren.length > 0) {
      let maxRight = -Infinity;
      let topAtMaxRight = 0;
      for (var i = 0; i < pageChildren.length; i++) {
        var child = pageChildren[i];
        var right = Math.round(child.x + child.width);
        if (right > maxRight) {
          maxRight = right;
          topAtMaxRight = Math.round(child.y);
        }
      }
      emptySpot = { x: maxRight + 100, y: topAtMaxRight };
    }
    const result = {
      file: { name: figma.root.name, pages },
      scope,
      scopeDescription,
      nodes,
      emptySpot
    };
    if (textStyles.length > 0) result.textStyles = textStyles;
    if (variables.length > 0) result.variables = variables;
    return result;
  }

  // plugin/src/executor.ts
  async function loadFontFromError(errorMsg) {
    const match = errorMsg.match(
      /unloaded font "(.+?)"\. Please call figma\.loadFontAsync\(\{ family: "(.+?)", style: "(.+?)" \}\)/
    );
    if (!match) return false;
    try {
      await figma.loadFontAsync({ family: match[2], style: match[3] });
      return true;
    } catch (e) {
      return false;
    }
  }
  async function executeAICode(code, _retryCount = 0) {
    try {
      const wrappedCode = `(async () => {
${code}
})()`;
      await eval(wrappedCode);
      figma.commitUndo();
      return { success: true };
    } catch (error) {
      const msg = error.message || String(error);
      if (msg.includes("unloaded font") && _retryCount < 3) {
        const loaded = await loadFontFromError(msg);
        if (loaded) {
          return executeAICode(code, _retryCount + 1);
        }
      }
      return { success: false, error: msg };
    }
  }

  // plugin/src/code.ts
  figma.showUI(__html__, { width: 300, height: 200, themeColors: true });
  function uint8ArrayToBase64(bytes) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let result = "";
    for (let i = 0; i < bytes.length; i += 3) {
      const a = bytes[i], b = bytes[i + 1] || 0, c = bytes[i + 2] || 0;
      result += chars[a >> 2] + chars[(a & 3) << 4 | b >> 4] + (i + 1 < bytes.length ? chars[(b & 15) << 2 | c >> 6] : "=") + (i + 2 < bytes.length ? chars[c & 63] : "=");
    }
    return result;
  }
  async function exportImage(nodeId) {
    let node = null;
    if (nodeId) {
      const found = await figma.getNodeByIdAsync(nodeId);
      if (found && "exportAsync" in found) {
        node = found;
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
    if (node.width > 2e3 || node.height > 2e3) {
      scale = 0.5;
    }
    const pngBytes = await node.exportAsync({
      format: "PNG",
      constraint: { type: "SCALE", value: scale }
    });
    return { base64: uint8ArrayToBase64(pngBytes) };
  }
  function getSelectionInfo() {
    return {
      pageName: figma.currentPage.name,
      nodes: figma.currentPage.selection.map((n) => ({
        id: n.id,
        name: n.name,
        type: n.type
      }))
    };
  }
  figma.ui.onmessage = async (msg) => {
    var _a, _b;
    if (msg.type === "RESIZE") {
      figma.ui.resize(msg.width, msg.height);
      return;
    }
    if (msg.type === "BRIDGE_REQUEST") {
      const req = msg;
      try {
        let result;
        switch (req.action) {
          case "get_scene":
            result = await buildSceneContext();
            break;
          case "execute_code":
            result = await executeAICode(((_a = req.params) == null ? void 0 : _a.code) || "");
            break;
          case "get_selection":
            result = getSelectionInfo();
            break;
          case "export_image":
            result = await exportImage((_b = req.params) == null ? void 0 : _b.nodeId);
            break;
          default:
            result = { error: "Unknown action: " + req.action };
        }
        figma.ui.postMessage({ type: "BRIDGE_RESPONSE", id: req.id, result });
      } catch (error) {
        figma.ui.postMessage({
          type: "BRIDGE_RESPONSE",
          id: req.id,
          error: error.message || String(error)
        });
      }
    }
  };
  function sendSelectionState() {
    figma.ui.postMessage({
      type: "SELECTION_CHANGED",
      nodes: figma.currentPage.selection.map((n) => ({
        id: n.id,
        name: n.name,
        type: n.type
      })),
      pageName: figma.currentPage.name
    });
  }
  figma.on("selectionchange", sendSelectionState);
  figma.on("currentpagechange", sendSelectionState);
  setTimeout(sendSelectionState, 100);
})();
