import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import "react-native-reanimated";
import "../global.css";

import AdProvider from "@/context/AdContext";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useKeepAwake } from "expo-keep-awake";
import { StatusBar } from "expo-status-bar";
// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useKeepAwake();
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });

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
    </ThemeProvider>
  );
}
