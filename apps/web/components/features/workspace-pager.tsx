"use client";
import { Button } from "@/components/ui/button";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronLeft,
  ChevronRight
} from "lucide-react";

export function Pager({
  page,
  pageSize,
  total,
  pending,
  onChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  pending: boolean;
  onChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-xs text-muted-foreground">
      <span role="status">
        {pending ? (
          "Loading…"
        ) : (
          <>
            {total} record{total === 1 ? "" : "s"} · Page {page} of {pages}
          </>
        )}
      </span>
      <div className="flex items-center gap-3">
        <Select
          value={String(pageSize)}
          disabled={pending}
          onValueChange={(value) => onPageSizeChange(Number(value))}
        >
          <SelectTrigger
            aria-label="Rows per page"
            className="h-8 w-auto gap-2 text-xs"
          >
            <SelectValue>{pageSize} per page</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {[...new Set([25, 50, 100, pageSize])]
              .sort((a, b) => a - b)
              .map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size} per page
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <Pagination className="mx-0 w-auto">
          <PaginationContent>
            <PaginationItem>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Previous page"
                disabled={page <= 1 || pending}
                onClick={() => onChange(page - 1)}
              >
                <ChevronLeft />
              </Button>
            </PaginationItem>
            <PaginationItem>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Next page"
                disabled={page >= pages || pending}
                onClick={() => onChange(page + 1)}
              >
                <ChevronRight />
              </Button>
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </div>
  );
}
