import useAsyncStorage from "@/hooks/useAsyncStorage";
import useDeviceCode from "@/hooks/useDeviceCode";
import useSocket from "@/hooks/useSocket";
import { adNotActive } from "@/utils";
import { Directory, File as ExpoFile, Paths } from "expo-file-system";
import { useRouter } from "expo-router";
import React, {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export interface ContextProps {
  adGroups: Ad[][];
  widgets: Ad[];
  sendLog: (params: SendLogParams) => void;
  adsLoading: boolean;
  request: boolean;
  screenConfig: ScreenConfig;
  deviceCode: LocalState | undefined;
  safeToPlay: boolean;
  adsBackgroundLoading: boolean;
  downloadProgressData: { downloaded: number; total: number } | null;
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
  downloadProgressData: null,
});

function AdProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    console.log("[BOOT] [INFO] AdProvider initialized.");
  }, []);

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
  const [downloadProgressData, setDownloadProgressData] =
    useState<ContextProps["downloadProgressData"]>(null);

  const fetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setReceivedAds = useCallback(
    async (data: any) => {
      const config = data.config as ScreenConfig;
      const ads = data.data[0].campaigns as Ad[];

      try {
        const adsWithRemovedExpiredAds = ads.filter((ad) => !adNotActive(ad));
        const mediaUrls = adsWithRemovedExpiredAds.map((ad) => ad.adUrl);
        const cachedUrls = await cacheAdsInBackground(mediaUrls);

        const adsWithCachedUris = adsWithRemovedExpiredAds.map((ad, index) => ({
          ...ad,
          adUrl: cachedUrls[index],
          remoteUrl: ad.adUrl,
        }));

        console.log("[CACHE] [INFO] Setting ads state...");
        setAds(adsWithCachedUris);
        setItem({ ads: adsWithCachedUris, screen: config });
        setScreenConfig(config);
        console.log("[CACHE] [INFO] Loaded ads from background successfully.");

        setSafeToPlay(true);
      } catch (error) {
        console.error("[CACHE] [ERROR] Failed to set received ads:", error);
        // Fallback: use uncached URLs to avoid recursion and still enable playback
        try {
          const adsWithRemoteUris = ads.map((ad) => ({
            ...ad,
            adUrl: ad.adUrl,
          }));
          setAds(adsWithRemoteUris);
          setItem({ ads: adsWithRemoteUris, screen: config });
          setScreenConfig(config);
          setSafeToPlay(true);
        } catch (innerError) {
          console.error("[CACHE] [ERROR] Fallback failed for setting received ads:", innerError);
        }
      }
    },
    [setItem]
  );

  const { sendLog } = useSocket({
    onReceiveBackendUrl: setBackendUrl,
    onReceiveAds: setReceivedAds,
    deviceCode,
  });

  // Utility function to delete media files from directory
  const deleteMediaFiles = (
    documentDir: Directory,
    isForeground: boolean = false
  ) => {
    const dirInfo = documentDir.info();
    if (dirInfo.exists) {
      if (isForeground) {
        console.log("[CACHE] [INFO] Deleting obsolete local files...");
      }

      const contents = documentDir.list();
      const targetExtensions = [
        // Image extensions
        ".jpg",
        ".jpeg",
        ".png",
        ".gif",
        ".bmp",
        ".webp",
        // Video extensions
        ".mp4",
        ".mov",
        ".avi",
        ".mkv",
        ".wmv",
        ".flv",
      ];

      const mediaFiles = contents.filter(
        (item) =>
          item instanceof ExpoFile &&
          targetExtensions.some((ext) => item.name.toLowerCase().endsWith(ext))
      );

      for (const file of mediaFiles) {
        try {
          if (isForeground) {
            console.log(`[CACHE] [INFO] Deleted obsolete file: ${file.name}`);
          }
          file.delete();
        } catch (error) {
          console.error(`Failed to delete file: ${file.name}`, error);
        }
      }

      if (isForeground) {
        console.log("[CACHE] [INFO] Completed deletion of obsolete local media files.");
      }
    } else {
      if (isForeground) {
        console.log("[CACHE] [INFO] Local documents directory does not exist yet.");
      }
    }
  };

  // Utility function to download a single file with retries
  const downloadFileWithRetries = async (
    url: string,
    documentDir: Directory,
    localPaths: string[],
    delay: number
  ) => {
    const filename = url.split("/").pop() || "unknown";
    const targetFile = new ExpoFile(documentDir, filename);

    // Check if file already exists and is valid
    const existingFileInfo = targetFile.info();
    if (
      existingFileInfo.exists &&
      existingFileInfo?.size &&
      existingFileInfo.size > 0
    ) {
      console.log(
        `[CACHE] [INFO] Cache Hit: ${filename} is valid (size: ${existingFileInfo.size} bytes). Skipping download.`
      );
      localPaths.push(targetFile.uri);
      return;
    } else if (existingFileInfo.exists) {
      console.log(`[CACHE] [INFO] Deleting invalid/corrupt cached file: ${filename}`);
      targetFile.delete();
    }

    let downloadSuccess = false;
    const maxRetries = 3;
    let retryCount = 0;

    while (!downloadSuccess && retryCount < maxRetries) {
      try {
        console.log(
          `[CACHE] [INFO] Cache Miss: Downloading ${filename} from URL (Attempt ${
            retryCount + 1
          }/${maxRetries})`
        );

        const downloadedFile = await ExpoFile.downloadFileAsync(
          url,
          targetFile,
          {
            headers: {
              Accept: "*/*",
              "User-Agent": "YourApp/1.0",
            },
          }
        );

        // Validate the downloaded file
        if (!validateDownloadedFile(targetFile)) {
          throw new Error(`File validation failed for ${filename}`);
        }

        localPaths.push(downloadedFile.uri);
        downloadSuccess = true;

        if (retryCount > 0) {
          console.log(
            `[CACHE] [INFO] Successfully downloaded ${filename} after ${
              retryCount + 1
            } attempts.`
          );
        } else {
          console.log(
            `[CACHE] [INFO] Download Successful: ${filename} (size: ${targetFile.info().size} bytes).`
          );
        }
      } catch (error) {
        retryCount++;
        console.error(
          `[CACHE] [ERROR] Download Failed for ${filename} on attempt ${retryCount}/${maxRetries}:`,
          error
        );

        if (retryCount === maxRetries) {
          console.error(
            `[CACHE] [ERROR] Download Failed for ${filename} after ${maxRetries} attempts. Using original URL as fallback.`
          );
          localPaths.push(url); // Use original URL as fallback
        } else {
          console.log(`[CACHE] [INFO] Waiting ${delay}ms before retrying download...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
  };

  const validateDownloadedFile = (file: ExpoFile) => {
    const info = file.info();

    // Check file exists and has size
    if (!info.exists || info.size === 0) {
      console.error(
        `[CACHE] [ERROR] File validation failed for ${file.name}: File does not exist or is empty.`
      );
      return false;
    }

    // Check file extension matches expected type
    const extension = file.name.split(".").pop()?.toLowerCase();
    const validExtensions = [
      // Image extensions
      ".jpg",
      ".jpeg",
      ".png",
      ".gif",
      ".bmp",
      ".webp",
      // Video extensions
      ".mp4",
      ".mov",
      ".avi",
      ".mkv",
      ".wmv",
      ".flv",

      // HTML extensions
      ".html",
      ".htm",
    ];

    if (!validExtensions.includes(`.${extension}`)) {
      console.error(`[CACHE] [ERROR] File validation failed for ${file.name}: Invalid extension.`);
      return false;
    }

    console.log(
      `[CACHE] [INFO] File validation passed for ${file.name} (size: ${info.size} bytes).`
    );
    return true;
  };

  // Main download function that handles the core logic
  const performAdDownload = async (
    urls: string[],
    setLoading: (loading: boolean) => void,
    logPrefix: string,
    isForeground: boolean,
    retryDelay: number
  ) => {
    try {
      setLoading(true);

      if (isForeground) {
        console.log(`[CACHE] [INFO] Starting download/sync for ${urls.length} media assets.`);
      } else {
        console.log(`[CACHE] [INFO] Starting background download/sync for ${urls.length} media assets.`);
      }

      const localPaths: string[] = [];
      const documentDir = Paths.document;

      // Delete all existing files before downloading
      deleteMediaFiles(documentDir, isForeground);

      // Download each URL sequentially
      setDownloadProgressData({
        downloaded: 0,
        total: 1,
      });
      for (const url of urls) {
        await downloadFileWithRetries(url, documentDir, localPaths, retryDelay);
        setDownloadProgressData({
          downloaded: localPaths.length,
          total: urls.length,
        });
      }

      if (isForeground) {
        console.log("[CACHE] [INFO] Ad download and cache synchronization completed successfully.");
      } else {
        console.log("[CACHE] [INFO] Background ad download and cache synchronization completed successfully.");
      }

      setDownloadProgressData(null);

      setLoading(false);
      return localPaths;
    } catch (error) {
      console.error("[CACHE] [ERROR] Ad download/cache synchronization failed:", error);
      setLoading(false);
      throw error; // Re-throw to handle in the main functions
    }
  };

  // Background download function
  const cacheAdsInBackground = useCallback(async (urls: string[]) => {
    try {
      return await performAdDownload(
        urls,
        setAdsBackgroundLoading,
        "background",
        false,
        1000 // 1s delay for background
      );
    } catch (error) {
      return cacheAdsInBackground(urls); // Keep your existing recursive retry
    }
  }, []);

  // Foreground download function
  const cacheAds = useCallback(async (urls: string[]) => {
    try {
      return await performAdDownload(
        urls,
        setAdLoading,
        "",
        true, // isForeground
        1000 // 1s fixed delay for foreground (no exponential backoff)
      );
    } catch (error) {
      return await cacheAds(urls); // Keep your existing recursive retry
    }
  }, []);

  const fetchAds = useCallback(async () => {
    if (adsFetchFromApi) return;

    try {
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current);
        fetchTimeoutRef.current = null;
      }

      if (localItem.current) {
        setAds(localItem.current.ads as Ad[]);
        setScreenConfig(localItem.current.screen as ScreenConfig);
        setrequest(true);
        setSafeToPlay(true);
        alreadyUsingLocal.current = true;
        console.log("[BOOT] [INFO] Loaded cached campaigns from local storage on mount.");
        return;
      }
      console.log(
        `[NET] [INFO] Fetching new ads from API: ${backendUrl}/v1/public-advert/campaigns/${deviceCode}`
      );

      const response = await fetch(
        `${backendUrl}/v1/public-advert/campaigns/${deviceCode}`
      );
      if (!response.ok) throw new Error("Failed to fetch");
      const data: { config: ScreenConfig; data: [{ campaigns: Ad[] }] } =
        await response.json();

      setrequest(true);
      const ads = data.data[0].campaigns;
      const adsWithRemovedExpiredAds = ads.filter((ad) => !adNotActive(ad));
      const mediaUrls = adsWithRemovedExpiredAds.map((ad) => ad.adUrl);
      console.log("[CACHE] [INFO] Ads fetched from API. Syncing cache...");

      const cachedUrls = await cacheAds(mediaUrls);
      console.log("[CACHE] [INFO] Cache sync completed.");

      const adsWithCachedUris = ads.map((ad, index) => ({
        ...ad,
        remoteUrl: ad.adUrl,
        adUrl: cachedUrls[index],
      }));
      console.log("[CACHE] [INFO] Setting ads state...");

      setAds(adsWithCachedUris);
      setItem({ ads: adsWithCachedUris, screen: data.config });
      setScreenConfig(data.config);
      setSafeToPlay(true);
      setAdsFetchFromApi(false);
      alreadyUsingLocal.current = false;
    } catch (error: any) {
      console.error("[NET] [ERROR] Fetching ads from API failed:", error);
      if (
        localLoaded.current &&
        localItem.current &&
        !alreadyUsingLocal.current
      ) {
        alreadyUsingLocal.current = true;
        console.log("[BOOT] [INFO] Fetch failed. Using local storage cached campaigns.");

        setAds(localItem.current.ads as Ad[]);
        setScreenConfig(localItem.current.screen as ScreenConfig);
        setrequest(true);
        setSafeToPlay(true);
      } else {
        console.log("[BOOT] [INFO] Nothing in local storage, waiting to retry fetch...");
      }
      console.error(
        `[NET] [ERROR] Retry fetch error: ${error.response?.data?.message || error.message} (Device: ${deviceCode})`
      );
      fetchTimeoutRef.current = setTimeout(() => {
        fetchAds();
      }, 10000);
    }
  }, [deviceCode, loaded, backendUrl]);

  useEffect(() => {
    if (deviceCode && loaded) {
      fetchAds();
      setAdsFetchFromApi(true);
    }
    return () => {
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current);
        fetchTimeoutRef.current = null;
      }
    };
  }, [fetchAds, deviceCode, loaded]);
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
    downloadProgressData,
  };

  return (
    <AdContext.Provider value={contextValues}>{children}</AdContext.Provider>
  );
}

export default AdProvider;
