// ── Serialized Scene Types ──

export interface SerializedNode {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fills?: any[];
  strokes?: any[];
  opacity?: number;
  visible?: boolean;
  cornerRadius?: number;
  effects?: any[];
  blendMode?: string;
  characters?: string;
  fontSize?: number;
  fontFamily?: string;
  fontStyle?: string;
  textAlignHorizontal?: string;
  textAlignVertical?: string;
  lineHeight?: any;
  letterSpacing?: any;
  layoutMode?: string;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  itemSpacing?: number;
  primaryAxisAlignItems?: string;
  counterAxisAlignItems?: string;
  layoutSizingHorizontal?: string;
  layoutSizingVertical?: string;
  componentId?: string;
  variantProperties?: object;
  children?: SerializedNode[];
  childCount?: number;
}

export interface SceneContext {
  file: {
    name: string;
    pages: { id: string; name: string; isCurrent: boolean }[];
  };
  scope: "selection" | "page";
  scopeDescription: string;
  nodes: SerializedNode[];
  emptySpot?: { x: number; y: number };
  textStyles?: { name: string; fontFamily: string; fontStyle: string; fontSize: number }[];
  variables?: { collection: string; name: string; type: string; value: any }[];
}

// ── Bridge Protocol ──

export interface BridgeRequest {
  type: "BRIDGE_REQUEST";
  id: string;
  action: "get_scene" | "get_selection" | "execute_code" | "export_image";
  params?: Record<string, any>;
}

export interface BridgeResponse {
  type: "BRIDGE_RESPONSE";
  id: string;
  result?: any;
  error?: string;
}
