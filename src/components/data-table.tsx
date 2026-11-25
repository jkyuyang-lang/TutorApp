"use client";

import { useState, useMemo, useCallback } from "react";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";

type SortDirection = "asc" | "desc";

export interface Column<T> {
  key: string;
  label: string;
  sortable?: boolean;
  align?: "left" | "right" | "center";
  headerClassName?: string;
  cellClassName?: string;
  /** Custom header content (e.g., checkbox). Overrides label. */
  header?: React.ReactNode;
  /** Render cell content. If omitted, uses row[key] as string. */
  render: (row: T, index: number) => React.ReactNode;
  /** Value used for sorting. If omitted, uses the rendered string. */
  sortValue?: (row: T) => string | number;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  /** Unique key for each row */
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  /** Additional className on the row (e.g., for selected state) */
  rowClassName?: (row: T) => string;
  emptyMessage?: string;
  /** Default sort state */
  defaultSort?: { key: string; direction: SortDirection };
  /**
   * External sort control (for server-side sorting).
   * When provided, client-side sorting is disabled.
   */
  sortKey?: string;
  sortDirection?: SortDirection;
  onSort?: (key: string, direction: SortDirection) => void;
}

export function DataTable<T>({
  columns,
  data,
  rowKey,
  onRowClick,
  rowClassName,
  emptyMessage = "No data found.",
  defaultSort,
  sortKey: externalSortKey,
  sortDirection: externalSortDirection,
  onSort: externalOnSort,
}: DataTableProps<T>) {
  const isControlled = externalOnSort !== undefined;

  const [internalSortKey, setInternalSortKey] = useState(defaultSort?.key ?? "");
  const [internalSortDir, setInternalSortDir] = useState<SortDirection>(defaultSort?.direction ?? "asc");

  const activeSortKey = isControlled ? (externalSortKey ?? "") : internalSortKey;
  const activeSortDir = isControlled ? (externalSortDirection ?? "asc") : internalSortDir;

  const handleSort = useCallback((key: string) => {
    if (isControlled) {
      const newDir = externalSortKey === key && externalSortDirection === "asc" ? "desc" : "asc";
      externalOnSort!(key, newDir);
    } else {
      if (internalSortKey === key) {
        setInternalSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setInternalSortKey(key);
        setInternalSortDir("asc");
      }
    }
  }, [isControlled, externalSortKey, externalSortDirection, externalOnSort, internalSortKey]);

  const sortedData = useMemo(() => {
    if (isControlled || !activeSortKey) return data;

    const col = columns.find((c) => c.key === activeSortKey);
    if (!col?.sortValue) return data;

    const sorted = [...data].sort((a, b) => {
      const aVal = col.sortValue!(a);
      const bVal = col.sortValue!(b);
      if (typeof aVal === "number" && typeof bVal === "number") {
        return aVal - bVal;
      }
      return String(aVal).localeCompare(String(bVal));
    });

    return activeSortDir === "desc" ? sorted.reverse() : sorted;
  }, [isControlled, data, columns, activeSortKey, activeSortDir]);

  const alignClass = (align?: "left" | "right" | "center") => {
    if (align === "right") return "text-right";
    if (align === "center") return "text-center";
    return "text-left";
  };

  return (
    <div className="overflow-x-auto rounded-lg border bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-4 py-3 font-medium ${alignClass(col.align)} ${
                  col.sortable ? "cursor-pointer select-none hover:text-foreground" : ""
                } ${col.headerClassName ?? ""}`}
                onClick={col.sortable ? () => handleSort(col.key) : undefined}
              >
                {col.header !== undefined ? (
                  col.header
                ) : (
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {col.sortable && (
                      <SortIcon
                        active={activeSortKey === col.key}
                        direction={activeSortKey === col.key ? activeSortDir : undefined}
                      />
                    )}
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedData.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="py-8 text-center text-muted-foreground"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            sortedData.map((row, index) => (
              <tr
                key={rowKey(row)}
                className={`border-b transition-colors ${
                  onRowClick ? "cursor-pointer hover:bg-yellow-50" : "hover:bg-muted/30"
                } ${rowClassName?.(row) ?? ""}`}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-4 py-3 ${alignClass(col.align)} ${col.cellClassName ?? ""}`}
                  >
                    {col.render(row, index)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function SortIcon({ active, direction }: { active: boolean; direction?: SortDirection }) {
  if (!active) {
    return <ArrowUpDown className="size-3.5 text-muted-foreground/50" />;
  }
  if (direction === "asc") {
    return <ArrowUp className="size-3.5" />;
  }
  return <ArrowDown className="size-3.5" />;
}
