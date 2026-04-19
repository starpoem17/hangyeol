export default {
  expo: {
    name: "Hangyeol",
    slug: "hangyeol",
    scheme: "hangyeol",
    orientation: "portrait",
    userInterfaceStyle: "light",
    plugins: ["expo-router", "expo-notifications"],
    experiments: {
      typedRoutes: true,
    },
    android: {
      package: "com.hangyeol.app",
    },
    ios: {
      bundleIdentifier: "com.hangyeol.app",
    },
    extra: {
      eas: {
        projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID,
      },
    },
  },
};
