import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { useColorScheme } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { api } from "@/lib/api";
import { clearToken, getToken } from "@/lib/auth";

/** Redirects to /login when there's no valid token — this app has no public/client-facing screens, unlike the web dashboard, so the whole thing is gated. */
function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const segments = useSegments();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await getToken();
      if (!token) {
        if (!cancelled) router.replace("/login");
        if (!cancelled) setChecking(false);
        return;
      }
      try {
        await api.getMe();
        if (!cancelled) setChecking(false);
      } catch {
        await clearToken();
        if (!cancelled) {
          router.replace("/login");
          setChecking(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // Re-check whenever the top-level route changes (e.g. right after logout).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segments[0]]);

  if (checking) {
    return (
      <ThemedView style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ThemedText type="small" themeColor="textSecondary">
          Loading…
        </ThemedText>
      </ThemedView>
    );
  }

  return <>{children}</>;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <AuthGate>
        <Stack>
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="booking/[id]" options={{ title: "Booking" }} />
        </Stack>
      </AuthGate>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
