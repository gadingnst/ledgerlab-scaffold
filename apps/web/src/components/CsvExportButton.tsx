import { useState } from "react";
import { Button } from "@ledgerlab/ui";
import { downloadFile } from "../lib/download";

export interface CsvExportButtonProps {
  filename: string;
  getData: () => string;
  label?: string;
  size?: "sm" | "md";
}

export function CsvExportButton({
  filename,
  getData,
  label = "Export CSV",
  size = "sm",
}: CsvExportButtonProps) {
  const [downloading, setDownloading] = useState(false);

  function handleExport() {
    setDownloading(true);
    try {
      const csv = getData();
      downloadFile(csv, filename);
    } finally {
      setTimeout(() => setDownloading(false), 300);
    }
  }

  return (
    <Button
      type="button"
      variant="secondary"
      size={size}
      loading={downloading}
      onClick={handleExport}
      className="inline-flex items-center gap-1.5"
    >
      <svg className="size-3.5 text-zinc-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path
          fillRule="evenodd"
          d="M10 3a.75.75 0 01.75.75v10.638l3.96-4.158a.75.75 0 111.08 1.04l-5.25 5.5a.75.75 0 01-1.08 0l-5.25-5.5a.75.75 0 111.08-1.04l3.96 4.158V3.75A.75.75 0 0110 3z"
          clipRule="evenodd"
        />
      </svg>
      <span>{label}</span>
    </Button>
  );
}
