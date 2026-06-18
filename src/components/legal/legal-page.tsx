type LegalSection = {
  title: string;
  paragraphs: string[];
};

export function LegalPage({
  eyebrow = "Legal",
  title,
  updatedAt,
  sections,
}: {
  eyebrow?: string;
  title: string;
  updatedAt: string;
  sections: LegalSection[];
}) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-14">
      <p className="eyebrow text-accent">{eyebrow}</p>
      <h1 className="mt-3 text-4xl font-black tracking-tight text-foreground">{title}</h1>
      <p className="mt-3 text-sm text-muted">Última actualización: {updatedAt}</p>
      <div className="mt-8 space-y-5 rounded-3xl border border-border bg-card p-6 text-base leading-8 text-muted shadow-soft">
        {sections.map((section) => (
          <section key={section.title} className="space-y-3">
            <h2 className="text-lg font-bold text-foreground">{section.title}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </section>
        ))}
      </div>
    </main>
  );
}
