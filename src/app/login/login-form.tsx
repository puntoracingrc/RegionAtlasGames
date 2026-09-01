"use client";

import { useSearchParams } from "next/navigation";
import { SiteNav } from "@/components/site-nav";
import {
  GoogleSignInButton,
  googleAuthErrorMessage,
} from "@/components/google-sign-in-button";
import { Panel, PanelTitle } from "@/components/ui";

export function LoginForm() {
  const searchParams = useSearchParams();
  const nextPath = safeNextPath(searchParams.get("next")) ?? "/coleccion";
  const error = googleAuthErrorMessage(searchParams.get("google"));

  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-md px-4 py-10 md:px-6">
        <Panel>
          <PanelTitle>Acceder a Region Atlas</PanelTitle>
          <p className="mb-5 text-sm text-muted">
            Entra o crea tu cuenta con Google para guardar tu colección y usar el mercado.
          </p>

          <GoogleSignInButton next={nextPath} />
          {error && <p className="mt-4 text-sm text-rose-500">{error}</p>}
        </Panel>
      </main>
    </>
  );
}

function safeNextPath(next: string | null): string | null {
  if (!next) return null;
  if (!next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}
