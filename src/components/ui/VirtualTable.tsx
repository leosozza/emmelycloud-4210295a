import { useRef, ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

interface Column<T> {
  header: string;
  className?: string;
  render: (item: T) => ReactNode;
}

interface VirtualTableProps<T> {
  data: T[];
  columns: Column<T>[];
  rowHeight?: number;
  maxHeight?: string;
  emptyMessage?: string;
  isLoading?: boolean;
  loadingMessage?: string;
  onRowClick?: (item: T) => void;
  getRowKey: (item: T) => string;
}

export function VirtualTable<T>({
  data,
  columns,
  rowHeight = 48,
  maxHeight = "calc(100vh - 20rem)",
  emptyMessage = "Nenhum registo encontrado",
  isLoading = false,
  loadingMessage = "A carregar...",
  onRowClick,
  getRowKey,
}: VirtualTableProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: data.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 10,
  });

  const totalSpan = columns.length;

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col, i) => (
              <TableHead key={i} className={col.className}>{col.header}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
      </Table>
      <div ref={parentRef} style={{ maxHeight, overflow: "auto" }}>
        {isLoading ? (
          <Table>
            <TableBody>
              <TableRow>
                <TableCell colSpan={totalSpan} className="text-center text-muted-foreground">
                  {loadingMessage}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        ) : data.length === 0 ? (
          <Table>
            <TableBody>
              <TableRow>
                <TableCell colSpan={totalSpan} className="text-center text-muted-foreground">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        ) : (
          <div style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const item = data[virtualRow.index];
              return (
                <div
                  key={getRowKey(item)}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <Table>
                    <TableBody>
                      <TableRow
                        className={onRowClick ? "cursor-pointer" : undefined}
                        onClick={onRowClick ? () => onRowClick(item) : undefined}
                      >
                        {columns.map((col, ci) => (
                          <TableCell key={ci} className={col.className}>
                            {col.render(item)}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
