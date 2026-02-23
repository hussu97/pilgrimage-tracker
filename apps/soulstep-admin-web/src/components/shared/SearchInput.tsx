import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchInputProps {
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  debounceMs?: number;
  className?: string;
}

export function SearchInput({
  placeholder = "Search...",
  value,
  onChange,
  debounceMs = 300,
  className,
}: SearchInputProps) {
  const [local, setLocal] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  const handleChange = (v: string) => {
    setLocal(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onChange(v), debounceMs);
  };

  return (
    <div className={cn("relative", className)}>
      <Search
        size={16}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary dark:text-dark-text-secondary pointer-events-none"
      />
      <input
        type="text"
        value={local}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "w-full rounded-lg border bg-white dark:bg-dark-surface pl-9 pr-8 py-2 text-sm",
          "border-input-border dark:border-dark-border",
          "text-text-main dark:text-white placeholder:text-text-secondary dark:placeholder:text-dark-text-secondary",
          "focus:outline-none focus:ring-2 focus:ring-primary/30"
        )}
      />
      {local && (
        <button
          onClick={() => handleChange("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-text-secondary dark:text-dark-text-secondary hover:text-text-main dark:hover:text-white"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
