/**
 * SERPPreview — live Google SERP-style preview of SEO title + meta description.
 * Updates as the admin types, showing character count warnings.
 */

interface SERPPreviewProps {
  title: string;
  description: string;
  url: string;
}

const TITLE_MAX = 60;
const DESC_MAX = 160;

function charClass(current: number, max: number): string {
  if (current > max) return "text-red-500 dark:text-red-400";
  if (current > max * 0.9) return "text-amber-500 dark:text-amber-400";
  return "text-green-600 dark:text-green-400";
}

export function SERPPreview({ title, description, url }: SERPPreviewProps) {
  const truncTitle = title.length > TITLE_MAX ? title.slice(0, TITLE_MAX) + "…" : title;
  const truncDesc =
    description.length > DESC_MAX ? description.slice(0, DESC_MAX) + "…" : description;

  return (
    <div className="space-y-3">
      {/* Preview box */}
      <div className="rounded-lg border border-input-border dark:border-dark-border bg-white dark:bg-dark-surface p-4 font-sans max-w-xl">
        <p className="text-xs text-text-secondary dark:text-dark-text-secondary truncate mb-1">
          {url}
        </p>
        <p className="text-[#1a0dab] dark:text-blue-400 text-lg font-medium leading-snug hover:underline cursor-default">
          {truncTitle || <span className="text-text-secondary dark:text-dark-text-secondary italic">Title preview</span>}
        </p>
        <p className="text-sm text-[#4d5156] dark:text-dark-text-secondary mt-0.5 leading-relaxed">
          {truncDesc || (
            <span className="text-text-secondary dark:text-dark-text-secondary italic">
              Description preview
            </span>
          )}
        </p>
      </div>

      {/* Character counters */}
      <div className="flex gap-6 text-xs">
        <span>
          Title:{" "}
          <span className={charClass(title.length, TITLE_MAX)}>
            {title.length}/{TITLE_MAX}
          </span>
        </span>
        <span>
          Description:{" "}
          <span className={charClass(description.length, DESC_MAX)}>
            {description.length}/{DESC_MAX}
          </span>
        </span>
      </div>
    </div>
  );
}
