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
  const { adGroups, adsLoading, widgets, sendLog, screenConfig, safeToPlay } =
    useAdContext();

  return (
    <View className="flex-1 bg-black">
      {adsLoading && <Loader />}
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
      background: "#c2410c",
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

  return <View style={screenStyle}>{children}</View>;
}

interface ViewProps {
  ads: Ad[];
  onComplete: () => void;
  screenView?: string;
  setScreenView?: React.Dispatch<React.SetStateAction<string>>;
  sendLog?: (params: SendLogParams) => void;
  view: "ads" | "widget";
  index: number;
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
  const startTime = new Date(ad.adConfiguration.startTime).getTime();
  const endTime = new Date(ad.adConfiguration.endTime).getTime();
  const now = new Date().getTime();
  return startTime <= now && now <= endTime;
}

function PlayerView({
  ads,
  screenView,
  onComplete,
  sendLog,
  view,
  index,
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
      const adToPlay = sequence[currentAdIndex];
      const adDuration = adToPlay.adConfiguration.duration * 1000; // Convert to milliseconds

      if (!adCanPlayToday(adToPlay) && !adCanPlayNow(adToPlay)) {
        sendLog?.({
          accountId: adToPlay.adAccountId,
          adId: adToPlay.adId,
          campaignId: adToPlay.campaignId,
          messageType: "skipped",
          uploadRef: adToPlay.uploadRef,
        });
      } else {
        timer = setTimeout(() => {
          setCurrentAdIndex((prevIndex) => {
            // find the next ad that can be played
            let nextIndex = prevIndex + 1;
            while (
              nextIndex < sequence.length &&
              !adCanPlayToday(sequence[nextIndex]) &&
              !adCanPlayNow(sequence[nextIndex])
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
                nextIndex = 0;
              }
            }
            return nextIndex;
          });
        }, adDuration);
      }

      return () => {
        if (timer) {
          clearTimeout(timer);
        }
      }; // Clear the timer when component unmounts or index changes
    } else {
      onComplete();
      // setTimeout(() => {
      //   setCurrentAdIndex(0);
      // }, 1000 * 20);
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
        {sequence.map((file, index) => {
          return (
            <View
              key={index}
              className="w-full h-full absolute"
              style={{ transform: [{ translateX: index * width }] }}
            >
              {file.adType === "image" ? (
                <Image
                  source={{
                    uri: file.adUrl,
                  }}
                  alt={file.uploadName}
                  key={currentAdIndex}
                  resizeMode="contain"
                  style={[
                    styles.media,
                    {
                      opacity: index === currentAdIndex ? 1 : 0,
                    },
                  ]}
                />
              ) : file.adType === "video" ? (
                <VideoWrapper
                  index={index}
                  currentAdIndex={currentAdIndex}
                  uri={file.adUrl}
                />
              ) : file.adType === "iframe" ? (
                <View
                  style={{
                    height,
                    width,
                    opacity: index === currentAdIndex ? 1 : 0,
                  }}
                >
                  <WebView
                    javaScriptEnabled
                    style={{
                      width: "97%",
                      backgroundColor: "#000",
                    }}
                    source={{
                      uri: file.adUrl,
                    }}
                    allowFileAccess
                  />
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  media: {
    width,
    height: "100%",
  },
});

interface VideoWrapperProps {
  index: number;
  currentAdIndex: number;
  uri: string;
}

function VideoWrapper({ index, currentAdIndex, uri }: VideoWrapperProps) {
  const videoRef = useRef<Video | null>(null);

  useEffect(() => {
    if (index === currentAdIndex) {
      videoRef.current?.playAsync();
      console.log("Playing video at ", index);
    }
  }, [index, currentAdIndex]);

  return (
    <Video
      ref={videoRef}
      style={[
        styles.media,
        {
          opacity: index === currentAdIndex ? 1 : 0,
        },
      ]}
      source={{
        uri,
      }}
      useNativeControls
      resizeMode={ResizeMode.CONTAIN}
      isLooping
      isMuted
      onError={(e) => console.log(e, " video error ", index)}
    />
  );
}
