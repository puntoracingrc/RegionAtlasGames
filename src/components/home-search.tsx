"use client";

import { Search } from "lucide-react";
import { useState } from "react";

export function HomeSearch() {
  const [destination, setDestination] = useState("/catalogo");

  return (
    <section aria-label="Buscar juegos" className="mb-7 space-y-3">
      <fieldset className="inline-flex gap-1 rounded-lg border border-border bg-card p-1">
        <legend className="sr-only">Dónde buscar</legend>
        {[{ value: "/catalogo", label: "Catálogo" }, { value: "/vitrina", label: "Vitrina" }].map((option) => (
          <label key={option.value} className="cursor-pointer">
            <input type="radio" name="search-destination" value={option.value} checked={destination === option.value} onChange={() => setDestination(option.value)} className="peer sr-only" />
            <span className="block min-w-24 rounded px-4 py-2 text-center text-sm font-semibold text-muted peer-checked:bg-accent peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent">
              {option.label}
            </span>
          </label>
        ))}
      </fieldset>
      <form action={destination} method="get" role="search" aria-label={destination === "/vitrina" ? "Buscar en Vitrina" : "Buscar en Catálogo"} className="flex gap-2">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Nombre del juego</span>
          <input type="search" name="q" maxLength={120} placeholder="Buscar juegos..." className="min-h-12 w-full rounded-lg border border-border bg-input px-4 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/25" />
        </label>
        <button type="submit" aria-label={destination === "/vitrina" ? "Buscar en Vitrina" : "Buscar en Catálogo"} title="Buscar" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-accent text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          <Search className="h-5 w-5" aria-hidden="true" />
        </button>
      </form>
    </section>
  );
}
