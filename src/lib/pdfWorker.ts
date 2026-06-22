"use client";

import { pdfjs } from "react-pdf";

export function configurePdfWorker() {
  if (typeof window === "undefined") {
    return;
  }

  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();
}
