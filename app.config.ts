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
      googleServicesFile: "./google-services.json",
    },
    ios: {
      bundleIdentifier: "com.hangyeol.app",
    },
    extra: {
      eas: {
        projectId:
          process.env.EXPO_PUBLIC_EAS_PROJECT_ID ??
          "403682c5-c7bc-4ec0-b3d5-1dd7e3201cfd",
      },
    },
  },
};
