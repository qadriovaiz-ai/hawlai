"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import CanvasEditor from "@/components/graphic-design/CanvasEditor";

function EditorContent() {
  const searchParams = useSearchParams();
  const designId = searchParams.get("id");
  return <CanvasEditor designId={designId} />;
}

export default function CanvasEditorPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-sm text-slate-400">Loading editor...</div>}>
      <EditorContent />
    </Suspense>
  );
}
