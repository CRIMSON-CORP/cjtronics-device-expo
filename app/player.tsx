import screenReferenceToConfig from "@/constants/screen-config-map";
import { useAdContext } from "@/hooks/useAdContext";
import React, {
  CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ActivityIndicator,
  Dimensions,
  Image,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";
import WebView from "react-native-webview";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEvent } from "expo";

const { width, height } = Dimensions.get("screen");

const player = () => {
  const {
    adGroups,
    adsLoading,
    widgets,
    sendLog,
    screenConfig,
    safeToPlay,
    adsBackgroundLoading,
  } = useAdContext();

  return (
    <View className="flex-1 bg-black">
      {adsLoading && <Loader />}
      {adsBackgroundLoading && <BackgroundLoader />}
      {safeToPlay && (
        <Player
          adGroups={adGroups}
          widgets={widgets}
          sendLog={sendLog}
          screenConfig={screenConfig}
        />
      )}
    </View>
  );
};

export default player;

function Loader() {
  return (
    <ActivityIndicator
      size="large"
      color="#ffffff"
      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
    />
  );
}

function BackgroundLoader() {
  return (
    <ActivityIndicator
      size="small"
      color="#ffffff"
      className="absolute right-5 bottom-5 opacity-60 z-20"
    />
  );
}

interface PlayerProps {
  screenConfig: ScreenConfig;
  adGroups: Ad[][];
  widgets: Ad[];
  sendLog?: (params: SendLogParams) => void;
}

function Player({ screenConfig, adGroups, widgets, sendLog }: PlayerProps) {
  const { screenView, emptyContent, onWidgetComplete, onPlayerComplete } =
    useAds({
      adGroups,
      widgets,
    });

  // If no playable content
  if (emptyContent) {
    return <EmptyScreen />;
  }

  if (screenView === "player") {
    return (
      <PlayerList
        sendLog={sendLog}
        adGroups={adGroups}
        screenConfig={screenConfig}
        onPlayerComplete={onPlayerComplete}
      />
    );
  }

  if (screenView === "widget") {
    return (
      <Widgets
        widgets={widgets}
        screenConfig={screenConfig}
        onComplete={onWidgetComplete}
      />
    );
  }

  return null;
}

function PlayerList({
  screenConfig,
  adGroups,
  sendLog,
  onPlayerComplete,
}: {
  screenConfig: ScreenConfig;
  adGroups: Ad[][];
  sendLog?: (params: SendLogParams) => void;
  onPlayerComplete: () => void;
}) {
  const [adListComplete, setAdListComplete] = useState(0);
  const onComplete = useCallback(() => {
    setAdListComplete((prev) => prev + 1);
  }, []);

  useEffect(() => {
    if (adListComplete === adGroups.length) {
      onPlayerComplete();
    }
  }, [adListComplete]);

  return (
    <Screen screenLayoutRef={screenConfig.layoutReference}>
      {adGroups.map((list, index) => (
        <PlayerView
          ads={list}
          key={index}
          onComplete={onComplete}
          sendLog={sendLog}
          screenConfig={screenConfig}
        />
      ))}
    </Screen>
  );
}

function Widgets({
  widgets,
  screenConfig,
  onComplete,
}: {
  widgets: Ad[];
  screenConfig: ScreenConfig;
  onComplete: () => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      if (currentIndex < widgets.length - 1) {
        setCurrentIndex((prevIndex) => prevIndex + 1);
      } else {
        if (widgets.length > 1) {
          onComplete();
        }
      }
    }, 5000); // Adjust the duration as needed

    return () => clearInterval(interval);
  }, [widgets.length, currentIndex, onComplete]);

  return (
    <View
      style={{
        height,
        width,
        ...StyleSheet.absoluteFillObject,
      }}
    >
      {widgets.map((widget, index) => (
        <View
          key={index}
          style={{
            ...StyleSheet.absoluteFillObject,
          }}
        >
          <WebView
            javaScriptEnabled
            style={{
              ...StyleSheet.absoluteFillObject,
              backgroundColor: "#000",
              opacity: index === currentIndex ? 1 : 0,
            }}
            source={{
              uri: `${widget.adUrl}?${new URLSearchParams({
                location: screenConfig?.city || "",
              }).toString()}`,
            }}
            allowFileAccess
          />
        </View>
      ))}
    </View>
  );
}

