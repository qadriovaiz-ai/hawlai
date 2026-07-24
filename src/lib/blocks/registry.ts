import {
  LayoutPanelTop,
  Columns3,
  Heading as HeadingIcon,
  Type,
  Image as ImageIcon,
  MousePointerClick,
  Minus,
  MoveVertical,
  Video as VideoIcon,
  ClipboardList,
  Package,
} from "lucide-react";
import type { Block, BlockDefinition } from "./types";

// Single source of truth for every block type — consumed by the block
// palette, the canvas renderer, and the properties panel (once those
// land), replacing the three independently hand-synced type-keyed maps
// that existed across SectionRenderer.tsx / LivePreviewEditor.tsx /
// WebsiteBuilderView.tsx for the old fixed section types.
//
// Deliberately flat: there is exactly one structural rule enforced
// outside this file (a page's top-level blocks are always type
// "section") — everything else, including row/column layout, is just
// another registry entry ("stack"), not a hardcoded nesting level.
export const BLOCK_REGISTRY: Record<string, BlockDefinition> = {
  section: {
    label: "Section",
    icon: LayoutPanelTop,
    category: "layout",
    isContainer: true,
    defaultProps: { background: "none", paddingY: "md" },
  },
  stack: {
    label: "Stack",
    icon: Columns3,
    category: "layout",
    isContainer: true,
    defaultProps: { direction: "column", gap: "md", align: "stretch" },
  },
  heading: {
    label: "Heading",
    icon: HeadingIcon,
    category: "content",
    isContainer: false,
    defaultProps: { text: "Heading", level: 2, align: "left" },
  },
  text: {
    label: "Text",
    icon: Type,
    category: "content",
    isContainer: false,
    defaultProps: { html: "", align: "left" },
  },
  image: {
    label: "Image",
    icon: ImageIcon,
    category: "content",
    isContainer: false,
    defaultProps: { url: "", alt: "" },
  },
  button: {
    label: "Button",
    icon: MousePointerClick,
    category: "content",
    isContainer: false,
    defaultProps: { label: "Click here", href: "#", style: "solid" },
  },
  spacer: {
    label: "Spacer",
    icon: MoveVertical,
    category: "layout",
    isContainer: false,
    defaultProps: { height: "md" },
  },
  divider: {
    label: "Divider",
    icon: Minus,
    category: "layout",
    isContainer: false,
    defaultProps: {},
  },
  video: {
    label: "Video",
    icon: VideoIcon,
    category: "content",
    isContainer: false,
    defaultProps: { url: "" },
  },
  form: {
    label: "Contact Form",
    icon: ClipboardList,
    category: "content",
    isContainer: false,
    defaultProps: { heading: "Get in Touch" },
  },
  // Never AI-authored and never hand-filled with fake products — always
  // resolved server-side against the real products table at render
  // time, same safety principle as the old "product_catalog" section.
  product_grid: {
    label: "Product Grid",
    icon: Package,
    category: "content",
    isContainer: true,
    allowedChildren: [],
    defaultProps: { heading: "Our Products" },
  },
};

export function generateBlockId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `blk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createBlock(type: string, overrides?: Partial<Pick<Block, "props" | "children">>): Block {
  const def = BLOCK_REGISTRY[type];
  if (!def) throw new Error(`Unknown block type: ${type}`);
  return {
    id: generateBlockId(),
    type,
    props: { ...def.defaultProps, ...(overrides?.props ?? {}) },
    ...(def.isContainer ? { children: overrides?.children ?? [] } : {}),
  };
}
