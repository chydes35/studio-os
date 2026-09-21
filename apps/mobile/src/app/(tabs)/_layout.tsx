import { router, Tabs } from "expo-router";
import { Pressable, Text } from "react-native";

import { clearToken } from "@/lib/auth";

async function handleLogout() {
  await clearToken();
  router.replace("/login");
}

function LogoutButton() {
  return (
    <Pressable onPress={handleLogout} hitSlop={8} style={{ marginRight: 16 }}>
      <Text style={{ fontSize: 14, color: "#3c87f7" }}>Log out</Text>
    </Pressable>
  );
}

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerRight: () => <LogoutButton /> }}>
      <Tabs.Screen
        name="index"
        options={{
          title: "Bookings",
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>📅</Text>,
        }}
      />
      <Tabs.Screen
        name="clients"
        options={{
          title: "Clients",
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>👤</Text>,
        }}
      />
    </Tabs>
  );
}
