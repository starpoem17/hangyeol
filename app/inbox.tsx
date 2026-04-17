import { StyleSheet, Text, View } from "react-native";

export default function InboxScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.eyebrow}>임시 진입 화면</Text>
      <Text style={styles.title}>내게 전송된 답변을 기다리는 고민</Text>
      <Text style={styles.description}>
        이번 단계에서는 온보딩 완료 후 이 화면으로만 이동합니다. 실제 inbox 목록과 데이터 흐름은 다음 단계에서 연결합니다.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    backgroundColor: "#f8fafc",
  },
  eyebrow: {
    color: "#1d4ed8",
    fontSize: 14,
    fontWeight: "700",
  },
  title: {
    marginTop: 14,
    color: "#0f172a",
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "700",
  },
  description: {
    marginTop: 14,
    color: "#475569",
    fontSize: 15,
    lineHeight: 22,
  },
});
