import { Directory, File as ExpoFile, Paths } from "expo-file-system";
import { StorageAccessFramework, getInfoAsync } from "expo-file-system/legacy";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const logListeners = new Set<(logStr: string) => void>();
export const capturedLogs: string[] = [];

// Save references to original console functions
export const originalLog = console.log;
export const originalWarn = console.warn;
export const originalError = console.error;

let isWriting = false;
let pendingWrite = false;

let cachedDirectoryUri: string | null = null;
let directoryUriListener: ((uri: string | null) => void) | null = null;

export function getCachedDirectoryUri() {
  return cachedDirectoryUri;
}

export function subscribeToDirectoryUri(listener: (uri: string | null) => void) {
  directoryUriListener = listener;
  listener(cachedDirectoryUri);
  return () => {
    if (directoryUriListener === listener) {
      directoryUriListener = null;
    }
  };
}

export function getCapturedLogsString(): string {
  return capturedLogs.join("\n");
}

let cachedLogFileUri: string | null = null;

async function getLogFileUri(files: string[]): Promise<string> {
  if (cachedLogFileUri) {
    const info = await getInfoAsync(cachedLogFileUri);
    if (info.exists) {
      return cachedLogFileUri;
    }
  }

  const storedUri = await AsyncStorage.getItem("LOG_FILE_URI");
  if (storedUri) {
    const info = await getInfoAsync(storedUri);
    if (info.exists) {
      cachedLogFileUri = storedUri;
      return storedUri;
    }
  }

  const targetSuffix = `/app-logs.txt`;
  const existingUri = files.find((f) => decodeURIComponent(f).endsWith(targetSuffix));
  if (existingUri) {
    cachedLogFileUri = existingUri;
    await AsyncStorage.setItem("LOG_FILE_URI", existingUri);
    return existingUri;
  }

  const newUri = await StorageAccessFramework.createFileAsync(
    cachedDirectoryUri!,
    "app-logs.txt",
    "text/plain"
  );
  cachedLogFileUri = newUri;
  await AsyncStorage.setItem("LOG_FILE_URI", newUri);
  return newUri;
}

export async function loadLogsFromFile() {
  try {
    let content = "";
    if (Platform.OS === "android" && cachedDirectoryUri) {
      try {
        const files = await StorageAccessFramework.readDirectoryAsync(cachedDirectoryUri);
        const fileUri = await getLogFileUri(files);
        content = await StorageAccessFramework.readAsStringAsync(fileUri);
      } catch (safReadErr) {
        originalError("Error reading logs from SAF on start:", safReadErr);
      }
    } else {
      const logDirectory = Platform.OS === "android"
        ? new Directory("file:///storage/emulated/0/Android/data/com.crimson.cjtronicsdevice/files")
        : Paths.document;
      
      const file = new ExpoFile(logDirectory, "app-logs.txt");
      if (file.exists) {
        content = file.textSync() || "";
      }
    }

    if (content) {
      const fileLines = content.split("\n").filter((l) => l.trim().length > 0);
      const startupLogs = [...capturedLogs];
      
      capturedLogs.length = 0;
      capturedLogs.push(...fileLines);
      
      for (const log of startupLogs) {
        if (!capturedLogs.includes(log)) {
          capturedLogs.push(log);
        }
      }
      
      if (capturedLogs.length > 300) {
        capturedLogs.splice(0, capturedLogs.length - 300);
      }
      originalLog("Loaded", fileLines.length, "logs from file. Total:", capturedLogs.length);
    }
  } catch (e) {
    originalError("Error loading logs from file on startup:", e);
  }
}

export async function loadLogDirectory() {
  try {
    const uri = await AsyncStorage.getItem("LOG_DIRECTORY_URI");
    cachedDirectoryUri = uri;
    if (directoryUriListener) {
      directoryUriListener(uri);
    }
    // Load historical logs
    await loadLogsFromFile();
  } catch (e) {
    originalError("Failed to load log directory URI:", e);
  }
}

export async function setLogDirectoryUri(uri: string | null) {
  cachedDirectoryUri = uri;
  cachedLogFileUri = null;
  if (directoryUriListener) {
    directoryUriListener(uri);
  }
  try {
    await AsyncStorage.removeItem("LOG_FILE_URI");
    if (uri) {
      await AsyncStorage.setItem("LOG_DIRECTORY_URI", uri);
    } else {
      await AsyncStorage.removeItem("LOG_DIRECTORY_URI");
    }
  } catch (e) {
    originalError("Failed to save/remove log directory URI:", e);
  }
  // Try loading logs from the new folder if we changed directory
  if (uri) {
    await loadLogsFromFile();
  }
  performWrite();
}

