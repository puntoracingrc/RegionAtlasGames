"use client";

import { useId, useRef, useState } from "react";
import { Check, Copy, Mail, MessageCircle, Share2, X } from "lucide-react";

export function ShareGameButton({ title, url }: { title: string; url: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [nativeShare, setNativeShare] = useState(false);
  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);
  const message = encodeURIComponent(`${title}\n${url}`);
  const links = [
    { label: "WhatsApp", href: `https://wa.me/?text=${message}` },
    { label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}` },
    { label: "X", href: `https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}` },
    { label: "Telegram", href: `https://t.me/share/url?url=${encodedUrl}&text=${encodedTitle}` },
    { label: "Reddit", href: `https://www.reddit.com/submit?url=${encodedUrl}&title=${encodedTitle}` },
    { label: "Correo electrónico", href: `mailto:?subject=${encodedTitle}&body=${message}` },
  ];

  function open() {
    setCopied(false); setCopyError(false);
    setNativeShare(typeof navigator.share === "function");
    dialog.current?.showModal();
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true); setCopyError(false);
    } catch {
      input.current?.focus(); input.current?.select();
      setCopied(false); setCopyError(true);
    }
  }

  async function share() {
    try { await navigator.share({ title, url }); }
    catch (error) { if (!(error instanceof DOMException && error.name === "AbortError")) await copy(); }
  }

  return <>
    <button type="button" onClick={open} className="btn-secondary inline-flex min-h-11 items-center justify-center gap-2" aria-haspopup="dialog"><Share2 aria-hidden className="h-4 w-4 shrink-0" />Compartir</button>
    <dialog ref={dialog} aria-labelledby={titleId} className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-3xl border border-border bg-white p-0 text-foreground shadow-2xl backdrop:bg-black/55 [.dark_&]:bg-slate-900" onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <div className="p-5 sm:p-7">
        <div className="mb-5 flex items-center justify-between gap-4"><h2 id={titleId} className="text-xl font-bold sm:text-2xl">Compartir juego</h2><button type="button" onClick={() => dialog.current?.close()} aria-label="Cerrar compartir" className="rounded-full p-2 text-muted transition hover:bg-card-hover hover:text-foreground"><X aria-hidden className="h-6 w-6" /></button></div>
        <p className="mb-4 text-sm text-muted">{title}</p>
        <div className="flex min-w-0 items-center overflow-hidden rounded-full border border-border bg-background">
          <input ref={input} type="text" readOnly value={url} aria-label="Enlace del juego" onClick={(event) => event.currentTarget.select()} className="min-w-0 flex-1 bg-transparent px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-inset focus:ring-accent" />
          <button type="button" onClick={copy} aria-label="Copiar enlace" className="shrink-0 border-l border-border px-4 py-3 text-accent transition hover:bg-card-hover">{copied ? <Check aria-hidden className="h-5 w-5" /> : <Copy aria-hidden className="h-5 w-5" />}</button>
        </div>
        <p role="status" className="mt-2 min-h-5 text-xs text-muted">{copied ? "Enlace copiado." : copyError ? "Selecciona el enlace y cópialo para compartirlo." : ""}</p>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:gap-3">
          {links.map((link) => <a key={link.label} href={link.href} target={link.href.startsWith("mailto:") ? undefined : "_blank"} rel="noopener noreferrer" className="flex min-h-12 min-w-0 items-center gap-2 rounded-full border border-border bg-background px-3 py-3 text-sm font-medium transition hover:bg-card-hover sm:px-4">{link.label === "Correo electrónico" ? <Mail aria-hidden className="h-4 w-4 shrink-0" /> : <MessageCircle aria-hidden className="h-4 w-4 shrink-0" />}<span>{link.label}</span></a>)}
        </div>
        {nativeShare && <button type="button" onClick={share} className="btn-secondary mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2"><Share2 aria-hidden className="h-4 w-4" />Más opciones para compartir</button>}
      </div>
    </dialog>
  </>;
}
