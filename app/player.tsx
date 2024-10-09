import screenReferenceToConfig from "@/constants/screen-config-map";
import { useAdContext } from "@/hooks/useAdContext";
import { ResizeMode, Video } from "expo-av";
import React, {
  CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Dimensions,
  Image,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";
import WebView from "react-native-webview";

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
      {safeToPlay && adGroups.length > 0 && (
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
  const [screenView, setScreenView] = useState("player");
  const [completedScreen, setCompletedScreen] = useState<boolean[]>([]);

  const onComplete = useCallback(() => {
    setCompletedScreen((prev) => [...prev, true]);
  }, []);

  const onWidgetComplete = () => {
    setScreenView("player");
    setCompletedScreen([]);
  };

  useEffect(() => {
    if (adGroups.length !== 0 || widgets.length !== 0) {
      if (completedScreen.length === adGroups.length && widgets.length > 0) {
        setScreenView("widgets");
      } else {
        if (completedScreen.length === adGroups.length) {
          setCompletedScreen([]);
          setScreenView("player" + new Date().getTime());
        }
      }
    }
  }, [completedScreen, adGroups, widgets]);

  useEffect(() => {
    setCompletedScreen([]);
  }, [screenView]);

  return (
    <View className="flex-1 overflow-hidden p-0 bg-black">
      {screenView.startsWith("player") ? (
        <Screen screenLayoutRef={screenConfig.layoutReference}>
          {adGroups.map((list, index) => (
            <PlayerView
              view="ads"
              ads={list}
              key={index}
              screenView={screenView}
              setScreenView={setScreenView}
              onComplete={onComplete}
              sendLog={sendLog}
              index={index}
              screenConfig={screenConfig}
            />
          ))}
        </Screen>
      ) : (
        <Screen screenLayoutRef="VBSGTREW43">
          <PlayerView
            view="widget"
            ads={widgets}
            index={0}
            onComplete={onWidgetComplete}
          />
        </Screen>
      )}
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
      flexGrow: 1, // Makes the container take up the full available space
      overflow: "hidden",
      flexDirection: layoutConfig.horizontal ? "row" : "column", // Set direction based on layoutConfig
      flexWrap: "wrap", // Allows items to wrap to the next line if needed
      aspectRatio: layoutConfig.landscape ? 16 / 9 : 9 / 16, // Set aspect ratio
      width: layoutConfig.landscape ? "100%" : undefined, // Set width based on layoutConfig
      height: layoutConfig.landscape ? "auto" : undefined, // Set height based on layoutConfig
    };

    if (layoutConfig.split) {
      const splits = layoutConfig.split.split(",").map((split) => +split / 100);

      // Add flex values based on splits
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

interface ViewProps {
  ads: Ad[];
  onComplete: () => void;
  screenView?: string;
  setScreenView?: React.Dispatch<React.SetStateAction<string>>;
  sendLog?: (params: SendLogParams) => void;
  view: "ads" | "widget";
  index: number;
  screenConfig?: ScreenConfig;
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

  // Extract daily time window (same time range for every day)
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
    // Ad plays from start time until midnight, and from midnight until end time
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

function PlayerView({
  ads,
  screenView,
  onComplete,
  sendLog,
  view,
  screenConfig,
}: ViewProps) {
  const sequence = ads;

  const [currentAdIndex, setCurrentAdIndex] = useState(() => {
    return view === "ads"
      ? sequence.findIndex((ad) => adCanPlayToday(ad) && adCanPlayNow(ad)) || 0
      : 0;
  });

  const [anyAdCanPlay, setAnyAdCanPlay] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    if (currentAdIndex < sequence.length) {
      if (currentAdIndex === -1) return;
      const adToPlay = sequence[currentAdIndex];
      const adDuration = adToPlay.adConfiguration.duration * 1000; // Convert to ms

      // Skip inactive ads and move to the next ad without logging
      if (adNotActive(adToPlay)) {
        setCurrentAdIndex((prevIndex) => (prevIndex + 1) % sequence.length);
        return; // Exit early
      }

      // Check if the ad can play today and now
      if (adCanPlayToday(adToPlay) && adCanPlayNow(adToPlay)) {
        // Log when an ad is played
        sendLog?.({
          accountId: adToPlay.adAccountId,
          adId: adToPlay.adId,
          campaignId: adToPlay.campaignId,
          messageType: "play",
          uploadRef: adToPlay.uploadRef,
        });

        // Set a timer to play the next ad
        timer = setTimeout(() => {
          setCurrentAdIndex((prevIndex) => {
            let nextIndex = prevIndex + 1;

            while (
              nextIndex < sequence.length &&
              (!adCanPlayToday(sequence[nextIndex]) ||
                !adCanPlayNow(sequence[nextIndex]))
            ) {
              sendLog?.({
                accountId: sequence[nextIndex].adAccountId,
                adId: sequence[nextIndex].adId,
                campaignId: sequence[nextIndex].campaignId,
                messageType: "skipped",
                uploadRef: sequence[nextIndex].uploadRef,
              });

              nextIndex++;
              if (nextIndex >= sequence.length) {
                nextIndex = 0; // Loop back to the start if end is reached
              }
            }
            return nextIndex;
          });
        }, adDuration);
      } else {
        // Log skipped ad if it's not playable today or now
        sendLog?.({
          accountId: adToPlay.adAccountId,
          adId: adToPlay.adId,
          campaignId: adToPlay.campaignId,
          messageType: "skipped",
          uploadRef: adToPlay.uploadRef,
        });

        // Immediately go to next ad if the current one can't play
        setCurrentAdIndex((prevIndex) => (prevIndex + 1) % sequence.length);
      }

      return () => {
        if (timer) clearTimeout(timer);
      };
    } else {
      onComplete(); // Call onComplete when no more ads can play
    }
  }, [currentAdIndex, onComplete, sendLog, sequence]);

  useEffect(() => {
    setCurrentAdIndex(() => {
      return view === "ads"
        ? sequence.findIndex((ad) => adCanPlayToday(ad) && adCanPlayNow(ad)) ||
            0
        : 0;
    });
  }, [screenView, sequence, view]);

  useEffect(() => {
    setAnyAdCanPlay(
      sequence.some((ad) => adCanPlayToday(ad) && adCanPlayNow(ad))
    );
  }, [sequence]);

  if (!anyAdCanPlay) {
    return null;
  }

  return (
    <View className="flex-1 w-full h-full">
      <View
        className="flex h-full w-full items-center relative bg-black"
        style={{
          transform: [{ translateX: -currentAdIndex * width }],
        }}
      >
        {sequence.map((file, index) => (
          <View
            key={index}
            className="w-full h-full absolute"
            style={{ transform: [{ translateX: index * width }] }}
          >
            {file.adType === "image" && index === currentAdIndex ? (
              <Image
                source={{
                  uri: file.adUrl,
                }}
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
        ))}
      </View>
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
  const videoRef = useRef<Video | null>(null);
  const [videoUrl, setVideoUrl] = useState(uri);

  return (
    <Video
      key={videoUrl}
      ref={videoRef}
      style={[
        styles.media,
        {
          opacity: index === currentAdIndex ? 1 : 0,
        },
      ]}
      source={{
        uri: videoUrl,
      }}
      resizeMode={ResizeMode.CONTAIN}
      isLooping
      isMuted
      shouldPlay
      onError={(e) => {
        console.log(e, " video error ", index);
        if (remoteUrl) {
          setVideoUrl(remoteUrl);
          console.log("video url set to remote url");
        }
      }}
    />
  );
}
