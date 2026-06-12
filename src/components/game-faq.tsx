import type { GameFaqItem } from "@/lib/catalog-seo";
import { Panel, PanelTitle } from "@/components/ui";

export function GameFaq({ faqs }: { faqs: GameFaqItem[] }) {
  if (faqs.length === 0) return null;

  return (
    <Panel>
      <PanelTitle>Preguntas frecuentes</PanelTitle>
      <dl className="space-y-5">
        {faqs.map((faq) => (
          <div key={faq.question}>
            <dt className="text-sm font-semibold text-foreground">{faq.question}</dt>
            <dd className="mt-1.5 text-sm leading-relaxed text-muted">{faq.answer}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}
