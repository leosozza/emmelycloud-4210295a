import { format } from "date-fns";

export function exportToCSV(data: Record<string, any>[], filename: string) {
  if (!data.length) return;
  const headers = Object.keys(data[0]);
  const csvRows = [
    headers.join(","),
    ...data.map((row) =>
      headers.map((h) => {
        const val = row[h];
        const str = val === null || val === undefined ? "" : String(val);
        return str.includes(",") || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
      }).join(",")
    ),
  ];
  const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, `${filename}_${format(new Date(), "yyyyMMdd")}.csv`);
}

export function exportToPDF(title: string, content: string) {
  // Simple HTML-to-print PDF approach
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>${title}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 40px; color: #333; }
        h1 { color: #1a1a2e; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; }
        h2 { color: #2d3748; margin-top: 24px; }
        table { width: 100%; border-collapse: collapse; margin: 16px 0; }
        th, td { border: 1px solid #e2e8f0; padding: 8px 12px; text-align: left; }
        th { background: #f7fafc; font-weight: 600; }
        .kpi { display: inline-block; margin: 8px 16px 8px 0; padding: 12px 20px; background: #f7fafc; border-radius: 8px; }
        .kpi-value { font-size: 24px; font-weight: 700; color: #1a1a2e; }
        .kpi-label { font-size: 12px; color: #718096; }
        @media print { body { padding: 20px; } }
      </style>
    </head>
    <body>
      <h1>${title}</h1>
      <p style="color:#718096;">Gerado em ${format(new Date(), "dd/MM/yyyy HH:mm")}</p>
      ${content}
    </body>
    </html>
  `);
  printWindow.document.close();
  setTimeout(() => printWindow.print(), 500);
}

export function printHtmlDocument(title: string, html: string, targetWindow?: Window | null) {
  const printWindow = targetWindow ?? window.open("", "_blank");
  if (!printWindow) {
    throw new Error("Não foi possível abrir a janela de impressão. Permita pop-ups e tente novamente.");
  }

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();

  const triggerPrint = () => {
    printWindow.document.title = title;
    printWindow.focus();
    printWindow.print();
  };

  if (printWindow.document.readyState === "complete") {
    setTimeout(triggerPrint, 300);
    return;
  }

  printWindow.onload = () => setTimeout(triggerPrint, 300);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

