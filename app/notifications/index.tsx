import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import { listNotifications, markNotificationRead } from "@/features/notifications/api";
import { getNotificationNavigationTarget } from "@/features/notifications/navigation";
import type { NotificationListItem } from "@/features/notifications/types";
import { useSessionContext } from "@/features/session/context";
import { supabase } from "@/lib/supabase";

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function getNotificationTitle(notification: NotificationListItem) {
  if (notification.type === "concern_delivered" && notification.relatedEntityType === "concern_delivery") {
    return "새 고민이 도착했어요";
  }

  if (notification.type === "response_received" && notification.relatedEntityType === "response") {
    return "내 고민에 새 답변이 도착했어요";
  }

  if (notification.type === "response_liked" && notification.relatedEntityType === "concern_delivery") {
    return "내 답변에 도움이 됐다는 반응이 도착했어요";
  }

  if (notification.type === "response_commented" && notification.relatedEntityType === "concern_delivery") {
    return "내 답변에 후기가 도착했어요";
  }

  return "아직 열 수 없는 알림입니다";
}

function getNotificationDescription(notification: NotificationListItem, isNavigable: boolean) {
  if (!isNavigable) {
    return "현재 버전에서는 이 알림을 열 수 없어요.";
  }

  if (notification.type === "response_received") {
    return "답변 상세로 이동";
  }

  return "연결된 상세 화면으로 이동";
}

export default function NotificationsScreen() {
  const router = useRouter();
  const { isLoading: isSessionLoading, session } = useSessionContext();
  const [items, setItems] = useState<NotificationListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    if (!isSessionLoading && !session) {
      router.replace("/");
    }
  }, [isSessionLoading, router, session]);

  useFocusEffect(
    useCallback(() => {
      if (isSessionLoading || !session) {
        return () => undefined;
      }

      let isActive = true;

      async function load() {
        setIsLoading(true);
        setErrorMessage(null);

        try {
          const nextItems = await listNotifications(supabase);

          if (!isActive) {
            return;
          }

          setItems(nextItems);
        } catch {
          if (!isActive) {
            return;
          }

          setErrorMessage("알림을 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.");
        } finally {
          if (isActive) {
            setIsLoading(false);
          }
        }
      }

      void load();

      return () => {
        isActive = false;
      };
    }, [isSessionLoading, reloadNonce, session]),
  );

  if (isSessionLoading || (isLoading && items.length === 0)) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#111827" />
        <Text style={styles.loadingText}>알림을 불러오고 있어요.</Text>
      </View>
    );
  }

  if (errorMessage) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>알림을 불러오지 못했어요</Text>
        <Text style={styles.description}>{errorMessage}</Text>
        <Pressable onPress={() => setReloadNonce((value) => value + 1)} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>다시 불러오기</Text>
        </Pressable>
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>아직 알림이 없어요</Text>
        <Text style={styles.description}>새 답변이 오면 이곳에서 바로 열 수 있어요.</Text>
      </View>
    );
  }

  return (
    <FlatList
      contentContainerStyle={styles.listContent}
      data={items}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => {
        const target = getNotificationNavigationTarget(item);
        const isNavigable = target !== null;

        return (
          <Pressable
            disabled={!isNavigable}
            onPress={async () => {
              if (target) {
                try {
                  await markNotificationRead(supabase, item.id);
                } catch {
                  // Read marking is best-effort. Navigation still proceeds.
                }

                router.push(target);
              }
            }}
            style={[styles.card, !isNavigable && styles.cardDisabled, !item.readAt && styles.cardUnread]}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.titleText}>{getNotificationTitle(item)}</Text>
              <Text style={styles.metaText}>{formatDateTime(item.createdAt)}</Text>
            </View>
            <Text style={styles.subtleText}>{getNotificationDescription(item, isNavigable)}</Text>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
    backgroundColor: "#f8fafc",
  },
  loadingText: {
    marginTop: 16,
    color: "#334155",
    fontSize: 16,
  },
  title: {
    color: "#0f172a",
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
  },
  description: {
    marginTop: 12,
    color: "#475569",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  primaryButton: {
    marginTop: 24,
    backgroundColor: "#0f172a",
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  primaryButtonText: {
    color: "#f8fafc",
    fontSize: 15,
    fontWeight: "700",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 18,
    gap: 12,
  },
  card: {
    borderRadius: 20,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 18,
  },
  cardUnread: {
    borderColor: "#93c5fd",
    backgroundColor: "#f8fbff",
  },
  cardDisabled: {
    opacity: 0.72,
  },
  cardHeader: {
    gap: 8,
  },
  titleText: {
    color: "#0f172a",
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 24,
  },
  metaText: {
    color: "#64748b",
    fontSize: 13,
  },
  subtleText: {
    marginTop: 12,
    color: "#475569",
    fontSize: 14,
    lineHeight: 21,
  },
});
