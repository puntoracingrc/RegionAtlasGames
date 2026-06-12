"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";

/** Aplica el tema guardado en la cuenta al iniciar sesión. */
export function UserThemeSync() {
  const { setTheme } = useTheme();

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (data.user?.theme) {
          setTheme(data.user.theme);
        }
      })
      .catch(() => {});
  }, [setTheme]);

  return null;
}
