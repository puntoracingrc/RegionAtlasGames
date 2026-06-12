import type { SessionOptions } from "iron-session";
import type { UserPlan } from "./marketplace-types";

export type ThemePreference = "light" | "dark" | "system";

export interface SessionData {
  userId?: string;
  email?: string;
  name?: string;
  isLoggedIn: boolean;
}

export const defaultSession: SessionData = {
  isLoggedIn: false,
};

export const sessionOptions: SessionOptions = {
  password:
    process.env.SESSION_SECRET ??
    "dev-only-secret-min-32-chars-long!!",
  cookieName: "pal-es-session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
  },
};

export type PublicUser = {
  id: string;
  email: string;
  name: string;
  theme: ThemePreference;
  plan: UserPlan;
  createdAt: string;
};
