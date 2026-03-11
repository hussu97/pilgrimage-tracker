import { useState } from 'react';

interface PlaceFAQProps {
  faqs?: Array<{ question: string; answer: string }>;
}

export default function PlaceFAQ({ faqs }: PlaceFAQProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  if (!faqs || faqs.length === 0) return null;

  const toggle = (i: number) => {
    setExpandedIndex(expandedIndex === i ? null : i);
  };

  return (
    <section className="mt-6">
      <h2 className="text-lg font-semibold text-text-main dark:text-white mb-3">
        Frequently Asked Questions
      </h2>
      <div className="space-y-2">
        {faqs.map((faq, i) => (
          <div
            key={i}
            className="rounded-xl border border-slate-100 dark:border-dark-border bg-white dark:bg-dark-surface overflow-hidden"
          >
            <button
              type="button"
              onClick={() => toggle(i)}
              className="w-full flex items-center justify-between px-4 py-3 text-left"
            >
              <span className="text-sm font-medium text-text-main dark:text-white pr-2">
                {faq.question}
              </span>
              <span
                className="material-symbols-outlined text-text-muted dark:text-dark-text-secondary text-lg shrink-0 transition-transform duration-200"
                style={{ transform: expandedIndex === i ? 'rotate(180deg)' : undefined }}
              >
                expand_more
              </span>
            </button>
            {expandedIndex === i && (
              <div className="px-4 pb-3">
                <p className="text-sm text-text-secondary dark:text-dark-text-secondary leading-relaxed">
                  {faq.answer}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
