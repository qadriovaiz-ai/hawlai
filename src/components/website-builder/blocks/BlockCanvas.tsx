"use client";

import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2 } from "lucide-react";
import { BLOCK_REGISTRY, createBlock } from "@/lib/blocks/registry";
import { moveBlock, removeBlock, insertBlockAt, findBlockById, updateBlockProps } from "@/lib/blocks/treeOps";
import type { Block, BlockDefinition } from "@/lib/blocks/types";
import type { LandingTheme } from "@/lib/landingThemes";
import BlockRenderer from "./BlockRenderer";
import PropertiesPanel from "./PropertiesPanel";
import RichTextArea from "../RichTextArea";
import ImageUploader from "../ImageUploader";

const HEADING_FONT_SIZE: Record<number, string> = { 1: "1.875rem", 2: "1.5rem", 3: "1.125rem" };

// The root of the page's own block array — a page's top-level blocks
// are always `type: "section"` (the one structural rule the whole
// block model enforces outside the registry), so this is also used to
// reject a non-section drop at the top level in handleDragEnd.
const ROOT_CONTAINER = "__root__";

// A container is only editable as a drop target here if the registry
// doesn't explicitly say it never takes children (product_grid is
// `isContainer: true` structurally — it wraps a live product fetch —
// but has nothing a dealer should drag blocks into).
function isEditableContainer(def: BlockDefinition | undefined): boolean {
  return !!def?.isContainer && def.allowedChildren?.length !== 0;
}

export default function BlockCanvas({
  blocks,
  onChange,
  theme,
  slug,
}: {
  blocks: Block[];
  onChange: (blocks: Block[]) => void;
  theme: LandingTheme;
  slug: string;
}) {
  const [activeType, setActiveType] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const selectedBlock = selectedId ? findBlockById(blocks, selectedId) : null;

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current as any;
    if (data?.kind === "new") setActiveType(data.blockType);
    else setActiveType(findBlockById(blocks, String(event.active.id))?.type ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveType(null);
    const { active, over } = event;
    if (!over) return;

    const activeData = active.data.current as any;
    const overData = over.data.current as { containerId: string; index: number } | undefined;
    if (!overData) return;

    const targetContainerId = overData.containerId === ROOT_CONTAINER ? null : overData.containerId;
    let targetIndex = overData.index;

    // Enforce the one real structural rule: top-level blocks are
    // always sections.
    if (targetContainerId === null) {
      const droppedType = activeData?.kind === "new" ? activeData.blockType : findBlockById(blocks, String(active.id))?.type;
      if (droppedType !== "section") return;
    }

    if (activeData?.kind === "new") {
      onChange(insertBlockAt(blocks, targetContainerId, targetIndex, createBlock(activeData.blockType)));
      return;
    }
    if (!activeData) return;

    const blockId = String(active.id);
    const sourceContainerId = activeData.containerId === ROOT_CONTAINER ? null : activeData.containerId;
    if (sourceContainerId === targetContainerId) {
      if (activeData.index === targetIndex) return;
      if (activeData.index < targetIndex) targetIndex -= 1;
    }
    onChange(moveBlock(blocks, blockId, targetContainerId, targetIndex));
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 items-start">
        <BlockPalette />
        <div className="flex-1 min-w-0 border border-dashed border-slate-300 rounded-xl p-4 bg-white" onClick={() => setSelectedId(null)}>
          <ContainerDropZone containerId={ROOT_CONTAINER} items={blocks}>
            {blocks.map((block, i) => (
              <CanvasNode
                key={block.id}
                block={block}
                containerId={ROOT_CONTAINER}
                index={i}
                onChange={onChange}
                rootBlocks={blocks}
                theme={theme}
                slug={slug}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            ))}
          </ContainerDropZone>
        </div>
        <PropertiesPanel
          block={selectedBlock}
          onDeselect={() => setSelectedId(null)}
          onChange={(props) => {
            if (selectedId) onChange(updateBlockProps(blocks, selectedId, props));
          }}
        />
      </div>
      <DragOverlay>
        {activeType ? <div className="px-3 py-2 rounded-lg bg-purple-600 text-white text-xs shadow-lg">{BLOCK_REGISTRY[activeType]?.label ?? activeType}</div> : null}
      </DragOverlay>
    </DndContext>
  );
}

// Wraps a container's children in a SortableContext for reordering; if
// the container is empty, it also becomes its own droppable target
// (there's no sibling item to attach drop data to otherwise).
function ContainerDropZone({ containerId, items, children }: { containerId: string; items: Block[]; children: React.ReactNode }) {
  const isEmpty = items.length === 0;
  const { setNodeRef, isOver } = useDroppable({ id: `empty:${containerId}`, data: { containerId, index: 0 }, disabled: !isEmpty });
  return (
    <SortableContext items={items.map((b) => b.id)} strategy={verticalListSortingStrategy}>
      <div
        ref={isEmpty ? setNodeRef : undefined}
        className={isEmpty ? `flex items-center justify-center text-xs text-slate-400 rounded-lg py-6 ${isOver ? "bg-purple-50 ring-2 ring-purple-300" : "bg-slate-50"}` : "space-y-2"}
      >
        {isEmpty ? "Drop a block here" : children}
      </div>
    </SortableContext>
  );
}

