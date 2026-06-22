"use client";

import { UploadCloud } from "lucide-react";
import type { ChangeEvent } from "react";

interface PdfUploaderProps {
  onImport: (file: File) => void;
  compact?: boolean;
}

export default function PdfUploader({ onImport, compact = false }: PdfUploaderProps) {
  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file && file.type === "application/pdf") {
      onImport(file);
    }
    event.target.value = "";
  }

  return (
    <label
      className={`group flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-sage/50 bg-white/80 text-sm font-semibold text-stone-700 shadow-tool transition hover:border-sage hover:bg-skysoft/40 dark:border-sage/40 dark:bg-stone-900/80 dark:text-stone-100 ${
        compact ? "px-3 py-2" : "px-5 py-4"
      }`}
    >
      <UploadCloud className="h-4 w-4 text-sage transition group-hover:-translate-y-0.5" />
      <span>{compact ? "Import PDF" : "Import IELTS PDF"}</span>
      <input className="sr-only" type="file" accept="application/pdf" onChange={handleFileChange} />
    </label>
  );
}
