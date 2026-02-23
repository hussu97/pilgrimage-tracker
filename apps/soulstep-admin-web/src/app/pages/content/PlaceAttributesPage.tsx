import { useCallback, useEffect, useState } from "react";
import { listPlaceAttributeDefinitions } from "@/lib/api/admin";
import type { PlaceAttributeDefinition } from "@/lib/api/types";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";

export function PlaceAttributesPage() {
  const [defs, setDefs] = useState<PlaceAttributeDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [religionFilter, setReligionFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setDefs(await listPlaceAttributeDefinitions());
    } catch {
      setDefs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = defs.filter((d) => {
    if (categoryFilter && d.category !== categoryFilter) return false;
    if (religionFilter) {
      if (religionFilter === "all" && d.religion !== null) return false;
      if (religionFilter !== "all" && d.religion !== religionFilter) return false;
    }
    return true;
  });

  const categories = [...new Set(defs.map((d) => d.category).filter(Boolean) as string[])];
  const religions = [...new Set(defs.map((d) => d.religion).filter(Boolean) as string[])];

  const columns: Column<PlaceAttributeDefinition>[] = [
    {
      key: "attribute_code",
      header: "Code",
      render: (d) => (
        <span className="font-mono text-xs text-text-main dark:text-white">{d.attribute_code}</span>
      ),
    },
    {
      key: "name",
      header: "Name",
      render: (d) => <span className="text-sm">{d.name}</span>,
    },
    {
      key: "data_type",
      header: "Type",
      render: (d) => (
        <span className="font-mono text-xs text-text-secondary dark:text-dark-text-secondary">
          {d.data_type}
        </span>
      ),
    },
    {
      key: "category",
      header: "Category",
      render: (d) =>
        d.category ? (
          <span className="text-xs capitalize">{d.category}</span>
        ) : (
          <span className="text-xs text-text-secondary dark:text-dark-text-secondary">—</span>
        ),
    },
    {
      key: "religion",
      header: "Religion",
      render: (d) =>
        d.religion ? (
          <span className="text-xs capitalize">{d.religion}</span>
        ) : (
          <span className="text-xs text-text-secondary dark:text-dark-text-secondary">all</span>
        ),
    },
    {
      key: "is_filterable",
      header: "Filterable",
      render: (d) => (
        <StatusBadge
          label={d.is_filterable ? "Yes" : "No"}
          variant={d.is_filterable ? "success" : "neutral"}
        />
      ),
    },
    {
      key: "usage_count",
      header: "Usage",
      render: (d) => (
        <span className="text-sm font-semibold text-text-main dark:text-white">
          {d.usage_count}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-text-main dark:text-white">Place Attributes</h1>
        <p className="text-sm text-text-secondary dark:text-dark-text-secondary mt-0.5">
          Attribute definitions with usage counts across all places.
        </p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-lg border border-input-border dark:border-dark-border bg-white dark:bg-dark-surface px-3 py-2 text-sm text-text-main dark:text-white outline-none focus:border-primary"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select
          value={religionFilter}
          onChange={(e) => setReligionFilter(e.target.value)}
          className="rounded-lg border border-input-border dark:border-dark-border bg-white dark:bg-dark-surface px-3 py-2 text-sm text-text-main dark:text-white outline-none focus:border-primary"
        >
          <option value="">All religions</option>
          <option value="all">Religion-agnostic only</option>
          {religions.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <span className="text-xs text-text-secondary dark:text-dark-text-secondary">
          {filtered.length} definition{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        loading={loading}
        rowKey={(d) => d.attribute_code}
        emptyMessage="No attribute definitions found."
      />
    </div>
  );
}
