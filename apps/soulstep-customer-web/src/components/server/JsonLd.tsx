// Pure Server Component — no 'use client'
// Renders one or more JSON-LD <script> tags into the server-rendered HTML.
// Crawlers (Googlebot, GPTBot, etc.) read structured data from here directly.

interface JsonLdProps {
  schemas: Record<string, unknown>[];
}

export function JsonLd({ schemas }: JsonLdProps) {
  if (!schemas.length) return null;
  return (
    <>
      {schemas.map((schema, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}
    </>
  );
}
