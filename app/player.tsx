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
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";
import { Image } from "expo-image";
import WebView from "react-native-webview";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEvent } from "expo";
import { ContextProps } from "@/context/AdContext";

// const { width, height } = Dimensions.get("screen");

function useScreenDimensions() {
  const [screen, setScreen] = useState(Dimensions.get("screen"));

  useEffect(() => {
    const subscription = Dimensions.addEventListener("change", ({ screen }) => {
      setScreen(screen);
    });

    return () => subscription?.remove();
  }, []);

  return screen;
}

const player = () => {
  const {
    adGroups,
    adsLoading,
    widgets,
    sendLog,
    screenConfig,
    safeToPlay,
    adsBackgroundLoading,
    downloadProgressData,
  } = useAdContext();
  const windowDimensions = useScreenDimensions();

  return (
    <View style={windowDimensions} className="flex-grow bg-black relative">
      {downloadProgressData && (
        <DownloadProgress downloadProgressData={downloadProgressData} />
      )}
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

function DownloadProgress({
  downloadProgressData,
}: {
  downloadProgressData: ContextProps["downloadProgressData"];
}) {
  const percent =
    ((downloadProgressData?.downloaded ?? 0) /
      (downloadProgressData?.total ?? 1)) *
    100;

  return (
    <Text className="text-white/60 absolute bottom-2 left-4 z-20">
      Downloading {downloadProgressData?.downloaded}/
      {downloadProgressData?.total} files. {percent.toFixed(1)}%
    </Text>
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
      setAdListComplete(0);
    }
  }, [adListComplete, adGroups.length, onPlayerComplete]);

  const playerViewList = useMemo(() => {
    return adGroups.map((list, index) => (
      <PlayerView
        ads={list}
        key={index}
        onComplete={onComplete}
        sendLog={sendLog}
        screenConfig={screenConfig}
      />
    ));
  }, [adGroups, sendLog, screenConfig, onComplete]);

  return (
    <Screen
      playerViewList={playerViewList}
      screenLayoutRef={screenConfig.layoutReference}
    />
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
  const { width, height } = useScreenDimensions();

  useEffect(() => {
    if (widgets.length === 0) {
      Promise.resolve().then(onComplete);
      return;
    }

    let mounted = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const scheduleNext = () => {
      timer = setTimeout(() => {
        if (!mounted) return;

        // use functional updater so we never rely on stale `currentIndex`
        setCurrentIndex((prev) => {
          if (prev < widgets.length - 1) {
            // advance to next widget
            // schedule next tick
            scheduleNext();
            return prev + 1;
          } else {
            // we reached the last widget — call onComplete and reset to 0
            // don't schedule another tick
            onComplete();
            return prev;
          }
        });
      }, 10000);
    };

    // start the cycle
    scheduleNext();

    return () => {
      mounted = false;
      if (timer) clearTimeout(timer);
      // don't force-reset the index here; let remounting decide initial state
    };
  }, [widgets.length, onComplete]);

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
              uri: `${
                widget.adUrl
              }?location=${screenConfig?.city.toLowerCase()}`,
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
  playerViewList: React.JSX.Element[];
  screenLayoutRef: string;
}

function Screen({ screenLayoutRef, playerViewList }: ScreenProps) {
  const layoutConfig = screenReferenceToConfig[screenLayoutRef];

  const screenStyle = useMemo(() => {
    const screenStyle: StyleProp<ViewStyle> &
      CSSProperties & { splits?: number[] } = {
      flexGrow: 1,
      overflow: "hidden",
      flexDirection: layoutConfig.horizontal ? "row" : "column",
      flexWrap: "wrap",
      aspectRatio: layoutConfig.landscape ? 16 / 9 : 9 / 16,
      width: layoutConfig.landscape ? "100%" : undefined,
      height: layoutConfig.landscape ? "auto" : "100%",
      ...StyleSheet.absoluteFillObject,
    };

    if (layoutConfig.split) {
      const splits = layoutConfig.split.split(",").map((split) => +split / 100);
      screenStyle.splits = splits;
    }
    return screenStyle;
  }, [layoutConfig]);

  return (
    <View style={screenStyle} className="mx-auto">
      {playerViewList.map((playerView, index) => (
        <View
          key={index}
          style={{
            flex: screenStyle.splits ? screenStyle.splits[index] : 1,
            width:
              layoutConfig.landscape && screenStyle.splits ? "auto" : "100%",
            height:
              layoutConfig.landscape && screenStyle.splits ? "100%" : "auto",
          }}
        >
          {playerView}
        </View>
      ))}
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
  return now < startTime || now > endTime;
}

interface ViewProps {
  ads: Ad[];
  onComplete: () => void;
  sendLog?: (params: SendLogParams) => void;
  screenConfig?: ScreenConfig;
}

function PlayerView({ ads, onComplete, sendLog, screenConfig }: ViewProps) {
  const { width } = useScreenDimensions();
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
  const { width, height } = useScreenDimensions();
  return (
    <View
      className="w-full h-full absolute"
      style={{ transform: [{ translateX: index * width }] }}
    >
      {file.adType === "image" && index === currentAdIndex ? (
        <ImageWrapper file={file} key={`${file.uploadRef}-${index}`} />
      ) : file.adType === "video" && index === currentAdIndex ? (
        <VideoWrapper
          index={index}
          key={`${file.uploadRef}-${index}`}
          currentAdIndex={currentAdIndex}
          uri={file.adUrl}
          remoteUrl={file.remoteUrl}
        />
      ) : file.adType === "iframe" && screenConfig ? (
        <View
          style={{
            height,
            width,
            transform: [{ translateX: width > height ? -10 : 0 }],
            opacity: index === currentAdIndex ? 1 : 0,
          }}
        >
          <AdIframe file={file} screenConfig={screenConfig} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  media: {
    width: "100%",
    height: "100%",
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

function ImageWrapper({ file }: { file: Ad }) {
  const { width, height } = useScreenDimensions();
  const [uri, setUri] = useState(file.adUrl);

  return (
    <Image
      source={{ uri }}
      alt={file.uploadName}
      contentFit="contain"
      contentPosition="center"
      style={[{ width, height, maxWidth: width, maxHeight: height }]}
      onError={() => {
        // replace with your fallback url
        console.log("image failed to load, using remote url ", file.remoteUrl);

        if (file.remoteUrl) {
          setUri(file.remoteUrl);
        }
      }}
    />
  );
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
      console.log("Replacing url ", remoteUrl);

      player.replaceAsync(remoteUrl || uri);
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
      fullscreenOptions={{
        enable: true,
      }}
      nativeControls={false}
      allowsPictureInPicture
    />
  );
}

function AdIframe({
  file,
  screenConfig,
}: {
  file: Ad;
  screenConfig: ScreenConfig;
}) {
  const { width, height } = useScreenDimensions();
  const [uri, setUri] = useState(
    `${file.adUrl}?${new URLSearchParams({
      location: screenConfig?.city || "",
    }).toString()}`
  );

  return (
    <WebView
      javaScriptEnabled
      key={`${file.uploadRef}`}
      style={{
        width,
        height,
        backgroundColor: "#000",
      }}
      source={{ uri }}
      allowFileAccess
      onError={() => {
        // swap to fallback URL if main one fails
        console.log("iframe failed to load, using remote url ", file.remoteUrl);
        if (file.remoteUrl) {
          setUri(file.remoteUrl);
        }
      }}
    />
  );
}

function useAds({ adGroups, widgets }: { adGroups: Ad[][]; widgets: Ad[] }) {
  const [screenView, setScreenView] = useState<"player" | "widget">("player");

  const noAdsToPlay = useMemo(
    () =>
      !adGroups.some((adGroup) =>
        adGroup.some((ad) => adCanPlayToday(ad) && adCanPlayNow(ad))
      ),
    [adGroups]
  );

  const noWidgetsToShow = widgets.length == 0;

  // Check if there are any playable ads or widgets
  const emptyContent = useMemo(() => {
    return noAdsToPlay && noWidgetsToShow;
  }, [adGroups, widgets, screenView]);

  const onWidgetComplete = useCallback(() => {
    if (!noAdsToPlay) {
      setScreenView("player");
    }
  }, [noAdsToPlay]);

  const onPlayerComplete = useCallback(() => {
    setScreenView("widget");
  }, []);

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
    return sequence.findIndex((ad) => adCanPlayToday(ad) && adCanPlayNow(ad));
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

  console.log(
    sequence[currentAdIndex]?.adUrl,
    "rendering ",
    sequence[currentAdIndex]?.adType,
    "ad, at index: ",
    currentAdIndex
  );

  useEffect(() => {
    setCurrentAdIndex(
      sequence.findIndex((ad) => adCanPlayToday(ad) && adCanPlayNow(ad)) ?? -1
    );
  }, [sequence]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    if (currentAdIndex >= 0 && currentAdIndex < sequence.length - 1) {
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
