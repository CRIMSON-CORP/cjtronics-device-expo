import { useAdContext } from "@/hooks/useAdContext";
import { useRouter } from "expo-router";
import React, { useEffect } from "react";
import {
  Alert,
  Image,
  Linking,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export default function index() {
  const { deviceCode, safeToPlay } = useAdContext();
  const router = useRouter();
  useEffect(() => {
    if (safeToPlay) {
      router.replace("/player");
    }
  }, []);

  return (
    <View className="flex-1 flex flex-col justify-center gap-[5vh] items-center p-10 text-center bg-black">
      <View className="bg-white p-[2vh] rounded-[3vh]">
        <Image
          source={require("@/assets/images/logo.png")}
          alt="Cjtronics"
          className="w-72 h-12"
        />
      </View>
      <Text className="text-[8vw] text-white text-center">
        Device Id: {deviceCode?.toString() || ""}
      </Text>
      <Text className="text-[max(1.5vw,12px)] text-white text-center">
        Or visit <Link /> and enter the code below as your device ID to
        synchronise your device with the platform
      </Text>
    </View>
  );
}

const URL = "https://cjtronicsbyfolham.com";

function Link() {
  const openURL = async () => {
    // Check if the URL is supported and then open it
    const supported = await Linking.canOpenURL(URL);

    if (supported) {
      await Linking.openURL(URL);
    } else {
      Alert.alert("Error", `Can't open this URL: ${URL}`);
    }
  };

  return (
    <TouchableOpacity onPress={openURL}>
      <Text className="text-white text-center self-center mt-2 translate-y-1">
        {URL}
      </Text>
    </TouchableOpacity>
  );
}
