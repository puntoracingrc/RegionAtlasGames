import { cookies, headers } from "next/headers";
import bcrypt from "bcryptjs";
import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import {
  defaultSession,
  sessionOptions,
  type PublicUser,
  type SessionData,
  type ThemePreference,
} from "./session";
import type { UserPlan } from "./marketplace-types";
import { loadUsers, saveUsers, type StoredUserRecord } from "./users-store";

type StoredUser = StoredUserRecord;
type MutableSession = SessionData & {
  save: () => Promise<void>;
  destroy: () => void;
};

export async function readUsers(): Promise<StoredUser[]> {
  return loadUsers();
}

export function toPublicUser(user: StoredUser): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    city: user.city?.trim() || null,
    theme: user.theme,
    plan: user.plan ?? "free",
    createdAt: user.createdAt,
  };
}

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET?.trim();
  return secret && secret !== "\"\"" ? secret : "dev-only-secret-min-32-chars-long!!";
}

function signSession(payload: string): string {
  return createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

function encodeSession(data: SessionData): string {
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  return `${payload}.${signSession(payload)}`;
}

function decodeSession(value: string | undefined): SessionData | null {
  if (!value || !value.includes(".")) return null;
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;
  const expected = signSession(payload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return null;
  if (!timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf-8")) as SessionData;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<MutableSession> {
  const cookieStore = await cookies();
  const requestHeaders = await headers();
  const host = requestHeaders.get("host")?.split(":")[0].toLowerCase() ?? "";
  const cookieDomain =
    host === "regionatlas.games" || host === "www.regionatlas.games"
      ? ".regionatlas.games"
      : undefined;
  const stored = decodeSession(cookieStore.get(sessionOptions.cookieName)?.value);
  const session: MutableSession = {
    ...defaultSession,
    ...stored,
    async save() {
      const { save: _save, destroy: _destroy, ...data } = session;
      cookieStore.set(sessionOptions.cookieName, encodeSession(data), {
        ...sessionOptions.cookieOptions,
        path: "/",
        ...(cookieDomain ? { domain: cookieDomain } : {}),
      });
    },
    destroy() {
      cookieStore.set(sessionOptions.cookieName, "", {
        ...sessionOptions.cookieOptions,
        path: "/",
        maxAge: 0,
        ...(cookieDomain ? { domain: cookieDomain } : {}),
      });
    },
  };
  return session;
}

export async function getCurrentUser(): Promise<PublicUser | null> {
  const session = await getSession();
  if (!session.isLoggedIn || !session.userId) return null;
  const users = await readUsers();
  const user = users.find((u) => u.id === session.userId);
  return user ? toPublicUser(user) : null;
}

export async function registerUser(input: {
  name: string;
  email: string;
  password: string;
  city?: string;
}): Promise<{ user: PublicUser } | { error: string }> {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const password = input.password;
  const city = input.city?.trim() ?? "";

  if (!name || name.length < 2) return { error: "Nombre demasiado corto." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Email no válido." };
  if (password.length < 8) return { error: "La contraseña debe tener al menos 8 caracteres." };
  if (city && city.length < 2) return { error: "Ciudad demasiado corta." };

  const users = await readUsers();
  if (users.some((u) => u.email === email)) {
    return { error: "Ya existe una cuenta con ese email." };
  }

  const user: StoredUser = {
    id: randomUUID(),
    name,
    email,
    city: city || null,
    passwordHash: await bcrypt.hash(password, 10),
    theme: "system",
    plan: "free",
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  const saved = await saveUsers(users);
  if ("error" in saved) return saved;
  return { user: toPublicUser(user) };
}

export async function updateUserProfile(
  userId: string,
  input: { city?: string | null },
): Promise<PublicUser | { error: string }> {
  const users = await readUsers();
  const idx = users.findIndex((u) => u.id === userId);
  if (idx === -1) return { error: "Usuario no encontrado." };

  if (input.city !== undefined) {
    const city = input.city?.trim() ?? "";
    if (city && city.length < 2) return { error: "Ciudad demasiado corta." };
    users[idx].city = city || null;
  }

  const saved = await saveUsers(users);
  if ("error" in saved) return saved;
  return toPublicUser(users[idx]);
}

export async function loginUser(
  email: string,
  password: string,
): Promise<{ user: PublicUser } | { error: string }> {
  const normalized = email.trim().toLowerCase();
  const users = await readUsers();
  const user = users.find((u) => u.email === normalized);
  if (!user) return { error: "Email o contraseña incorrectos." };
  if (!user.passwordHash) {
    return { error: "Esta cuenta usa Google. Pulsa «Continuar con Google»." };
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return { error: "Email o contraseña incorrectos." };

  const session = await getSession();
  session.userId = user.id;
  session.email = user.email;
  session.name = user.name;
  session.isLoggedIn = true;
  await session.save();

  return { user: toPublicUser(user) };
}

export async function loginOrRegisterWithGoogle(profile: {
  googleId: string;
  email: string;
  name: string;
}): Promise<{ user: PublicUser } | { error: string }> {
  const email = profile.email.trim().toLowerCase();
  const name = profile.name.trim() || email.split("@")[0] || "Usuario";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Google no devolvió un email válido." };
  }

  const users = await readUsers();
  let user = users.find((u) => u.googleId === profile.googleId);
  let needsSave = false;

  if (!user) {
    user = users.find((u) => u.email === email);
    if (user) {
      user.googleId = profile.googleId;
      if (name.length >= 2 && user.name.length < 2) user.name = name;
      needsSave = true;
    } else {
      user = {
        id: randomUUID(),
        email,
        name: name.length >= 2 ? name : "Usuario",
        googleId: profile.googleId,
        theme: "system",
        plan: "free",
        createdAt: new Date().toISOString(),
      };
      users.push(user);
      needsSave = true;
    }
  }

  if (needsSave) {
    const saved = await saveUsers(users);
    if ("error" in saved) return saved;
  }

  const session = await getSession();
  session.userId = user.id;
  session.email = user.email;
  session.name = user.name;
  session.isLoggedIn = true;
  await session.save();

  return { user: toPublicUser(user) };
}

export async function loginUserByEmail(
  email: string,
): Promise<{ user: PublicUser } | { error: string }> {
  const normalized = email.trim().toLowerCase();
  const users = await readUsers();
  const user = users.find((u) => u.email === normalized);
  if (!user) return { error: "Cuenta no encontrada." };

  const session = await getSession();
  session.userId = user.id;
  session.email = user.email;
  session.name = user.name;
  session.isLoggedIn = true;
  await session.save();

  return { user: toPublicUser(user) };
}

export async function logoutUser() {
  const session = await getSession();
  session.destroy();
}

export async function setUserPlan(userId: string, plan: UserPlan): Promise<PublicUser | null> {
  const users = await readUsers();
  const idx = users.findIndex((u) => u.id === userId);
  if (idx === -1) return null;
  users[idx].plan = plan;
  const saved = await saveUsers(users);
  if ("error" in saved) return null;
  return toPublicUser(users[idx]);
}

export async function getUserById(userId: string): Promise<PublicUser | null> {
  const users = await readUsers();
  const user = users.find((u) => u.id === userId);
  return user ? toPublicUser(user) : null;
}

export async function updateUserTheme(
  userId: string,
  theme: ThemePreference,
): Promise<PublicUser | null> {
  const users = await readUsers();
  const idx = users.findIndex((u) => u.id === userId);
  if (idx === -1) return null;
  users[idx].theme = theme;
  const saved = await saveUsers(users);
  if ("error" in saved) return null;
  return toPublicUser(users[idx]);
}