function CanvasNode({
  block,
  containerId,
  index,
  onChange,
  rootBlocks,
  theme,
  slug,
  selectedId,
  onSelect,
}: {
  block: Block;
  containerId: string;
  index: number;
  onChange: (blocks: Block[]) => void;
  rootBlocks: Block[];
  theme: LandingTheme;
  slug: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const def = BLOCK_REGISTRY[block.type];
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
    data: { containerId, index },
  });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  const isSelected = selectedId === block.id;

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(block.id);
      }}
      className={`group/block relative border rounded-lg pl-6 pr-5 py-1 cursor-pointer ${isSelected ? "border-purple-500 ring-1 ring-purple-300" : "border-transparent hover:border-purple-200"}`}
    >
      <button {...attributes} {...listeners} onClick={(e) => e.stopPropagation()} className="absolute left-0 top-1.5 p-0.5 text-slate-300 hover:text-slate-600 cursor-grab active:cursor-grabbing opacity-0 group-hover/block:opacity-100">
        <GripVertical className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onChange(removeBlock(rootBlocks, block.id));
        }}
        className="absolute right-0 top-1.5 p-0.5 text-slate-300 hover:text-red-500 opacity-0 group-hover/block:opacity-100"
        title="Delete block"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>

      {isEditableContainer(def) ? (
        <div className="border border-dashed border-slate-200 rounded-lg p-2">
          <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-1.5">{def!.label}</p>
          <ContainerDropZone containerId={block.id} items={block.children ?? []}>
            {(block.children ?? []).map((child, i) => (
              <CanvasNode
                key={child.id}
                block={child}
                containerId={block.id}
                index={i}
                onChange={onChange}
                rootBlocks={rootBlocks}
                theme={theme}
                slug={slug}
                selectedId={selectedId}
                onSelect={onSelect}
              />
            ))}
          </ContainerDropZone>
        </div>
      ) : isSelected && (block.type === "heading" || block.type === "text" || block.type === "image") ? (
        <div onClick={(e) => e.stopPropagation()}>
          <InlineLeafEditor block={block} onUpdate={(props) => onChange(updateBlockProps(rootBlocks, block.id, props))} />
        </div>
      ) : (
        <BlockRenderer block={block} ctx={{ theme, slug }} />
      )}
    </div>
  );
}

// Editing a heading/text/image block right where it sits in the canvas
// (matching the old Live Preview Editor's click-to-edit feel) instead
// of forcing every edit through the side panel — reuses the exact same
// components the Site Editor's rich text and image upload features
// already built, so a block's editing behavior is never a bespoke
// reimplementation per type.
function InlineLeafEditor({ block, onUpdate }: { block: Block; onUpdate: (props: Record<string, any>) => void }) {
  if (block.type === "heading") {
    return (
      <input
        autoFocus
        value={block.props.text ?? ""}
        onChange={(e) => onUpdate({ text: e.target.value })}
        className="w-full bg-transparent border border-dashed border-purple-300 rounded px-1 outline-none font-bold"
        style={{ fontSize: HEADING_FONT_SIZE[block.props.level] ?? HEADING_FONT_SIZE[2], textAlign: block.props.align }}
      />
    );
  }
  if (block.type === "text") {
    return (
      <RichTextArea
        value={block.props.html ?? ""}
        onChange={(v) => onUpdate({ html: v })}
        rows={2}
        className="w-full bg-transparent border border-dashed border-purple-300 rounded px-1"
        style={{ textAlign: block.props.align as any }}
      />
    );
  }
  return <ImageUploader kind="section" currentUrl={block.props.url || undefined} onUploaded={(url) => onUpdate({ url })} />;
}

function BlockPalette() {
  const categories: Array<{ key: "layout" | "content"; label: string }> = [
    { key: "layout", label: "Layout" },
    { key: "content", label: "Content" },
  ];
  return (
    <div className="w-40 shrink-0 space-y-4 sticky top-0">
      {categories.map((cat) => (
        <div key={cat.key}>
          <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-1.5">{cat.label}</p>
          <div className="space-y-1">
            {Object.entries(BLOCK_REGISTRY)
              .filter(([, def]) => def.category === cat.key)
              .map(([type, def]) => (
                <PaletteItem key={type} type={type} def={def} />
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function PaletteItem({ type, def }: { type: string; def: BlockDefinition }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `palette:${type}`, data: { kind: "new", blockType: type } });
  const Icon = def.icon;
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ transform: transform ? CSS.Translate.toString(transform) : undefined, opacity: isDragging ? 0.4 : 1 }}
      className="flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-lg border border-slate-200 bg-slate-50 cursor-grab active:cursor-grabbing hover:border-purple-300"
    >
      <Icon className="w-3.5 h-3.5 text-slate-500 shrink-0" /> {def.label}
    </div>
  );
}
