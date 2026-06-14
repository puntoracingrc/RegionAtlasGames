import type { Metadata } from "next";
import type { CatalogGame, GameDetails, Platform } from "./types";
import {
  formatEur,
  getCatalogGame,
  getPlatform,
  listedCatalog,
} from "./catalog";
import { getGameDetails } from "./indexes";
import { companyEntityLink, resolveGameEntityLinks } from "./entity-links";
import { resolveCanonicalGenreSlug } from "./genre-canonical";
import {
  buildCatalogSeoSlug,
  catalogGamePath,
  getCatalogGameBySeoSlug,
  getListedGamesWithEsPrice,
  resolveCatalogGameParam,
} from "./catalog-url";
import { slugify } from "./slug";
import { getRegionDisplay } from "./region-display";
import { SITE_LOGO } from "./site-brand";
import { getCoverSrc } from "./cover-url";
import { getSiteUrl } from "./site-url";
import { hasVerifiedEsPrice, hasVerifiedEsPriceRange } from "./price-display";

export {
  buildCatalogSeoSlug,
  catalogGamePath,
  getCatalogGameBySeoSlug,
  getListedGamesWithEsPrice,
  resolveCatalogGameParam,
};
export { getSiteUrl };

export function getSimilarGames(game: CatalogGame, limit = 4): CatalogGame[] {
  const details = getGameDetails(game.id);
  const genreSlugs = new Set(
    (details?.genres ?? []).map((g) =>
      resolveCanonicalGenreSlug(g.slug, { name: g.name, museumPath: g.museumPath }),
    ),
  );
  const candidates = listedCatalog.filter(
    (g) =>
      g.id !== game.id &&
      g.platformSlug === game.platformSlug &&
      (g.hasEsPrice || g.recommendedPrice != null),
  );

  const scored = candidates.map((g) => {
    const d = getGameDetails(g.id);
    let score = 0;
    if (g.region === game.region) score += 3;
    for (const genre of d?.genres ?? []) {
      const canonicalSlug = resolveCanonicalGenreSlug(genre.slug, {
        name: genre.name,
        museumPath: genre.museumPath,
      });
      if (genreSlugs.has(canonicalSlug)) score += 2;
    }
    if (d?.series?.slug && d.series.slug === details?.series?.slug) score += 5;
    if (g.recommendedPrice != null) score += 1;
    return { g, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        (b.g.recommendedPrice ?? 0) - (a.g.recommendedPrice ?? 0),
    )
    .slice(0, limit)
    .map((s) => s.g);
}

export type GameFaqItem = { question: string; answer: string };

function clipMeta(text: string, max: number): string {
  const clean = text.trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}

export function buildGameFaq(
  game: CatalogGame,
  platform: Platform | undefined,
  details: GameDetails | undefined,
): GameFaqItem[] {
  const platformName = platform?.shortName ?? game.platformSlug;
  const regionLabel = getRegionDisplay(game.region).label;
  const hasPrice = game.hasEsPrice && game.recommendedPrice != null;
  const hasRange = hasVerifiedEsPriceRange(game);
  const min = hasRange ? game.marketMin : null;
  const max = hasRange ? game.marketMax : null;
  const est = game.recommendedPrice;

  const priceAnswer = hasPrice
    ? hasRange && min != null && max != null
      ? `En ${SITE_LOGO} el mercado verificado en ${regionLabel} oscila entre ${formatEur(min)} y ${formatEur(max)}, con una referencia media de ${formatEur(est)}. El precio final depende del estado de conservación (suelto, completo, precintado o gradado).`
      : hasVerifiedEsPrice(game)
        ? `La referencia verificada en España ronda ${formatEur(est)} para la edición ${regionLabel}.`
        : `Tenemos una estimación orientativa de ${formatEur(est)} para ${regionLabel}, pendiente de verificar región en anuncios P2P. El rango min–máx aparecerá cuando haya suficientes ventas confirmadas.`
    : `Aún no tenemos suficientes ventas verificadas en el mercado español para este título. Consulta de nuevo pronto o revisa anuncios entre usuarios Pro.`;

  const faqs: GameFaqItem[] = [
    {
      question: `¿Cuánto vale ${game.title} en ${platformName}?`,
      answer: priceAnswer,
    },
    {
      question: `¿Por qué varía el precio de ${game.title}?`,
      answer:
        "El valor depende sobre todo del estado (caja, manual, disco/cartucho, precinto), de la región PAL y de la demanda entre coleccionistas en España. Una copia completa en buen estado suele valer varias veces más que una suelta con marcas de uso.",
    },
  ];

  if (hasRange && min != null && max != null) {
    faqs.push({
      question: `¿Dónde comprar ${game.title} en España?`,
      answer:
        "Revisa los anuncios verificados entre usuarios Pro en esta ficha. Cada anuncio incluye fotos obligatorias y una estimación IA dentro del rango de mercado PAL ES.",
    });
  }

  if (details?.year) {
    const dev = details.developer ? companyEntityLink(details.developer) : null;
    const pub = details.publisher ? companyEntityLink(details.publisher) : null;
    faqs.push({
      question: `¿Qué edición es ${game.title}?`,
      answer: `${game.title} salió en ${details.year} para ${platformName} (${regionLabel})${pub ? `, publicado por ${pub.name}` : ""}${dev ? ` y desarrollado por ${dev.name}` : ""}.`,
    });
  }

  const aiFaqs = details?.seoMeta?.faqs ?? [];
  const seen = new Set(faqs.map((f) => f.question.toLowerCase()));
  for (const faq of aiFaqs) {
    const question = faq.question?.trim();
    const answer = faq.answer?.trim();
    if (!question || !answer) continue;
    if (seen.has(question.toLowerCase())) continue;
    faqs.push({ question, answer });
    seen.add(question.toLowerCase());
  }

  return faqs;
}

export function buildGameMetadata(game: CatalogGame): Metadata {
  const platform = getPlatform(game.platformSlug);
  const regionLabel = getRegionDisplay(game.region).label;
  const platformName = platform?.shortName ?? game.platformSlug;
  const path = catalogGamePath(game);
  const url = `${getSiteUrl()}${path}`;
  const details = getGameDetails(game.id);
  const seo = details?.seoMeta;
  const catalogDescription = details?.description?.trim();

  let description: string;
  if (seo?.seoDescription) {
    description = clipMeta(seo.seoDescription, 155);
  } else if (catalogDescription) {
    description = clipMeta(catalogDescription, 155);
  } else if (game.hasEsPrice && game.recommendedPrice != null) {
    const range = hasVerifiedEsPriceRange(game)
      ? ` entre ${formatEur(game.marketMin)} y ${formatEur(game.marketMax)}`
      : "";
    const verified = hasVerifiedEsPrice(game) ? "Referencia verificada" : "Referencia orientativa";
    description = `${verified} de ${game.title} (${platformName}, ${regionLabel}) en el mercado español${range}. Media ${formatEur(game.recommendedPrice)}. Catálogo ${SITE_LOGO}.`;
  } else {
    description = `${game.title} para ${platformName} (${regionLabel}). Ficha del catálogo ${SITE_LOGO}: metadatos, región y precio de mercado en España cuando haya datos verificados.`;
  }

  const title =
    seo?.seoTitle?.trim() ||
    `${game.title} — Precio ${platformName} ${regionLabel}`;

  const coverAlt =
    seo?.coverAlt?.trim() ||
    `Portada de ${game.title} para ${platformName} (${regionLabel})`;

  const resolvedCover = getCoverSrc(game.coverUrl, game.id);
  const ogImage = resolvedCover
    ? {
        url: resolvedCover.startsWith("/") ? `${getSiteUrl()}${resolvedCover}` : resolvedCover,
        alt: coverAlt,
      }
    : undefined;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: "website",
      locale: "es_ES",
      siteName: SITE_LOGO,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
    robots: game.hasEsPrice ? { index: true, follow: true } : { index: false, follow: true },
  };
}

export function buildPlatformMetadata(platform: Platform): Metadata {
  const url = `${getSiteUrl()}/plataforma/${platform.slug}`;
  const title = `${platform.name} — Catálogo y precios`;
  const description = `${platform.description} Consulta precios orientados al mercado español y explora ${platform.estimatedCatalogSize.toLocaleString("es-ES")}+ referencias en ${SITE_LOGO}.`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "website", locale: "es_ES", siteName: SITE_LOGO },
  };
}

