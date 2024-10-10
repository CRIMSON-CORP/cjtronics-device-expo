import useAsyncStorage from "@/hooks/useAsyncStorage";
import useDeviceCode from "@/hooks/useDeviceCode";
import useSocket from "@/hooks/useSocket";
import * as FileSystem from "expo-file-system";
import { useRouter } from "expo-router";
import React, {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

interface ContextProps {
  adGroups: Ad[][];
  widgets: Ad[];
  sendLog: (params: SendLogParams) => void;
  adsLoading: boolean;
  request: boolean;
  screenConfig: ScreenConfig;
  deviceCode: LocalState | undefined;
  safeToPlay: boolean;
  adsBackgroundLoading: boolean;
}

export const AdContext = createContext<ContextProps>({
  adGroups: [],
  widgets: [],
  sendLog: () => {},
  adsLoading: false,
  request: false,
  screenConfig: {
    city: "",
    deviceId: "",
    layout: "",
    layoutReference: "",
    screenHeight: "",
    screenId: "",
    screenLayoutConfig: { width: 0 },
    screenName: "",
    screenResolution: "",
    screenWidth: "",
    ttl: "",
  },
  deviceCode: "",
  safeToPlay: false,
  adsBackgroundLoading: false,
});

function AdProvider({ children }: { children: React.ReactNode }) {
  const [ads, setAds] = useState<Ad[]>([]);
  const [screenConfig, setScreenConfig] = useState<ScreenConfig>({
    city: "",
    deviceId: "",
    layout: "",
    layoutReference: "",
    screenHeight: "",
    screenId: "",
    screenLayoutConfig: { width: 0 },
    screenName: "",
    screenResolution: "",
    screenWidth: "",
    ttl: "",
  });
  const [adsLoading, setAdLoading] = useState(false);
  const [request, setrequest] = useState(false);
  const [safeToPlay, setSafeToPlay] = useState(false);
  const deviceCode = useDeviceCode();
  const router = useRouter();
  const { item, setItem, loaded } = useAsyncStorage("cache-ads");
  const [adsFetchFromApi, setAdsFetchFromApi] = useState(false);
  const [adsBackgroundLoading, setAdsBackgroundLoading] = useState(false);
  const localLoaded = useRef(false);
  const localItem = useRef<any>(null);
  const alreadyUsingLocal = useRef(false);

  let fetchTimeout: ReturnType<typeof setTimeout> | null = null;
  const setReceivedAds = useCallback(async (data: any) => {
    const config = data.config as ScreenConfig;
    const ads = data.data[0].campaigns as Ad[];
    try {
      const mediaUrls = ads.map((_data) => _data.adUrl);
      const cachedUrls = await cacheAdsInBackground(mediaUrls);
      const adsWithCachedUris = ads.map((ad, index) => ({
        ...ad,
        adUrl: cachedUrls[index],
      }));
      setAds(adsWithCachedUris);
      setItem({ ads: adsWithCachedUris, screen: config });
      setScreenConfig(config);
      console.log("loaded ads from background");

      setSafeToPlay(true);
    } catch (error) {
      console.log(error);
      setReceivedAds({ data, config });
    }
  }, []);

  const { sendLog } = useSocket({
    onReceiveAds: setReceivedAds,
    deviceCode,
  });

  const cacheAdsInBackground = useCallback(async (urls: string[]) => {
    try {
      setAdsBackgroundLoading(true);
      console.log("downloading ads in background");

      const localPaths = [];

      // Download each URL sequentially
      for (const url of urls) {
        const fileUri = `${FileSystem.documentDirectory}${url
          .split("/")
          .pop()}`;
        const fileInfo = await FileSystem.getInfoAsync(fileUri);

        if (fileInfo.exists) {
          localPaths.push(fileUri);
        } else {
          const downloadedFile = await FileSystem.downloadAsync(url, fileUri);
          localPaths.push(downloadedFile.uri);
        }
      }

      console.log("downloading ads in background successful");
      setAdsBackgroundLoading(false);
      return localPaths; // All files are downloaded sequentially
    } catch (error) {
      console.log(error);
      setAdsBackgroundLoading(false);
      return [];
    }
  }, []);

  const cacheAds = useCallback(async (urls: string[]) => {
    try {
      setAdLoading(true);
      console.log("downloading ads");

      const localPaths = [];

      // Download each URL sequentially
      for (const url of urls) {
        const fileUri = `${FileSystem.documentDirectory}${url
          .split("/")
          .pop()}`;
        const fileInfo = await FileSystem.getInfoAsync(fileUri);

        if (fileInfo.exists) {
          localPaths.push(fileUri);
        } else {
          const downloadedFile = await FileSystem.downloadAsync(url, fileUri);
          localPaths.push(downloadedFile.uri);
        }
      }

      console.log("downloading ads successful");
      setAdLoading(false);
      return localPaths; // All files are downloaded sequentially
    } catch (error) {
      console.log(error);
      setAdLoading(false);
      return await cacheAds(urls);
    }
  }, []);

  const fetchAds = useCallback(async () => {
    if (adsFetchFromApi) return;
    console.log("fetching ads");

    try {
      if (fetchTimeout) {
        clearTimeout(fetchTimeout);
      }
      const response = await fetch(
        `https://cjtronics.tushcode.com/v1/public-advert/campaigns/${deviceCode}`
      );
      if (!response.ok) throw new Error("Failed to fetch");
      const data: { config: ScreenConfig; data: [{ campaigns: Ad[] }] } =
        await response.json();

      setrequest(true);
      const ads = data.data[0].campaigns;
      const mediaUrls = ads.map((ad) => ad.adUrl);
      console.log("ads fetch, cahing ads...");

      const cachedUrls = await cacheAds(mediaUrls);
      console.log("cached file urls", cachedUrls);

      const adsWithCachedUris = ads.map((ad, index) => ({
        ...ad,
        remoteUrl: ad.adUrl,
        adUrl: cachedUrls[index],
      }));
      setAds(adsWithCachedUris);
      setItem({ ads: adsWithCachedUris, screen: data.config });
      setScreenConfig(data.config);
      setSafeToPlay(true);
      setAdsFetchFromApi(false);
      alreadyUsingLocal.current = false;
    } catch (error: any) {
      if (
        localLoaded.current &&
        localItem.current &&
        !alreadyUsingLocal.current
      ) {
        alreadyUsingLocal.current = true;
        console.log("fetch failed, using local");

        setAds(localItem.current.ads as Ad[]);
        setScreenConfig(localItem.current.screen as ScreenConfig);
        setrequest(true);
        setSafeToPlay(true);
      } else {
        console.log("nothing in local, waiting");
      }
      console.log(
        error.response?.data?.message || error.message,
        "ff",
        deviceCode
      );
      fetchTimeout = setTimeout(() => {
        fetchAds();
      }, 10000);
    }
  }, [deviceCode, loaded]);

  useEffect(() => {
    if (deviceCode) {
      fetchAds();
      setAdsFetchFromApi(true);
    }
  }, [fetchAds, deviceCode]);
  const filteredAds = useMemo(() => {
    const filteredCampaigsWithoutView = ads.filter(
      (campaign) => campaign.campaignView
    );

    const widgets = ads.filter((campaign) =>
      ["time", "weather"].includes(campaign.adId)
    );

    const grouped = filteredCampaigsWithoutView.reduce(
      (acc: [Ad[], Ad[]], obj) => {
        if (obj.campaignView === 1) {
          acc[0].push(obj);
        } else {
          acc[1].push(obj);
        }
        return acc;
      },
      [[], []]
    );

    const filteredGroup = grouped.filter((group) => group.length > 0);

    return {
      adGroups: filteredGroup,
      widgets,
    };
  }, [ads]);

  useEffect(() => {
    if (request) {
      router.replace("/player");
    }
  }, [request]);

  localLoaded.current = loaded;
  localItem.current = item;

  const contextValues = {
    ...filteredAds,
    screenConfig,
    sendLog,
    adsLoading,
    request,
    deviceCode,
    safeToPlay,
    adsBackgroundLoading,
  };

  return (
    <AdContext.Provider value={contextValues}>{children}</AdContext.Provider>
  );
}

export default AdProvider;
