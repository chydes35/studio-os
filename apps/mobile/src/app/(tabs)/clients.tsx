import { useCallback, useState } from "react";
import { FlatList, Linking, Platform, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { useFocusEffect } from "expo-router";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { api, type Client } from "@/lib/api";

export default function ClientsScreen() {
  const [clients, setClients] = useState<Client[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => {
    setError(null);
    return api
      .listClients()
      .then((list) => setClients([...list].sort((a, b) => a.name.localeCompare(b.name))))
      .catch((err) => setError(String(err)));
  }, []);

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

  if (!clients) {
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
        data={clients}
        keyExtractor={(c) => c.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        contentContainerStyle={clients.length === 0 ? styles.center : undefined}
        ListEmptyComponent={
          <ThemedText type="small" themeColor="textSecondary">
            No clients yet.
          </ThemedText>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.rowMain}>
              <ThemedText type="smallBold">{item.name}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {item.email}
              </ThemedText>
            </View>
            <View style={styles.actions}>
              {item.phone && Platform.OS !== "web" && (
                <Pressable
                  onPress={() => Linking.openURL(`tel:${item.phone}`)}
                  style={styles.actionButton}
                >
                  <ThemedText type="link" themeColor="text">
                    📞
                  </ThemedText>
                </Pressable>
              )}
              <Pressable
                onPress={() => Linking.openURL(`mailto:${item.email}`)}
                style={styles.actionButton}
              >
                <ThemedText type="link" themeColor="text">
                  ✉️
                </ThemedText>
              </Pressable>
            </View>
          </View>
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
  rowMain: { flex: 1, gap: 2 },
  actions: { flexDirection: "row", gap: 16 },
  actionButton: { padding: 4 },
});
