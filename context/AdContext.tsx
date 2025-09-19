import useAsyncStorage from "@/hooks/useAsyncStorage";
import useDeviceCode from "@/hooks/useDeviceCode";
import useSocket from "@/hooks/useSocket";
import { File, Paths } from "expo-file-system";
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
  const [backendUrl, setBackendUrl] = useState("https://cjtronics-api.com.ng");
  const localLoaded = useRef(false);
  const localItem = useRef<any>(null);
  const alreadyUsingLocal = useRef(false);

  let fetchTimeout: ReturnType<typeof setTimeout> | null = null;
  const setReceivedAds = useCallback(async (data: any) => {
    const config = data.config as ScreenConfig;
    const ads = data.data[0].campaigns as Ad[];
    console.log(ads.map((ad) => ad.adConfiguration.endTime));

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
    onReceiveBackendUrl: setBackendUrl,
    onReceiveAds: setReceivedAds,
    deviceCode,
  });

  const cacheAdsInBackground = useCallback(async (urls: string[]) => {
    try {
      setAdsBackgroundLoading(true);
      console.log("downloading ads in background");

      const localPaths: string[] = [];
      const documentDir = Paths.document; // Replaces FileSystem.getDocumentDirectoryAsync

      // Delete all existing files before downloading
      const dirInfo = documentDir.info();
      if (dirInfo.exists) {
        const contents = documentDir.list();
        const mediaExtensions = [".mp4", ".mp3", ".jpg", ".jpeg", ".png"];

        const mediaFiles = contents.filter(
          (item) =>
            item instanceof File &&
            mediaExtensions.some((ext) => item.name.endsWith(ext))
        );

        for (const file of mediaFiles) {
          file.delete();
        }
      }

      // Download each URL sequentially
      for (const url of urls) {
        const filename = url.split("/").pop() || "unknown";
        const targetFile = new File(documentDir, filename);
        const downloadedFile = await File.downloadFileAsync(url, targetFile);
        localPaths.push(downloadedFile.uri);
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

      const localPaths: string[] = [];
      const documentDir = Paths.document; // Replaces FileSystem.documentDirectory

      // Get directory info (replaces getInfoAsync)
      const dirInfo = documentDir.info();
      if (dirInfo.exists) {
        console.log("deleting existing media files");

        // Read directory contents (replaces readDirectoryAsync)
        const contents = documentDir.list();
        const mediaExtensions = [".mp4", ".mp3", ".jpg", ".jpeg", ".png"];

        // Filter and delete media files
        const mediaFiles = contents.filter(
          (item) =>
            item instanceof File &&
            mediaExtensions.some((ext) => item.name.endsWith(ext))
        );

        for (const file of mediaFiles) {
          console.log("deleting", file.name);
          file.delete(); // Replaces deleteAsync
        }
        console.log("deleted existing media files");
      }

      console.log("downloading ads");

      // Download each URL sequentially (replaces downloadAsync)
      for (const url of urls) {
        const filename = url.split("/").pop() || "unknown"; // Extract filename safely
        const targetFile = new File(documentDir, filename); // Create File instance

        const fileInfo = targetFile.info();
        if (fileInfo.exists) {
          console.log(
            `File ${filename} already exists at ${targetFile.uri}, skipping download`
          );
          localPaths.push(targetFile.uri); // Add existing file's URI to localPaths
          continue;
        }

        console.log(url, "file url");
        try {
          const downloadedFile = await File.downloadFileAsync(url, targetFile); // New download method
          localPaths.push(downloadedFile.uri);
        } catch (error) {
          console.log(
            `Failed to download File ${filename} for ${url}, skipping file`
          );
          continue;
        }
      }

      console.log("downloading ads successful");
      setAdLoading(false);
      return localPaths; // All files are downloaded sequentially
    } catch (error) {
      console.log(error);
      setAdLoading(false);
      return await cacheAds(urls); // Note: Consider adding retry limits to avoid infinite recursion
    }
  }, []);

  const fetchAds = useCallback(async () => {
    if (adsFetchFromApi) return;
    console.log("fetching ads");

    try {
      if (fetchTimeout) {
        clearTimeout(fetchTimeout);
      }
      console.log(
        `fetching new ads from: ${backendUrl}/v1/public-advert/campaigns/${deviceCode}`
      );

      const response = await fetch(
        `${backendUrl}/v1/public-advert/campaigns/${deviceCode}`
      );
      if (!response.ok) throw new Error("Failed to fetch");
      const data: { config: ScreenConfig; data: [{ campaigns: Ad[] }] } =
        await response.json();

      setrequest(true);
      const ads = data.data[0].campaigns;
      const mediaUrls = ads.map((ad) => ad.adUrl);
      console.log("ads fetch, cahing ads...");

      const cachedUrls = await cacheAds(mediaUrls);
      console.log("cached ads");

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
      console.log(error);
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
  }, [deviceCode, loaded, backendUrl]);

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
