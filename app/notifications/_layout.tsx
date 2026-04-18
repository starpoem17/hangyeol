import { Stack } from "expo-router";

export default function NotificationsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: {
          backgroundColor: "#f8fafc",
        },
        headerShadowVisible: false,
        headerTintColor: "#0f172a",
        headerTitleStyle: {
          color: "#0f172a",
          fontWeight: "700",
        },
        contentStyle: {
          backgroundColor: "#f8fafc",
        },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: "Notifications",
        }}
      />
    </Stack>
  );
}
