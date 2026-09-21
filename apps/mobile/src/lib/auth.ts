import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import type { AuthUser } from "@repo/shared";

const TOKEN_KEY = "studio_os_token";
const USER_KEY = "studio_os_user";

// expo-secure-store's web implementation isn't functional on this SDK
// (throws "getValueWithKeyAsync is not a function" — confirmed live in the
// browser tool), so web falls back to localStorage, same trust level the
// web app itself already uses. Native keeps the real Keychain/Keystore-
// backed SecureStore, which is what actually matters for a real device.
async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(key);
  }
  return SecureStore.getItemAsync(key);
}

async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    window.localStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function deleteItem(key: string): Promise<void> {
  if (Platform.OS === "web") {
    window.localStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export async function getToken(): Promise<string | null> {
  return getItem(TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
  await setItem(TOKEN_KEY, token);
}

/** Cached alongside the token so screens can show the logged-in user without an extra /auth/me round-trip. */
export async function getCachedUser(): Promise<AuthUser | null> {
  const raw = await getItem(USER_KEY);
  return raw ? (JSON.parse(raw) as AuthUser) : null;
}

export async function setCachedUser(user: AuthUser): Promise<void> {
  await setItem(USER_KEY, JSON.stringify(user));
}

export async function clearToken(): Promise<void> {
  await deleteItem(TOKEN_KEY);
  await deleteItem(USER_KEY);
}