export async function requestAndSetLogDirectory(): Promise<boolean> {
  try {
    const permissions = await StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (permissions.granted) {
      await setLogDirectoryUri(permissions.directoryUri);
      return true;
    }
    return false;
  } catch (e) {
    originalError("Failed to request directory permissions:", e);
    return false;
  }
}

async function writeToFallbackFile() {
  try {
    const logDirectory = Platform.OS === "android"
      ? new Directory("file:///storage/emulated/0/Android/data/com.crimson.cjtronicsdevice/files")
      : Paths.document;

    if (!logDirectory.exists) {
      logDirectory.create();
    }

    const file = new ExpoFile(logDirectory, "app-logs.txt");
    if (!file.exists) {
      file.create();
    }
    originalLog("Fallback: writing logs to file", capturedLogs.length);
    await file.write(capturedLogs.join("\n"));
  } catch (e) {
    originalError("Error writing to fallback file:", e);
  }
}

async function performWrite() {
  if (isWriting) {
    pendingWrite = true;
    return;
  }
  isWriting = true;
  try {
    if (Platform.OS === "android" && cachedDirectoryUri) {
      try {
        const files = await StorageAccessFramework.readDirectoryAsync(cachedDirectoryUri);
        const fileUri = await getLogFileUri(files);
        
        await StorageAccessFramework.writeAsStringAsync(fileUri, capturedLogs.join("\n"));
        originalLog("SAF: logs written to file", capturedLogs.length);
      } catch (safError) {
        originalError("Error writing logs to SAF directory, falling back:", safError);
        await writeToFallbackFile();
      }
    } else {
      await writeToFallbackFile();
    }
  } catch (e) {
    originalError("Error writing logs:", e);
  } finally {
    isWriting = false;
    if (pendingWrite) {
      pendingWrite = false;
      performWrite();
    }
  }
}

export function writeLogsToFile() {
  performWrite();
}

export function addCapturedLog(type: "log" | "warn" | "error", ...args: any[]) {
  const timestamp = new Date().toISOString();
  
  const rawMessage = args
    .map((arg) => {
      if (arg instanceof Error) {
        return arg.stack || arg.message;
      }
      if (arg && typeof arg === "object") {
        try {
          return JSON.stringify(arg);
        } catch (e) {
          return "[Circular Object]";
        }
      }
      return String(arg);
    })
    .join(" ");

  let level = type.toUpperCase();
  if (level === "LOG") {
    level = "INFO";
  }
  
  let category = "SYSTEM";
  let message = rawMessage;

  // Match: [CATEGORY] [LEVEL] Message
  const matchTwoBrackets = rawMessage.match(/^\[([A-Z0-9_-]+)\]\s+\[([A-Z0-9_-]+)\]\s*(.*)$/i);
  if (matchTwoBrackets) {
    category = matchTwoBrackets[1].toUpperCase();
    level = matchTwoBrackets[2].toUpperCase();
    message = matchTwoBrackets[3];
  } else {
    // Match: [CATEGORY] Message
    const matchOneBracket = rawMessage.match(/^\[([A-Z0-9_-]+)\]\s*(.*)$/i);
    if (matchOneBracket) {
      category = matchOneBracket[1].toUpperCase();
      message = matchOneBracket[2];
    }
  }

  const logStr = `[${timestamp}] [${category}] [${level}] ${message}`;

  capturedLogs.push(logStr);
  if (capturedLogs.length > 300) {
    capturedLogs.shift();
  }

  writeLogsToFile();
  logListeners.forEach((listener) => listener(logStr));
}

export function setupGlobalLogger() {
  console.log = (...args: any[]) => {
    if (__DEV__) {
      originalLog(...args);
    }
    addCapturedLog("log", ...args);
  };

  console.warn = (...args: any[]) => {
    if (__DEV__) {
      originalWarn(...args);
    }
    addCapturedLog("warn", ...args);
  };

  console.error = (...args: any[]) => {
    if (__DEV__) {
      originalError(...args);
    }
    addCapturedLog("error", ...args);
  };
}
