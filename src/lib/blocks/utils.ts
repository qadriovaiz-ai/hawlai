import type { Block } from "./types";

// Used to decide whether a page needs a live products fetch before
// rendering — recursive since blocks can nest arbitrarily (unlike the
// old flat sections array, where a "product_catalog" was always a
// top-level item).
export function blockTreeContainsType(blocks: Block[], type: string): boolean {
  return blocks.some((b) => b.type === type || (b.children != null && blockTreeContainsType(b.children, type)));
}
