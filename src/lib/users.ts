import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
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

export async function readUsers(): Promise<StoredUser[]> {
  return loadUsers();
}

export function toPublicUser(user: StoredUser): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    theme: user.theme,
    plan: user.plan ?? "free",
    createdAt: user.createdAt,
  };
}

export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
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
}): Promise<{ user: PublicUser } | { error: string }> {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const password = input.password;

  if (!name || name.length < 2) return { error: "Nombre demasiado corto." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Email no válido." };
  if (password.length < 8) return { error: "La contraseña debe tener al menos 8 caracteres." };

  const users = await readUsers();
  if (users.some((u) => u.email === email)) {
    return { error: "Ya existe una cuenta con ese email." };
  }

  const user: StoredUser = {
    id: randomUUID(),
    name,
    email,
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
