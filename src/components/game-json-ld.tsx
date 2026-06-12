export function GameJsonLd({ data }: { data: Record<string, unknown>[] }) {
  return (
    <>
      {data.map((block, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(block) }}
        />
      ))}
    </>
  );
}
