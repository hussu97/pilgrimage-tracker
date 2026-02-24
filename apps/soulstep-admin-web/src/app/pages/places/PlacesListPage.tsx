import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { listPlaces, bulkDeletePlaces, exportUrl } from "@/lib/api/admin";
import type { AdminPlace } from "@/lib/api/types";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { SearchInput } from "@/components/shared/SearchInput";
import { Pagination } from "@/components/shared/Pagination";
import { BulkActionBar } from "@/components/shared/BulkActionBar";
import { usePagination } from "@/lib/hooks/usePagination";
import { formatDate } from "@/lib/utils";
import { Plus } from "lucide-react";

export function PlacesListPage() {
  const navigate = useNavigate();
  const { page, pageSize, setPage, setPageSize } = usePagination(50);
  const [search, setSearch] = useState("");
  const [religionFilter, setReligionFilter] = useState("");
  const [data, setData] = useState<{ items: AdminPlace[]; total: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page, page_size: pageSize };
      if (search) params.search = search;
      if (religionFilter) params.religion = religionFilter;
      const res = await listPlaces(params as Parameters<typeof listPlaces>[0]);
      setData(res);
    } catch {
      setData({ items: [], total: 0 });
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, religionFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleBulkDelete = async () => {
    await bulkDeletePlaces(Array.from(selected));
    setSelected(new Set());
    void load();
  };

  const columns: Column<AdminPlace>[] = [
    { key: "name", header: "Name", render: (p) => p.name },
    {
      key: "religion",
      header: "Religion",
      render: (p) => (
        <span className="capitalize text-text-secondary dark:text-dark-text-secondary">{p.religion}</span>
      ),
    },
    {
      key: "place_type",
      header: "Type",
      render: (p) => (
        <span className="text-text-secondary dark:text-dark-text-secondary">{p.place_type}</span>
      ),
    },
    { key: "reviews", header: "Reviews", render: (p) => p.review_count },
    { key: "checkins", header: "Check-ins", render: (p) => p.check_in_count },
    {
      key: "created_at",
      header: "Added",
      render: (p) => (
        <span className="text-text-secondary dark:text-dark-text-secondary">{formatDate(p.created_at)}</span>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text-main dark:text-white">Places</h1>
        <button
          onClick={() => navigate("/places/new")}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus size={16} /> Add Place
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        <SearchInput
          value={search}
          onChange={(v) => { setSearch(v); setPage(1); }}
          placeholder="Search by name..."
          className="w-64"
        />
        <select
          value={religionFilter}
          onChange={(e) => { setReligionFilter(e.target.value); setPage(1); }}
          className="rounded-lg border border-input-border dark:border-dark-border bg-white dark:bg-dark-surface text-text-main dark:text-white text-sm px-3 py-2"
        >
          <option value="">All Religions</option>
          <option value="islam">Islam</option>
          <option value="hinduism">Hinduism</option>
          <option value="christianity">Christianity</option>
        </select>
        <div className="relative group">
          <button className="rounded-lg border border-input-border dark:border-dark-border bg-white dark:bg-dark-surface text-text-main dark:text-white text-sm px-3 py-2 flex items-center gap-1">
            Export ▾
          </button>
          <div className="absolute right-0 top-full mt-1 hidden group-hover:flex flex-col gap-1 bg-white dark:bg-dark-surface border border-input-border dark:border-dark-border rounded-lg shadow-lg p-1 z-10 min-w-[120px]">
            <a href={exportUrl("places", "csv")} download className="px-3 py-1.5 text-sm text-text-main dark:text-white hover:bg-background-light dark:hover:bg-dark-bg rounded">CSV</a>
            <a href={exportUrl("places", "json")} download className="px-3 py-1.5 text-sm text-text-main dark:text-white hover:bg-background-light dark:hover:bg-dark-bg rounded">JSON</a>
          </div>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={data?.items ?? []}
        loading={loading}
        rowKey={(p) => p.place_code}
        onRowClick={(p) => navigate(`/places/${p.place_code}`)}
        emptyMessage="No places found."
        selectable
        selectedKeys={selected}
        onSelectionChange={setSelected}
      />

      <Pagination
        page={page}
        pageSize={pageSize}
        total={data?.total ?? 0}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />

      <BulkActionBar
        selectedCount={selected.size}
        actions={[
          { label: "Delete", onClick: () => { void handleBulkDelete(); }, variant: "danger" },
        ]}
        onClear={() => setSelected(new Set())}
      />
    </div>
  );
}
