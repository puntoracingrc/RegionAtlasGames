import type { SessionOptions } from "iron-session";
import type { UserPlan } from "./marketplace-types";
import type { CollectionDefaultConditions } from "./collection-condition-policy";
import { DEV_SESSION_SECRET } from "./server-env";

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
    DEV_SESSION_SECRET,
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
  city: string | null;
  theme: ThemePreference;
  plan: UserPlan;
  collectionDefaultConditions: CollectionDefaultConditions;
  createdAt: string;
};