function EmptyScreen() {
  return (
    <View className="flex-1 flex flex-col justify-center gap-[5vh] items-center p-10 text-center bg-black">
      <View className="bg-white p-[2vh] rounded-[3vh]">
        <Image
          source={require("@/assets/images/logo.png")}
          alt="Cjtronics"
          className="w-72 h-12"
        />
      </View>
      <Text className="text-[7vw] text-white text-center">
        No Active Campaigns
      </Text>
    </View>
  );
}

interface ScreenProps {
  screenLayoutRef: string;
  children: React.ReactNode;
}

function Screen({ children, screenLayoutRef }: ScreenProps) {
  const layoutConfig = screenReferenceToConfig[screenLayoutRef];

  const screenStyle = useMemo(() => {
    const screenStyle: StyleProp<ViewStyle> & CSSProperties = {
      flexGrow: 1,
      overflow: "hidden",
      flexDirection: layoutConfig.horizontal ? "row" : "column",
      flexWrap: "wrap",
      aspectRatio: layoutConfig.landscape ? 16 / 9 : 9 / 16,
      width: layoutConfig.landscape ? "100%" : undefined,
      height: layoutConfig.landscape ? "auto" : undefined,
    };

    if (layoutConfig.split) {
      const splits = layoutConfig.split.split(",").map((split) => +split / 100);

      splits.forEach((split) => {
        screenStyle.flex = split;
      });
    }
    return screenStyle;
  }, [layoutConfig]);

  return (
    <View style={screenStyle} className="mx-auto">
      {children}
    </View>
  );
}

const days: string[] = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function adCanPlayToday(ad: Ad) {
  if (!ad) return false;
  return ad.adConfiguration.days.includes(days[new Date().getDay()]);
}

function adCanPlayNow(ad: Ad) {
  if (!ad) return false;

  const now = new Date();
  const startTime = new Date(ad.adConfiguration.startTime);
  const endTime = new Date(ad.adConfiguration.endTime);

  // Check if current date is within ad's overall time window
  if (now < startTime || now > endTime) return false;

  const [dailyStartHour, dailyStartMinute] = [
    startTime.getHours(),
    startTime.getMinutes(),
  ];
  const [dailyEndHour, dailyEndMinute] = [
    endTime.getHours(),
    endTime.getMinutes(),
  ];

  const [currentHour, currentMinute] = [now.getHours(), now.getMinutes()];

  // Handle the "overnight" scenario
  if (
    dailyEndHour < dailyStartHour ||
    (dailyEndHour === dailyStartHour && dailyEndMinute < dailyStartMinute)
  ) {
    const isAfterStartOrBeforeEnd =
      currentHour > dailyStartHour ||
      (currentHour === dailyStartHour && currentMinute >= dailyStartMinute) ||
      currentHour < dailyEndHour ||
      (currentHour === dailyEndHour && currentMinute <= dailyEndMinute);

    return isAfterStartOrBeforeEnd;
  } else {
    // Regular same-day time window
    const isAfterDailyStart =
      currentHour > dailyStartHour ||
      (currentHour === dailyStartHour && currentMinute >= dailyStartMinute);

    const isBeforeDailyEnd =
      currentHour < dailyEndHour ||
      (currentHour === dailyEndHour && currentMinute <= dailyEndMinute);

    return isAfterDailyStart && isBeforeDailyEnd;
  }
}

