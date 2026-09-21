import type { BookingStage } from "@repo/shared";
import { useCallback, useEffect, useState } from "react";
import { Linking, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useLocalSearchParams } from "expo-router";

import { StageBadge } from "@/components/stage-badge";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { api, type Booking, type BookingEquipment } from "@/lib/api";

const STAGES: BookingStage[] = ["INQUIRY", "BOOKED", "SHOT", "EDITING", "DELIVERED", "CLOSED"];

function formatScheduledAt(iso: string | null): string {
  if (!iso) return "No date set";
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** No native map SDK / API key needed — this just deep-links to whatever maps app the OS already has. */
function openInMaps(latitude: number, longitude: number, label: string) {
  const encodedLabel = encodeURIComponent(label);
  if (Platform.OS === "ios") {
    Linking.openURL(`https://maps.apple.com/?ll=${latitude},${longitude}&q=${encodedLabel}`);
  } else if (Platform.OS === "android") {
    Linking.openURL(`geo:${latitude},${longitude}?q=${latitude},${longitude}(${encodedLabel})`);
  } else {
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`);
  }
}

export default function BookingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const [booking, setBooking] = useState<Booking | null>(null);
  const [equipment, setEquipment] = useState<BookingEquipment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [updatingStage, setUpdatingStage] = useState(false);

  const load = useCallback(() => {
    setError(null);
    return Promise.all([api.getBooking(id), api.listBookingEquipment(id)])
      .then(([b, e]) => {
        setBooking(b);
        setEquipment(e);
      })
      .catch((err) => setError(String(err)));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleStagePress(stage: BookingStage) {
    if (!booking || stage === booking.stage) return;
    setUpdatingStage(true);
    setError(null);
    try {
      setBooking(await api.updateBookingStage(booking.id, stage));
    } catch (err) {
      setError(String(err));
    } finally {
      setUpdatingStage(false);
    }
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

  if (!booking) {
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
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <ThemedText type="subtitle" style={styles.clientName}>
            {booking.client.name}
          </ThemedText>
          <Pressable onPress={() => Linking.openURL(`mailto:${booking.client.email}`)}>
            <ThemedText type="linkPrimary">
              {booking.client.email}
            </ThemedText>
          </Pressable>
          {booking.client.phone && Platform.OS !== "web" && (
            <Pressable onPress={() => Linking.openURL(`tel:${booking.client.phone}`)}>
              <ThemedText type="linkPrimary">
                {booking.client.phone}
              </ThemedText>
            </Pressable>
          )}
        </View>

        <View style={styles.section}>
          <ThemedText type="smallBold">{booking.shootType}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {formatScheduledAt(booking.scheduledAt)}
            {booking.durationMins ? ` · ${booking.durationMins} min` : ""}
          </ThemedText>
          {booking.notes && (
            <ThemedText type="small" themeColor="textSecondary" style={styles.notes}>
              {booking.notes}
            </ThemedText>
          )}
        </View>

        <View style={styles.section}>
          <ThemedText type="small" themeColor="textSecondary">
            Stage
          </ThemedText>
          <View style={styles.stageRow}>
            {STAGES.map((stage) => (
              <Pressable
                key={stage}
                onPress={() => handleStagePress(stage)}
                disabled={updatingStage}
                style={[styles.stagePill, stage === booking.stage && styles.stagePillActive]}
              >
                <StageBadge stage={stage} />
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <ThemedText type="small" themeColor="textSecondary">
            Location
          </ThemedText>
          {booking.location ? (
            <>
              <ThemedText type="smallBold">{booking.location.name}</ThemedText>
              {booking.location.bestTimeOfDay && (
                <ThemedText type="small" themeColor="textSecondary">
                  Best time: {booking.location.bestTimeOfDay}
                </ThemedText>
              )}
              <Pressable
                onPress={() =>
                  openInMaps(
                    booking.location!.latitude,
                    booking.location!.longitude,
                    booking.location!.name,
                  )
                }
              >
                <ThemedText type="linkPrimary">
                  Open in Maps ↗
                </ThemedText>
              </Pressable>
            </>
          ) : (
            <ThemedText type="small" themeColor="textSecondary">
              No location set
            </ThemedText>
          )}
        </View>

        <View style={styles.section}>
          <ThemedText type="small" themeColor="textSecondary">
            Equipment
          </ThemedText>
          {equipment.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              No gear assigned
            </ThemedText>
          ) : (
            equipment.map((a) => (
              <ThemedText key={a.id} type="default">
                {a.equipment.name}
                {a.equipment.serialNumber ? ` · ${a.equipment.serialNumber}` : ""}
              </ThemedText>
            ))
          )}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  content: { padding: 16, gap: 20 },
  section: { gap: 4 },
  clientName: { fontSize: 24 },
  notes: { marginTop: 4 },
  stageRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  stagePill: { opacity: 0.5 },
  stagePillActive: { opacity: 1 },
});
