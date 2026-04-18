import { Stack } from "expo-router";

export default function PostConcernLayout() {
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
          title: "Post concern",
        }}
      />
      <Stack.Screen
        name="my-concerns/index"
        options={{
          title: "My concerns",
        }}
      />
      <Stack.Screen
        name="my-concerns/[concernId]"
        options={{
          title: "내 고민",
        }}
      />
      <Stack.Screen
        name="my-concerns/responses/[responseId]"
        options={{
          title: "답변 상세",
        }}
      />
    </Stack>
  );
}