export function buildGameJsonLd(
  game: CatalogGame,
  platform: Platform | undefined,
  details?: GameDetails | undefined,
): Record<string, unknown> {
  const url = `${getSiteUrl()}${catalogGamePath(game)}`;
  const regionLabel = getRegionDisplay(game.region).label;
  const resolvedDetails = details ?? getGameDetails(game.id);
  const seo = resolvedDetails?.seoMeta;
  const entityLinks = resolvedDetails ? resolveGameEntityLinks(resolvedDetails) : null;

  const description =
    seo?.jsonLdDescription?.trim() ||
    resolvedDetails?.description?.trim() ||
    `${game.title} para ${platform?.name ?? game.platformSlug} (${regionLabel}). Videojuego en catálogo ${SITE_LOGO}.`;

  const coverAlt =
    seo?.coverAlt?.trim() ||
    `Portada de ${game.title} para ${platform?.shortName ?? game.platformSlug} (${regionLabel})`;

  const resolvedCover = getCoverSrc(game.coverUrl, game.id);
  const coverImageUrl = resolvedCover
    ? resolvedCover.startsWith("/")
      ? `${getSiteUrl()}${resolvedCover}`
      : resolvedCover
    : null;

  const offer =
    game.hasEsPrice && game.recommendedPrice != null
      ? {
          "@type": "Offer",
          priceCurrency: "EUR",
          price: game.recommendedPrice,
          ...(hasVerifiedEsPriceRange(game)
            ? {
                priceSpecification: {
                  "@type": "PriceSpecification",
                  minPrice: game.marketMin,
                  maxPrice: game.marketMax,
                  priceCurrency: "EUR",
                },
              }
            : {}),
          availability: "https://schema.org/InStock",
          areaServed: { "@type": "Country", name: "España" },
          itemCondition: "https://schema.org/UsedCondition",
          url,
        }
      : undefined;

  return {
    "@context": "https://schema.org",
    "@type": "VideoGame",
    name: game.title,
    description: clipMeta(description, 320),
    url,
    gamePlatform: platform?.name ?? game.platformSlug,
    ...(resolvedDetails?.year ? { datePublished: String(resolvedDetails.year) } : {}),
    ...(entityLinks?.genres.length
      ? { genre: entityLinks.genres.map((g) => g.name) }
      : {}),
    ...(entityLinks?.developer
      ? {
          author: {
            "@type": "Organization",
            name: entityLinks.developer.name,
            url: `${getSiteUrl()}${entityLinks.developer.href}`,
          },
        }
      : {}),
    ...(entityLinks?.publisher
      ? {
          publisher: {
            "@type": "Organization",
            name: entityLinks.publisher.name,
            url: `${getSiteUrl()}${entityLinks.publisher.href}`,
          },
        }
      : {}),
    ...(coverImageUrl
      ? {
          image: {
            "@type": "ImageObject",
            url: coverImageUrl,
            name: coverAlt,
            caption: coverAlt,
          },
        }
      : {}),
    ...(offer ? { offers: offer } : {}),
  };
}

export function buildFaqJsonLd(faqs: GameFaqItem[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };
}

export function buildBreadcrumbJsonLd(
  items: { name: string; href: string }[],
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: `${getSiteUrl()}${item.href}`,
    })),
  };
}