function adNotActive(ad: Ad) {
  if (!ad) return false;

  const now = new Date();
  const startTime = new Date(ad.adConfiguration.startTime);
  const endTime = new Date(ad.adConfiguration.endTime);

  // Check if current date is within ad's overall time window
  if (now < startTime || now > endTime) return false;
}

interface ViewProps {
  ads: Ad[];
  onComplete: () => void;
  sendLog?: (params: SendLogParams) => void;
  screenConfig?: ScreenConfig;
}

function PlayerView({ ads, onComplete, sendLog, screenConfig }: ViewProps) {
  const sequence = ads;
  const { currentAdIndex } = usePlayingAds({
    sequence,
    sendLog,
    onComplete,
  });

  // Existing sliding implementation for multiple ads/widgets
  return (
    <View className="flex-1 w-full h-full">
      <View
        className="flex h-full w-full items-center relative bg-black"
        style={{
          transform: [{ translateX: -currentAdIndex * width }],
        }}
      >
        {sequence.map((file, index) => (
          <PlayItem
            file={file}
            index={index}
            key={file.uploadRef + index}
            currentAdIndex={currentAdIndex}
            screenConfig={screenConfig}
          />
        ))}
      </View>
    </View>
  );
}

interface PlayItem {
  file: Ad;
  index: number;
  currentAdIndex: number;
  screenConfig: ScreenConfig | undefined;
}

