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

const ALIGN_OPTIONS = [{ value: "left", label: "Left" }, { value: "center", label: "Center" }, { value: "right", label: "Right" }];
const SIZE_OPTIONS = [{ value: "sm", label: "Small" }, { value: "md", label: "Medium" }, { value: "lg", label: "Large" }];
const BACKGROUND_OPTIONS = [{ value: "none", label: "None" }, { value: "dark", label: "Dark (theme)" }, { value: "accent", label: "Accent (theme)" }];
const DIRECTION_OPTIONS = [{ value: "column", label: "Vertical" }, { value: "row", label: "Horizontal" }];
const STACK_ALIGN_OPTIONS = [{ value: "start", label: "Start" }, { value: "center", label: "Center" }, { value: "stretch", label: "Stretch" }];
const WIDTH_OPTIONS = [{ value: "", label: "Auto" }, { value: "0.25", label: "25%" }, { value: "0.33", label: "33%" }, { value: "0.5", label: "50%" }, { value: "0.66", label: "66%" }, { value: "1", label: "100%" }];
const LEVEL_OPTIONS = [{ value: "1", label: "H1 — largest" }, { value: "2", label: "H2" }, { value: "3", label: "H3 — smallest" }];
const BUTTON_STYLE_OPTIONS = [{ value: "solid", label: "Accent" }, { value: "white", label: "White" }];

// Single source of truth for every block type — consumed by the block
// palette, the canvas renderer, and the properties panel, replacing
// the three independently hand-synced type-keyed maps that existed
// across SectionRenderer.tsx / LivePreviewEditor.tsx /
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
    propFields: [
      { key: "background", label: "Background", type: "select", options: BACKGROUND_OPTIONS },
      { key: "paddingY", label: "Vertical padding", type: "select", options: SIZE_OPTIONS },
    ],
  },
  stack: {
    label: "Stack",
    icon: Columns3,
    category: "layout",
    isContainer: true,
    defaultProps: { direction: "column", gap: "md", align: "stretch" },
    propFields: [
      { key: "direction", label: "Direction", type: "select", options: DIRECTION_OPTIONS },
      { key: "gap", label: "Gap", type: "select", options: SIZE_OPTIONS },
      { key: "align", label: "Align", type: "select", options: STACK_ALIGN_OPTIONS },
      { key: "wrap", label: "Wrap", type: "boolean" },
      { key: "widthFraction", label: "Width (as a column)", type: "select", options: WIDTH_OPTIONS },
    ],
  },
  heading: {
    label: "Heading",
    icon: HeadingIcon,
    category: "content",
    isContainer: false,
    defaultProps: { text: "Heading", level: 2, align: "left" },
    propFields: [
      { key: "text", label: "Text", type: "text" },
      { key: "level", label: "Size", type: "select", options: LEVEL_OPTIONS },
      { key: "align", label: "Align", type: "select", options: ALIGN_OPTIONS },
    ],
  },
  text: {
    label: "Text",
    icon: Type,
    category: "content",
    isContainer: false,
    defaultProps: { html: "", align: "left" },
    propFields: [
      { key: "html", label: "Text", type: "richtext" },
      { key: "align", label: "Align", type: "select", options: ALIGN_OPTIONS },
    ],
  },
  image: {
    label: "Image",
    icon: ImageIcon,
    category: "content",
    isContainer: false,
    defaultProps: { url: "", alt: "" },
    propFields: [
      { key: "url", label: "Image", type: "image" },
      { key: "alt", label: "Alt text", type: "text" },
    ],
  },
  button: {
    label: "Button",
    icon: MousePointerClick,
    category: "content",
    isContainer: false,
    defaultProps: { label: "Click here", href: "#", style: "solid" },
    propFields: [
      { key: "label", label: "Label", type: "text" },
      { key: "href", label: "Link", type: "url" },
      { key: "style", label: "Style", type: "select", options: BUTTON_STYLE_OPTIONS },
    ],
  },
  spacer: {
    label: "Spacer",
    icon: MoveVertical,
    category: "layout",
    isContainer: false,
    defaultProps: { height: "md" },
    propFields: [{ key: "height", label: "Height", type: "select", options: SIZE_OPTIONS }],
  },
  divider: {
    label: "Divider",
    icon: Minus,
    category: "layout",
    isContainer: false,
    defaultProps: {},
    propFields: [],
  },
  video: {
    label: "Video",
    icon: VideoIcon,
    category: "content",
    isContainer: false,
    defaultProps: { url: "" },
    propFields: [{ key: "url", label: "Embed URL", type: "url" }],
  },
  form: {
    label: "Contact Form",
    icon: ClipboardList,
    category: "content",
    isContainer: false,
    defaultProps: { heading: "Get in Touch" },
    propFields: [{ key: "heading", label: "Heading", type: "text" }],
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
    propFields: [{ key: "heading", label: "Heading", type: "text" }],
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
