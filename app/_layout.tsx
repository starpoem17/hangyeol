import * as Notifications from "expo-notifications";
import { Tabs, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { markNotificationRead } from "@/features/notifications/api";
import { getNotificationNavigationTarget, parseNotificationPushPayload } from "@/features/notifications/navigation";
import { usePushRegistration } from "@/features/notifications/push-registration";
import { SessionProvider, useSessionContext } from "@/features/session/context";
import { supabase } from "@/lib/supabase";

function RootEffects() {
  const router = useRouter();
  const { session } = useSessionContext();
  const lastHandledNotificationIdRef = useRef<string | null>(null);

  usePushRegistration(supabase, session);

  useEffect(() => {
    let isMounted = true;

    const handleNotificationResponse = async (response: Notifications.NotificationResponse | null) => {
      if (!response) {
        return;
      }

      const payload = parseNotificationPushPayload(response.notification.request.content.data);

      if (!payload || lastHandledNotificationIdRef.current === payload.notificationId) {
        return;
      }

      const target = getNotificationNavigationTarget(payload);

      if (!target) {
        return;
      }

      lastHandledNotificationIdRef.current = payload.notificationId;

      try {
        await markNotificationRead(supabase, payload.notificationId);
      } catch {
        // Read marking is best-effort. Navigation still proceeds.
      }

      router.push(target);
    };

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!isMounted) {
        return;
      }

      void handleNotificationResponse(response);
    });

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      void handleNotificationResponse(response);
    });

    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, [router]);

  return null;
}

function RootTabs() {
  const segments = useSegments();
  const currentPath = `/${segments.join("/")}`;
  const showTabBar =
    currentPath === "/inbox" ||
    currentPath === "/post-concern" ||
    currentPath === "/notifications" ||
    currentPath === "/profile";

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: showTabBar
          ? {
              backgroundColor: "#ffffff",
              borderTopColor: "#e2e8f0",
            }
          : {
              display: "none",
            },
        sceneStyle: {
          backgroundColor: "#f8fafc",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="onboarding"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          title: "Inbox",
        }}
      />
      <Tabs.Screen
        name="post-concern"
        options={{
          title: "Post concern",
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: "Notifications",
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
        }}
      />
    </Tabs>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <RootEffects />
        <StatusBar style="dark" />
        <RootTabs />
      </SessionProvider>
    </SafeAreaProvider>
  );
}
