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

      const adsWithCachedUris = ads.map((ad, index) => ({
        ...ad,
        adUrl: cachedUrls[index],
      }));
      setAds(adsWithCachedUris);
      setItem({ ads: adsWithCachedUris, screen: data.config });
      setScreenConfig(data.config);
      setSafeToPlay(true);
      setAdsFetchFromApi(false);
    } catch (error: any) {
      if (loaded && item?.ads && item?.screen) {
        console.log("fetch failed, using local");

        setAds(item.ads as Ad[]);
        setScreenConfig(item.screen as ScreenConfig);
        setrequest(true);
        setSafeToPlay(true);
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

  const cacheAdsInBackground = useCallback(
    async (urls: string[]) => {
      try {
        // Create an array of download promises
        const downloadPromises = urls.map((url) => {
          const fileUri = `${FileSystem.documentDirectory}${url
            .split("/")
            .pop()}`;
          return FileSystem.downloadAsync(url, fileUri);
        });

        // Wait for all promises to resolve
        const results = await Promise.all(downloadPromises);

        // Get the local paths after download
        const localPaths = results.map((url) => url.uri);
        return localPaths; // All files are downloaded
      } catch (error) {
        console.log("Error during cahing", error);
        await cacheAdsInBackground(urls);
        return [];
      }
    },
    [fetchAds]
  );

  const cacheAds = useCallback(
    async (urls: string[]) => {
      try {
        setAdLoading(true);
        console.log("downloagin ads");

        // Create an array of download promises
        const downloadPromises = urls.map(async (url) => {
          const fileName = url.split("/").pop() as string;
          const fileUri = `${FileSystem.documentDirectory}${fileName}`;
          const info = await FileSystem.getInfoAsync(fileUri);
          if (info.exists) {
            console.log("found exisint media, deleting...");
            await FileSystem.deleteAsync(fileUri);
            console.log("exisint media, deleted...");
          }
          console.log("downloading", url);

          return FileSystem.downloadAsync(url, fileUri);
        });

        // Wait for all promises to resolve
        const results = await Promise.all(downloadPromises);

        console.log("downloading ads successfull");
        // Get the local paths after download
        const localPaths = results.map((url) => url.uri);
        setAdLoading(false);
        return localPaths; // All files are downloaded
      } catch (error: any) {
        console.log("Error downloading ads", error.nessage);
        fetchAds();
        return [];
      }
    },
    [fetchAds]
  );

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
      router.push("/player");
    }
  }, [request]);

  const contextValues = {
    ...filteredAds,
    screenConfig,
    sendLog,
    adsLoading,
    request,
    deviceCode,
    safeToPlay,
  };

  return (
    <AdContext.Provider value={contextValues}>{children}</AdContext.Provider>
  );
}

export default AdProvider;
