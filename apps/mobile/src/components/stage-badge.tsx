import type { BookingStage } from "@repo/shared";
import { StyleSheet, Text, View } from "react-native";

const STAGE_COLORS: Record<BookingStage, { bg: string; fg: string }> = {
  INQUIRY: { bg: "#e2e8f0", fg: "#475569" },
  BOOKED: { bg: "#dbeafe", fg: "#1d4ed8" },
  SHOT: { bg: "#ede9fe", fg: "#6d28d9" },
  EDITING: { bg: "#fef3c7", fg: "#b45309" },
  DELIVERED: { bg: "#dcfce7", fg: "#15803d" },
  CLOSED: { bg: "#e2e8f0", fg: "#334155" },
};

export function StageBadge({ stage }: { stage: BookingStage }) {
  const colors = STAGE_COLORS[stage];
  return (
    <View style={[styles.badge, { backgroundColor: colors.bg }]}>
      <Text style={[styles.text, { color: colors.fg }]}>{stage}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    alignSelf: "flex-start",
  },
  text: {
    fontSize: 11,
    fontWeight: "600",
  },
});
