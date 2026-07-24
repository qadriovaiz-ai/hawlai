import type { LucideIcon } from "lucide-react";

// The generic block model replacing the old fixed-section-type system
// (hero/text/features_grid/... with hardcoded fields each). A page is
// now just an array of top-level `type: "section"` blocks; everything
// below that — layout (via "stack") and content — is composed from the
// same registry (see registry.ts), not special-cased per level.
export interface Block {
  id: string;
  type: string;
  props: Record<string, any>;
  // Per-block overrides applied at narrow container widths (see the
  // container-query responsive model) — e.g. { widthFraction: 1 } to
  // force a column full-width on mobile, or { hidden: true }.
  responsive?: { mobile?: Record<string, any> };
  children?: Block[];
}

export interface BlockDefinition {
  label: string;
  icon: LucideIcon;
  category: "layout" | "content";
  isContainer: boolean;
  // Advisory only for now (not enforced until the drag-and-drop canvas
  // lands) — which child types are meaningful inside this container.
  allowedChildren?: string[];
  defaultProps: Record<string, any>;
}
