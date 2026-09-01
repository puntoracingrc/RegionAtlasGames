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
import {
  sanitizeCollectionDefaultConditions,
  type CollectionDefaultConditions,
} from "./collection-condition-policy";
import { getSessionSecret } from "./server-env";
import { loadUsers, mutateUsers, type StoredUserRecord } from "./users-store";

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
    collectionDefaultConditions: sanitizeCollectionDefaultConditions(
      user.collectionDefaultConditions,
    ),
    createdAt: user.createdAt,
  };
}

function signSession(payload: string): string {
  return createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");
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
  if (name.length > 80) return { error: "El nombre es demasiado largo." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Email no válido." };
  if (email.length > 254) return { error: "Email no válido." };
  if (password.length < 10) return { error: "La contraseña debe tener al menos 10 caracteres." };
  if (Buffer.byteLength(password, "utf8") > 72) {
    return { error: "La contraseña no puede superar 72 bytes." };
  }
  if (city && city.length < 2) return { error: "Ciudad demasiado corta." };
  if (city.length > 100) return { error: "La ciudad es demasiado larga." };

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
  try {
    return await mutateUsers<{ user: PublicUser } | { error: string }>((users) => {
      if (users.some((stored) => stored.email === email)) {
        return {
          next: users,
          result: { error: "Ya existe una cuenta con ese email." } as const,
          changed: false,
        };
      }
      users.push(user);
      return { next: users, result: { user: toPublicUser(user) } };
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo crear la cuenta." };
  }
}

export async function updateUserProfile(
  userId: string,
  input: { city?: string | null },
): Promise<PublicUser | { error: string }> {
  const city = input.city?.trim() ?? "";
  if (input.city !== undefined) {
    if (city && city.length < 2) return { error: "Ciudad demasiado corta." };
    if (city.length > 100) return { error: "La ciudad es demasiado larga." };
  }

  try {
    return await mutateUsers<PublicUser | { error: string }>((users) => {
      const idx = users.findIndex((user) => user.id === userId);
      if (idx === -1) {
        return {
          next: users,
          result: { error: "Usuario no encontrado." } as const,
          changed: false,
        };
      }
      if (input.city !== undefined) users[idx].city = city || null;
      return { next: users, result: toPublicUser(users[idx]) };
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo actualizar el perfil." };
  }
}

export async function loginUser(
  email: string,
  password: string,
): Promise<{ user: PublicUser } | { error: string }> {
  const normalized = email.trim().toLowerCase();
  if (normalized.length > 254 || Buffer.byteLength(password, "utf8") > 72) {
    return { error: "Email o contraseña incorrectos." };
  }
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
  const name = (profile.name.trim() || email.split("@")[0] || "Usuario").slice(0, 80);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Google no devolvió un email válido." };
  }

  let user: StoredUser;
  try {
    user = await mutateUsers((users) => {
      const byGoogle = users.find((stored) => stored.googleId === profile.googleId);
      if (byGoogle) {
        return { next: users, result: byGoogle, changed: false };
      }

      const byEmail = users.find((stored) => stored.email === email);
      if (byEmail) {
        byEmail.googleId = profile.googleId;
        if (name.length >= 2 && byEmail.name.length < 2) byEmail.name = name;
        return { next: users, result: byEmail };
      }

      const created: StoredUser = {
        id: randomUUID(),
        email,
        name: name.length >= 2 ? name : "Usuario",
        googleId: profile.googleId,
        theme: "system",
        plan: "free",
        createdAt: new Date().toISOString(),
      };
      users.push(created);
      return { next: users, result: created };
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo completar el acceso." };
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
  try {
    return await mutateUsers((users) => {
      const idx = users.findIndex((user) => user.id === userId);
      if (idx === -1) return { next: users, result: null, changed: false };
      users[idx].plan = plan;
      return { next: users, result: toPublicUser(users[idx]) };
    });
  } catch {
    return null;
  }
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
  try {
    return await mutateUsers((users) => {
      const idx = users.findIndex((user) => user.id === userId);
      if (idx === -1) return { next: users, result: null, changed: false };
      users[idx].theme = theme;
      return { next: users, result: toPublicUser(users[idx]) };
    });
  } catch {
    return null;
  }
}

export async function updateUserCollectionDefaultConditions(
  userId: string,
  collectionDefaultConditions: CollectionDefaultConditions,
): Promise<PublicUser | null> {
  try {
    return await mutateUsers((users) => {
      const idx = users.findIndex((user) => user.id === userId);
      if (idx === -1) return { next: users, result: null, changed: false };
      users[idx].collectionDefaultConditions = { ...collectionDefaultConditions };
      return { next: users, result: toPublicUser(users[idx]) };
    });
  } catch {
    return null;
  }
}
