import useAsyncStorage from "@/hooks/useAsyncStorage";
import AsyncStorage from "@react-native-async-storage/async-storage";
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

const METADATA_KEY = "cache-metadata";

interface FileMetadata {
  size: number;
  lastModified: string | null;
  etag: string | null;
}

const getCacheMetadata = async (): Promise<Record<string, FileMetadata>> => {
  try {
    const val = await AsyncStorage.getItem(METADATA_KEY);
    return val ? JSON.parse(val) : {};
  } catch (e) {
    console.error("[CACHE] Error reading cache-metadata from AsyncStorage:", e);
    return {};
  }
};

const updateCacheMetadata = async (filename: string, metadata: FileMetadata) => {
  try {
    const current = await getCacheMetadata();
    current[filename] = metadata;
    await AsyncStorage.setItem(METADATA_KEY, JSON.stringify(current));
  } catch (e) {
    console.error("[CACHE] Error updating cache-metadata in AsyncStorage:", e);
  }
};

const removeCacheMetadata = async (filename: string) => {
  try {
    const current = await getCacheMetadata();
    delete current[filename];
    await AsyncStorage.setItem(METADATA_KEY, JSON.stringify(current));
  } catch (e) {
    console.error("[CACHE] Error removing cache-metadata from AsyncStorage:", e);
  }
};

