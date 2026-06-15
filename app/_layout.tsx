import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import { Platform, View, Text, TouchableOpacity } from "react-native";
import "react-native-reanimated";
import "../global.css";

import AdProvider from "@/context/AdContext";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useKeepAwake } from "expo-keep-awake";
import { StatusBar } from "expo-status-bar";
import {
  setupGlobalLogger,
  loadLogDirectory,
  subscribeToDirectoryUri,
  requestAndSetLogDirectory,
} from "@/utils/logger";

// Initialize global logger as early as possible
setupGlobalLogger();

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

function LogFolderBanner() {
  const [directoryUri, setDirectoryUri] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    return subscribeToDirectoryUri((uri) => {
      setDirectoryUri(uri);
    });
  }, []);

  if (Platform.OS !== "android" || directoryUri || dismissed) {
    return null;
  }

  const handleSetup = async () => {
    const success = await requestAndSetLogDirectory();
    if (success) {
      // Done
    }
  };

  return (
    <View className="absolute bottom-6 left-6 right-6 p-4 bg-zinc-900/95 border border-amber-500/30 rounded-2xl flex flex-row items-center justify-between shadow-2xl z-50">
      <View className="flex-1 mr-4">
        <Text className="text-amber-400 text-sm font-bold mb-1">
          ⚠️ Enable File Manager Logs
        </Text>
        <Text className="text-zinc-300 text-xs leading-4">
          To read logs when the app is closed, choose a folder (e.g. Downloads) to save app-logs.txt.
        </Text>
      </View>
      <View className="flex flex-row gap-2 items-center">
        <TouchableOpacity
          onPress={() => setDismissed(true)}
          className="px-3 py-2 bg-zinc-850 rounded-lg active:opacity-80 border border-zinc-700"
        >
          <Text className="text-zinc-400 text-xs font-semibold">Not Now</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleSetup}
          className="px-3 py-2 bg-amber-500 rounded-lg active:opacity-80"
        >
          <Text className="text-black text-xs font-semibold">Choose Folder</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function RootLayout() {
  useKeepAwake();
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });

  useEffect(() => {
    loadLogDirectory();
  }, []);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <AdProvider>
        <Stack>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="player" options={{ headerShown: false }} />
          <Stack.Screen name="+not-found" />
        </Stack>
      </AdProvider>
      <StatusBar hidden={true} />
      <LogFolderBanner />
    </ThemeProvider>
  );
}

