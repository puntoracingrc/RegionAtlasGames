import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { readFileSync, writeFileSync } from "fs";
import path from "path";
import {
  defaultSession,
  sessionOptions,
  type PublicUser,
  type SessionData,
  type ThemePreference,
} from "./session";
import type { UserPlan } from "./marketplace-types";

const USERS_FILE = path.join(process.cwd(), "data", "users.json");

type StoredUser = PublicUser & {
  passwordHash: string;
};

export function readUsers(): StoredUser[] {
  try {
    return JSON.parse(readFileSync(USERS_FILE, "utf-8")) as StoredUser[];
  } catch {
    return [];
  }
}

function writeUsers(users: StoredUser[]) {
  writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf-8");
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
  const user = readUsers().find((u) => u.id === session.userId);
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

  const users = readUsers();
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
  writeUsers(users);
  return { user: toPublicUser(user) };
}

export async function loginUser(
  email: string,
  password: string,
): Promise<{ user: PublicUser } | { error: string }> {
  const normalized = email.trim().toLowerCase();
  const user = readUsers().find((u) => u.email === normalized);
  if (!user) return { error: "Email o contraseña incorrectos." };

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

export async function loginUserByEmail(
  email: string,
): Promise<{ user: PublicUser } | { error: string }> {
  const normalized = email.trim().toLowerCase();
  const user = readUsers().find((u) => u.email === normalized);
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
  const users = readUsers();
  const idx = users.findIndex((u) => u.id === userId);
  if (idx === -1) return null;
  users[idx].plan = plan;
  writeUsers(users);
  return toPublicUser(users[idx]);
}

export function getUserById(userId: string): PublicUser | null {
  const user = readUsers().find((u) => u.id === userId);
  return user ? toPublicUser(user) : null;
}

export async function updateUserTheme(
  userId: string,
  theme: ThemePreference,
): Promise<PublicUser | null> {
  const users = readUsers();
  const idx = users.findIndex((u) => u.id === userId);
  if (idx === -1) return null;
  users[idx].theme = theme;
  writeUsers(users);
  return toPublicUser(users[idx]);
}