const pruneCacheMetadata = async (activeFilenames: Set<string>) => {
  try {
    const current = await getCacheMetadata();
    let changed = false;
    for (const key of Object.keys(current)) {
      if (!activeFilenames.has(key)) {
        delete current[key];
        changed = true;
      }
    }
    if (changed) {
      await AsyncStorage.setItem(METADATA_KEY, JSON.stringify(current));
    }
  } catch (e) {
    console.error("[CACHE] Error pruning cache-metadata:", e);
  }
};

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

  // Utility function to delete media files from directory that are not in the active campaigns list
  const deleteObsoleteMediaFiles = (
    documentDir: Directory,
    activeUrls: string[],
    isForeground: boolean = false
  ) => {
    const dirInfo = documentDir.info();
    if (dirInfo.exists) {
      if (isForeground) {
        console.log("[CACHE] [INFO] Pruning obsolete local files...");
      }

      const activeFilenames = new Set(
        activeUrls.map((url) => url.split("/").pop() || "").filter(Boolean)
      );

      // Trigger AsyncStorage metadata pruning
      pruneCacheMetadata(activeFilenames).catch((err) => {
        console.error("[CACHE] Error pruning cache metadata:", err);
      });

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

      let deletedCount = 0;
      for (const file of mediaFiles) {
        if (file instanceof ExpoFile && !activeFilenames.has(file.name)) {
          try {
            if (isForeground) {
              console.log(`[CACHE] [INFO] Deleted obsolete file: ${file.name}`);
            }
            file.delete();
            deletedCount++;
          } catch (error) {
            console.error(`Failed to delete file: ${file.name}`, error);
          }
        }
      }

      if (isForeground) {
        console.log(`[CACHE] [INFO] Completed deletion of ${deletedCount} obsolete local media files.`);
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

    // Check if file already exists
    const existingFileInfo = targetFile.info();
    if (
      existingFileInfo.exists &&
      existingFileInfo.size &&
      existingFileInfo.size > 0
    ) {
      console.log(`[CACHE] [INFO] File exists locally: ${filename}. Checking for server updates...`);
      
      let shouldDownload = false;
      let remoteMetadata: { contentLength: number | null; etag: string | null; lastModified: string | null } | null = null;
      
      try {
        // We do a fetch HEAD call
        const headResponse = await fetch(url, {
          method: "HEAD",
        });
        
        if (headResponse.ok) {
          const contentLengthStr = headResponse.headers.get("content-length");
          const etagStr = headResponse.headers.get("etag");
          const lastModifiedStr = headResponse.headers.get("last-modified");
          
          remoteMetadata = {
            contentLength: contentLengthStr ? parseInt(contentLengthStr, 10) : null,
            etag: etagStr ? etagStr.replace(/["']/g, "") : null,
            lastModified: lastModifiedStr || null,
          };
        } else {
          console.warn(`[CACHE] HEAD check failed with status ${headResponse.status} for ${filename}. Falling back to GET Range request check.`);
          // Some CDNs might block HEAD but allow GET. Let's try to get headers using a range GET of 0-0 bytes
          const rangeResponse = await fetch(url, {
            method: "GET",
            headers: { Range: "bytes=0-0" }
          });
          if (rangeResponse.ok) {
            const contentLengthStr = rangeResponse.headers.get("content-range")?.split("/")?.pop() || rangeResponse.headers.get("content-length");
            const etagStr = rangeResponse.headers.get("etag");
            const lastModifiedStr = rangeResponse.headers.get("last-modified");
            remoteMetadata = {
              contentLength: contentLengthStr ? parseInt(contentLengthStr, 10) : null,
              etag: etagStr ? etagStr.replace(/["']/g, "") : null,
              lastModified: lastModifiedStr || null,
            };
          }
        }
      } catch (err) {
        console.warn(`[CACHE] Network check failed when querying headers for ${filename}:`, err);
      }
      
      if (remoteMetadata) {
        // Compare with local file size
        const localSize = existingFileInfo.size;
        const remoteSize = remoteMetadata.contentLength;
        
        if (remoteSize !== null && localSize !== remoteSize) {
          console.log(`[CACHE] [INFO] Size mismatch for ${filename}. Local: ${localSize} bytes, Remote: ${remoteSize} bytes. Will re-download.`);
          shouldDownload = true;
        } else {
          // Compare with cached metadata (ETag & Last-Modified)
          const localMetadata = (await getCacheMetadata())[filename];
          if (localMetadata) {
            const etagChanged = !!(remoteMetadata.etag && localMetadata.etag && remoteMetadata.etag !== localMetadata.etag);
            const lastModifiedChanged = !!(remoteMetadata.lastModified && localMetadata.lastModified && remoteMetadata.lastModified !== localMetadata.lastModified);
            
            if (etagChanged || lastModifiedChanged) {
              console.log(
                `[CACHE] [INFO] Metadata changed for ${filename}. ` +
                `(ETag changed: ${etagChanged}, Last-Modified changed: ${lastModifiedChanged}). Will re-download.`
              );
              shouldDownload = true;
            }
          }
        }
      } else {
        // If we couldn't get remote headers (e.g. network offline, CDN blocks, etc.),
        // we fallback to trusting the existing local file rather than redownloading or streaming.
        console.log(`[CACHE] [INFO] Server metadata unavailable. Trusting existing cached file: ${filename}`);
      }
      
      if (!shouldDownload) {
        console.log(`[CACHE] [INFO] Cache Hit: ${filename} is up-to-date. Skipping download.`);
        localPaths.push(targetFile.uri);
        
        // Ensure local metadata entry is saved if we had a success from HEAD but no metadata was stored yet
        if (remoteMetadata) {
          await updateCacheMetadata(filename, {
            size: existingFileInfo.size,
            etag: remoteMetadata.etag,
            lastModified: remoteMetadata.lastModified
          });
        }
        return;
      } else {
        // Delete the outdated local file before re-downloading
        console.log(`[CACHE] [INFO] Deleting outdated local file: ${filename}`);
        targetFile.delete();
        await removeCacheMetadata(filename);
      }
    } else if (existingFileInfo.exists) {
      console.log(`[CACHE] [INFO] Deleting invalid/corrupt cached file: ${filename}`);
      targetFile.delete();
      await removeCacheMetadata(filename);
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

        // Remove headers completely (so it uses system User-Agent) to avoid CDN 403 blocks
        const downloadedFile = await ExpoFile.downloadFileAsync(url, targetFile);

        // Validate the downloaded file
        if (!validateDownloadedFile(targetFile)) {
          throw new Error(`File validation failed for ${filename}`);
        }

        // Save metadata on successful download
        try {
          const finalInfo = targetFile.info();
          if (finalInfo.exists && finalInfo.size) {
            const headResponse = await fetch(url, { method: "HEAD" });
            let etag: string | null = null;
            let lastModified: string | null = null;
            if (headResponse.ok) {
              etag = headResponse.headers.get("etag")?.replace(/["']/g, "") || null;
              lastModified = headResponse.headers.get("last-modified") || null;
            }
            await updateCacheMetadata(filename, {
              size: finalInfo.size,
              etag,
              lastModified
            });
          }
        } catch (metaErr) {
          console.warn(`[CACHE] Failed to save metadata for downloaded file ${filename}:`, metaErr);
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

      // Smart pruning: only delete obsolete files no longer present in incoming URLs
      deleteObsoleteMediaFiles(documentDir, urls, isForeground);

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
      throw error; // Re-throw to handle in the retry function
    }
  };

  // Wrapper function to handle retries with exponential backoff
  const performAdDownloadWithRetry = async (
    urls: string[],
    setLoading: (loading: boolean) => void,
    logPrefix: string,
    isForeground: boolean,
    baseDelay: number,
    maxRetries = 5
  ): Promise<string[]> => {
    let attempts = 0;
    while (attempts < maxRetries) {
      try {
        return await performAdDownload(
          urls,
          setLoading,
          logPrefix,
          isForeground,
          baseDelay
        );
      } catch (error) {
        attempts++;
        if (attempts >= maxRetries) {
          console.error(
            `[CACHE] [ERROR] ${logPrefix ? `[${logPrefix}] ` : ""}Sync failed after ${maxRetries} attempts. Stopping retry loop.`,
            error
          );
          throw error;
        }
        const backoffDelay = baseDelay * Math.pow(2, attempts);
        console.warn(
          `[CACHE] [WARNING] ${logPrefix ? `[${logPrefix}] ` : ""}Sync attempt ${attempts}/${maxRetries} failed. Retrying in ${backoffDelay}ms...`
        );
        await new Promise((resolve) => setTimeout(resolve, backoffDelay));
      }
    }
    throw new Error("Sync failed");
  };

  // Background download function
  const cacheAdsInBackground = useCallback(async (urls: string[]) => {
    try {
      return await performAdDownloadWithRetry(
        urls,
        setAdsBackgroundLoading,
        "background",
        false,
        1000, // 1s base delay
        5 // max 5 retries
      );
    } catch (error) {
      console.error("[CACHE] [ERROR] Background caching sync ultimately failed. Falling back to remote URLs where cached files are missing.", error);
      // Construct fallback localPaths list: for each URL, if it's downloaded, use local URI; otherwise use remote URL.
      const documentDir = Paths.document;
      return urls.map((url) => {
        const filename = url.split("/").pop() || "unknown";
        const file = new ExpoFile(documentDir, filename);
        return file.info().exists ? file.uri : url;
      });
    }
  }, []);

  // Foreground download function
  const cacheAds = useCallback(async (urls: string[]) => {
    try {
      return await performAdDownloadWithRetry(
        urls,
        setAdLoading,
        "foreground",
        true, // isForeground
        1000, // 1s base delay
        5 // max 5 retries
      );
    } catch (error) {
      console.error("[CACHE] [ERROR] Foreground caching sync ultimately failed. Falling back to remote URLs where cached files are missing.", error);
      const documentDir = Paths.document;
      return urls.map((url) => {
        const filename = url.split("/").pop() || "unknown";
        const file = new ExpoFile(documentDir, filename);
        return file.info().exists ? file.uri : url;
      });
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
