import { useCallback, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";

import { StageBadge } from "@/components/stage-badge";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { api, type Booking } from "@/lib/api";

function formatScheduledAt(iso: string | null): string {
  if (!iso) return "No date set";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function BookingsScreen() {
  const router = useRouter();
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => {
    setError(null);
    return api
      .listBookings()
      .then((list) => {
        const sorted = [...list].sort((a, b) => {
          if (!a.scheduledAt) return 1;
          if (!b.scheduledAt) return -1;
          return new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime();
        });
        setBookings(sorted);
      })
      .catch((err) => setError(String(err)));
  }, []);

  // Re-fetch whenever this tab regains focus (e.g. coming back from a
  // booking whose stage was just changed), not just on first mount. The
  // callback must not return the Promise `load()` produces — useFocusEffect
  // treats a returned function as cleanup and warns on anything else.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  if (error) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText type="small" themeColor="textSecondary">
          {error}
        </ThemedText>
      </ThemedView>
    );
  }

  if (!bookings) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText type="small" themeColor="textSecondary">
          Loading…
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <FlatList
        data={bookings}
        keyExtractor={(b) => b.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        contentContainerStyle={bookings.length === 0 ? styles.center : undefined}
        ListEmptyComponent={
          <ThemedText type="small" themeColor="textSecondary">
            No bookings yet.
          </ThemedText>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/booking/${item.id}`)}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          >
            <View style={styles.rowMain}>
              <ThemedText type="smallBold" style={styles.clientName}>
                {item.client.name}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {item.shootType} · {formatScheduledAt(item.scheduledAt)}
              </ThemedText>
            </View>
            <StageBadge stage={item.stage} />
          </Pressable>
        )}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#d1d5db",
    gap: 12,
  },
  rowPressed: { opacity: 0.6 },
  rowMain: { flex: 1, gap: 2 },
  clientName: { fontSize: 16 },
});
