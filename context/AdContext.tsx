import useAsyncStorage from "@/hooks/useAsyncStorage";
import useDeviceCode from "@/hooks/useDeviceCode";
import useSocket from "@/hooks/useSocket";
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
        const mediaUrls = ads.map((_data) => _data.adUrl);
        const cachedUrls = await cacheAdsInBackground(mediaUrls);
        const adsWithCachedUris = ads.map((ad, index) => ({
          ...ad,
          adUrl: cachedUrls[index],
        }));

        console.log("setting ads");
        setAds(adsWithCachedUris);
        setItem({ ads: adsWithCachedUris, screen: config });
        setScreenConfig(config);
        console.log("loaded ads from background");

        setSafeToPlay(true);
      } catch (error) {
        console.log(error, " setReceivedAds");
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
          console.log(innerError, " setReceivedAds fallback failed");
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
        console.log("Starting deletion of media and HTML files");
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
        // HTML extensions
        ".html",
        ".htm",
      ];

      const mediaFiles = contents.filter(
        (item) =>
          item instanceof ExpoFile &&
          targetExtensions.some((ext) => item.name.toLowerCase().endsWith(ext))
      );

      for (const file of mediaFiles) {
        try {
          if (isForeground) {
            console.log(`Deleting file: ${file.name}`);
          }
          file.delete();
        } catch (error) {
          console.error(`Failed to delete file: ${file.name}`, error);
        }
      }

      if (isForeground) {
        console.log("Completed deletion of media and HTML files");
      }
    } else {
      if (isForeground) {
        console.log("Directory does not exist");
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
        `File ${filename} already exists and is valid (size: ${existingFileInfo.size}), skipping download`
      );
      localPaths.push(targetFile.uri);
      return;
    } else if (existingFileInfo.exists) {
      console.log(`Deleting invalid existing file ${filename}`);
      targetFile.delete();
    }

    let downloadSuccess = false;
    const maxRetries = 3;
    let retryCount = 0;

    while (!downloadSuccess && retryCount < maxRetries) {
      try {
        console.log(
          `Attempting to download ${filename} from ${url} (attempt ${
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
            `Successfully downloaded ${filename} after ${
              retryCount + 1
            } attempts`
          );
        }
      } catch (error) {
        retryCount++;
        console.log(
          `Failed to download ${filename} on attempt ${retryCount}/${maxRetries}:`,
          error
        );

        if (retryCount === maxRetries) {
          console.log(
            `Failed to download ${filename} after ${maxRetries} attempts, skipping file`
          );
          localPaths.push(url); // Use original URL as fallback
        } else {
          console.log(`Waiting ${delay}ms before retry...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
  };

  const validateDownloadedFile = (file: ExpoFile) => {
    const info = file.info();

    // Check file exists and has size
    if (!info.exists || info.size === 0) {
      console.log(
        `File validation failed: ${file.name} - doesn't exist or empty`
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
    ];

    if (!validExtensions.includes(`.${extension}`)) {
      console.log(`File validation failed: ${file.name} - invalid extension`);
      return false;
    }

    console.log(
      `File validation passed: ${file.name} (size: ${info.size} bytes)`
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
        console.log("downloading ads");
      } else {
        console.log("downloading ads in background");
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
        console.log("downloading ads successful");
      } else {
        console.log("downloading ads in background successful");
      }

      setDownloadProgressData(null);

      setLoading(false);
      return localPaths;
    } catch (error) {
      console.log(error);
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
        console.log("using local on load");
        return;
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
      console.log("setting ads");

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
        " ",
        deviceCode
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