function PlayItem({ file, index, currentAdIndex, screenConfig }: PlayItem) {
  return (
    <View
      className="w-full h-full absolute"
      style={{ transform: [{ translateX: index * width }] }}
    >
      {file.adType === "image" && index === currentAdIndex ? (
        <Image
          source={{ uri: file.adUrl }}
          alt={file.uploadName}
          key={currentAdIndex}
          resizeMode="contain"
          style={styles.media}
        />
      ) : file.adType === "video" && index === currentAdIndex ? (
        <VideoWrapper
          index={index}
          currentAdIndex={currentAdIndex}
          uri={file.adUrl}
          remoteUrl={file.remoteUrl}
        />
      ) : file.adType === "iframe" ? (
        <View
          style={{
            height,
            width,
            transform: [{ translateX: width > height ? -10 : 0 }],
            opacity: index === currentAdIndex ? 1 : 0,
          }}
        >
          <WebView
            javaScriptEnabled
            style={{
              width,
              backgroundColor: "#000",
            }}
            source={{
              uri: `${file.adUrl}?${new URLSearchParams({
                location: screenConfig?.city || "",
              }).toString()}`,
            }}
            allowFileAccess
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  media: {
    width: "100%",
    maxWidth: width,
    height: "100%",
    maxHeight: height,
  },
  backgroundLoader: {
    position: "absolute",
    right: 16,
    bottom: 16,
  },
});

interface VideoWrapperProps {
  index: number;
  currentAdIndex: number;
  uri: string;
  remoteUrl?: string;
}

function VideoWrapper({
  index,
  currentAdIndex,
  uri,
  remoteUrl,
}: VideoWrapperProps) {
  const player = useVideoPlayer(uri, (player) => {
    player.loop = true;
    player.muted = true;
    player.play();
  });

  const { error } = useEvent(player, "statusChange", {
    status: player.status,
  });

  useEffect(() => {
    if (error) {
      console.log(error, "video player error");

      player.replace(remoteUrl || uri);
    }
  }, [error, player]);

  return (
    <VideoView
      player={player}
      style={[
        styles.media,
        {
          opacity: index === currentAdIndex ? 1 : 0,
        },
      ]}
      contentFit="fill"
      allowsFullscreen
      nativeControls={false}
      allowsPictureInPicture
    />
  );
}
function useAds({ adGroups, widgets }: { adGroups: Ad[][]; widgets: Ad[] }) {
  const [screenView, setScreenView] = useState<"player" | "widget">("player");

  // Check if there are any playable ads or widgets
  const emptyContent = useMemo(() => {
    return (
      !adGroups.some((adGroup) =>
        adGroup.some((ad) => adCanPlayToday(ad) && adCanPlayNow(ad))
      ) && widgets.length == 0
    );
  }, [adGroups, widgets, screenView]);

  const onWidgetComplete = () => {
    setScreenView("player");
  };

  const onPlayerComplete = () => {
    setScreenView("widget");
  };

  return { screenView, emptyContent, onWidgetComplete, onPlayerComplete };
}

function usePlayingAds({
  sequence,
  sendLog,
  onComplete,
}: {
  sequence: Ad[];
  sendLog: ((params: SendLogParams) => void) | undefined;
  onComplete: () => void;
}) {
  const [currentAdIndex, setCurrentAdIndex] = useState(() => {
    return (
      sequence.findIndex((ad) => adCanPlayToday(ad) && adCanPlayNow(ad)) || 0
    );
  });

  const moveToNextAd = useCallback(() => {
    setCurrentAdIndex((prevIndex) => {
      let nextIndex = prevIndex + 1;

      while (nextIndex < sequence.length) {
        const ad = sequence[nextIndex];
        if (adCanPlayToday(ad) && adCanPlayNow(ad)) {
          return nextIndex;
        }
        // Log skipped ads
        if (!adNotActive(ad)) {
          sendLog?.({
            accountId: ad.adAccountId,
            adId: ad.adId,
            campaignId: ad.campaignId,
            messageType: "skipped",
            uploadRef: ad.uploadRef,
          });
        }
        nextIndex++;
      }
      return -1; // No more ads can play
    });
  }, [sequence, sendLog]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    if (currentAdIndex >= 0 && currentAdIndex < sequence.length) {
      const adToPlay = sequence[currentAdIndex];

      if (adNotActive(adToPlay)) {
        moveToNextAd();
        return;
      }

      if (adCanPlayToday(adToPlay) && adCanPlayNow(adToPlay)) {
        sendLog?.({
          accountId: adToPlay.adAccountId,
          adId: adToPlay.adId,
          campaignId: adToPlay.campaignId,
          messageType: "play",
          uploadRef: adToPlay.uploadRef,
        });

        const adDuration = adToPlay.adConfiguration.duration * 1000;
        timer = setTimeout(moveToNextAd, adDuration);
      } else {
        moveToNextAd();
      }
    } else {
      onComplete();
    }

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [currentAdIndex, moveToNextAd, onComplete, sendLog, sequence]);

  return { currentAdIndex };
}
// <Video
//   style={[
//     styles.media,
//     {
//       opacity: index === currentAdIndex ? 1 : 0,
//     },
//   ]}
//   source={{
//     uri: videoUrl,
//   }}
//   resizeMode={ResizeMode.STRETCH}
//   isLooping
//   isMuted
//   shouldPlay
//   onError={(e) => {
//     console.log(e, " video error ", index);
//     if (remoteUrl) {
//       setVideoUrl(remoteUrl);
//       console.log("video url set to remote url");
//     }
//   }}
// />

// function VideoWrapper({
//   index,
//   currentAdIndex,
//   uri,
//   remoteUrl,
// }: VideoWrapperProps) {
//   const videoRef = useRef<Video | null>(null);
//   const [videoUrl, setVideoUrl] = useState(uri);

//   return (
//     <Video
//       key={videoUrl}
//       ref={videoRef}
//       style={[
//         styles.media,
//         {
//           opacity: index === currentAdIndex ? 1 : 0,
//         },
//       ]}
//       source={{
//         uri: videoUrl,
//       }}
//       resizeMode={ResizeMode.STRETCH}
//       isLooping
//       isMuted
//       shouldPlay
//       onError={(e) => {
//         console.log(e, " video error ", index);
//         if (remoteUrl) {
//           setVideoUrl(remoteUrl);
//           console.log("video url set to remote url");
//         }
//       }}
//     />
//   );
// }
