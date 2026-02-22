import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createPlace } from "@/lib/api/admin";
import { ArrowLeft } from "lucide-react";

export function CreatePlacePage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    religion: "islam",
    place_type: "",
    lat: "",
    lng: "",
    address: "",
    description: "",
    source: "manual",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const place = await createPlace({
        name: form.name,
        religion: form.religion,
        place_type: form.place_type,
        lat: parseFloat(form.lat),
        lng: parseFloat(form.lng),
        address: form.address,
        description: form.description || undefined,
        source: form.source,
      });
      navigate(`/places/${place.place_code}`);
    } catch {
      setError("Failed to create place. Please check the fields and try again.");
    } finally {
      setSaving(false);
    }
  };

  const field = (label: string, key: keyof typeof form, type = "text", options?: string[]) => (
    <div className="space-y-1">
      <label className="text-xs font-medium text-text-secondary dark:text-dark-text-secondary">
        {label}
      </label>
      {options ? (
        <select
          value={form[key]}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
          className="w-full rounded-lg border border-input-border dark:border-dark-border bg-white dark:bg-dark-surface text-text-main dark:text-white text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={type}
          value={form[key]}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
          className="w-full rounded-lg border border-input-border dark:border-dark-border bg-white dark:bg-dark-surface text-text-main dark:text-white text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      )}
    </div>
  );

  return (
    <div className="space-y-6 max-w-2xl">
      <button
        onClick={() => navigate("/places")}
        className="flex items-center gap-1.5 text-sm text-text-secondary dark:text-dark-text-secondary hover:text-text-main dark:hover:text-white"
      >
        <ArrowLeft size={16} /> Back to Places
      </button>

      <h1 className="text-xl font-semibold text-text-main dark:text-white">Add Place</h1>

      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-input-border dark:border-dark-border bg-white dark:bg-dark-surface p-6 space-y-4"
      >
        {field("Name *", "name")}
        {field("Religion", "religion", "text", ["islam", "hinduism", "christianity"])}
        {field("Place Type *", "place_type")}
        {field("Latitude *", "lat", "number")}
        {field("Longitude *", "lng", "number")}
        {field("Address *", "address")}
        {field("Description", "description")}
        {field("Source", "source", "text", ["manual", "gmaps", "overpass"])}

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex gap-3 pt-2 border-t border-input-border dark:border-dark-border">
          <button
            type="button"
            onClick={() => navigate("/places")}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-input-border dark:border-dark-border text-text-main dark:text-white hover:bg-background-light dark:hover:bg-dark-bg transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? "Creating..." : "Create Place"}
          </button>
        </div>
      </form>
    </div>
  );
}
