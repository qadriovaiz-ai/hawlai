import type { Block } from "./types";

// Immutable helpers operating on a block tree by id — shared by the
// drag-and-drop canvas, the properties panel (later phases), and
// undo/redo, so there's one place that knows how to walk/mutate the
// tree instead of every consumer re-deriving it.

export function findBlockById(blocks: Block[], id: string): Block | null {
  for (const b of blocks) {
    if (b.id === id) return b;
    if (b.children) {
      const found = findBlockById(b.children, id);
      if (found) return found;
    }
  }
  return null;
}

export function removeBlockById(blocks: Block[], id: string): { tree: Block[]; removed: Block | null } {
  let removed: Block | null = null;
  function walk(list: Block[]): Block[] {
    const next: Block[] = [];
    for (const b of list) {
      if (b.id === id) {
        removed = b;
        continue;
      }
      next.push(b.children ? { ...b, children: walk(b.children) } : b);
    }
    return next;
  }
  const tree = walk(blocks);
  return { tree, removed };
}

// containerId === null means "top level" (the page's own block array).
export function insertBlockAt(blocks: Block[], containerId: string | null, index: number, block: Block): Block[] {
  if (containerId === null) {
    const next = [...blocks];
    next.splice(Math.max(0, Math.min(index, next.length)), 0, block);
    return next;
  }
  function walk(list: Block[]): Block[] {
    return list.map((b) => {
      if (b.id === containerId) {
        const children = [...(b.children ?? [])];
        children.splice(Math.max(0, Math.min(index, children.length)), 0, block);
        return { ...b, children };
      }
      return b.children ? { ...b, children: walk(b.children) } : b;
    });
  }
  return walk(blocks);
}

export function moveBlock(blocks: Block[], blockId: string, targetContainerId: string | null, targetIndex: number): Block[] {
  const { tree, removed } = removeBlockById(blocks, blockId);
  if (!removed) return blocks;
  return insertBlockAt(tree, targetContainerId, targetIndex, removed);
}

export function updateBlockProps(blocks: Block[], id: string, props: Record<string, any>): Block[] {
  return blocks.map((b) => {
    if (b.id === id) return { ...b, props: { ...b.props, ...props } };
    if (b.children) return { ...b, children: updateBlockProps(b.children, id, props) };
    return b;
  });
}

export function removeBlock(blocks: Block[], id: string): Block[] {
  return removeBlockById(blocks, id).tree;
}

export function updateBlockResponsiveMobile(blocks: Block[], id: string, mobile: Record<string, any>): Block[] {
  return blocks.map((b) => {
    if (b.id === id) return { ...b, responsive: { ...b.responsive, mobile: { ...b.responsive?.mobile, ...mobile } } };
    if (b.children) return { ...b, children: updateBlockResponsiveMobile(b.children, id, mobile) };
    return b;
  });
}
