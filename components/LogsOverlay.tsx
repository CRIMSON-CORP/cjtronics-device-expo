import React, { useEffect, useState, useRef } from "react";
import { View, Text, TouchableOpacity, ScrollView, Platform, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { logListeners, capturedLogs } from "@/utils/logger";

interface ParsedLog {
  timestamp: string;
  category: string;
  level: string;
  message: string;
  raw: string;
}

function parseLog(log: string): ParsedLog {
  const match = log.match(/^\[([^\]]+)\]\s+\[([^\]]+)\]\s+\[([^\]]+)\]\s*(.*)$/);
  if (match) {
    return {
      timestamp: match[1],
      category: match[2],
      level: match[3],
      message: match[4],
      raw: log,
    };
  }
  return {
    timestamp: "",
    category: "SYSTEM",
    level: "INFO",
    message: log,
    raw: log,
  };
}

export default function LogsOverlay() {
  const insets = useSafeAreaInsets();
  const [isOpen, setIsOpen] = useState(false); // start collapsed
  const [logs, setLogs] = useState<ParsedLog[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollViewRef = useRef<ScrollView>(null);

  const [isButtonVisible, setIsButtonVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Use a ref buffer to accumulate logs safely without triggering react state updates during render phases
  const pendingLogsRef = useRef<ParsedLog[]>([]);

  const handleGlobalTouch = () => {
    setIsButtonVisible(true);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      setIsButtonVisible(false);
    }, 4000);
  };

  const openLogs = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setIsOpen(true);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);
  useEffect(() => {
    if (!isOpen) {
      setIsButtonVisible(false);
    } else {
      setAutoScroll(true);
    }
  }, [isOpen]);

  useEffect(() => {
    // Load existing logs
    pendingLogsRef.current = capturedLogs.map(parseLog);
    setLogs([...pendingLogsRef.current]);

    const listener = (newLogStr: string) => {
      if (isPaused) return;
      const parsed = parseLog(newLogStr);
      pendingLogsRef.current.push(parsed);
      if (pendingLogsRef.current.length > 200) {
        pendingLogsRef.current.shift();
      }
    };

    logListeners.add(listener);

    // Sync the ref buffer to react state every 100ms
    const interval = setInterval(() => {
      setLogs((prev) => {
        const currentLength = pendingLogsRef.current.length;
        const prevLength = prev.length;
        if (
          currentLength !== prevLength ||
          (currentLength > 0 &&
            pendingLogsRef.current[currentLength - 1].raw !== prev[prevLength - 1]?.raw)
        ) {
          return [...pendingLogsRef.current];
        }
        return prev;
      });
    }, 100);

    return () => {
      logListeners.delete(listener);
      clearInterval(interval);
    };
  }, [isPaused]);

  useEffect(() => {
    if (autoScroll && isOpen) {
      const timer = setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [logs, isOpen, autoScroll]);

  const getLogColor = (level: string, category: string) => {
    if (level === "ERROR") return "#f87171"; // text-red-400
    if (level === "WARN" || level === "WARNING") return "#fbbf24"; // text-amber-400

    switch (category) {
      case "BOOT":
        return "#22d3ee"; // text-cyan-400
      case "CACHE":
        return "#c084fc"; // text-purple-400
      case "NET":
        return "#34d399"; // text-emerald-400
      case "PLAYBACK":
        return "#e879f9"; // text-fuchsia-400
      default:
        return "#d4d4d8"; // text-zinc-300
    }
  };

  const clearLogs = () => {
    pendingLogsRef.current = [];
    setLogs([]);
  };

  if (!isOpen) {
    return (
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: "100%",
          height: "100%",
        }}
        onTouchStart={handleGlobalTouch}
      >
        {isButtonVisible && (
          <TouchableOpacity
            onPress={openLogs}
            className="absolute px-3 py-2 border border-zinc-700/50 rounded-full flex flex-row items-center gap-2 z-[9999]"
            style={{
              top: Math.max(insets.top, 16),
              left: Math.max(insets.left, 16),
            }}
          >
            <Text className="text-emerald-400 text-xs font-bold font-mono">⚡ Logs</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  const monoStyle = {
    fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
  };

  return (
    <View
      className="absolute top-0 left-0 right-0 bottom-0 bg-black/60 z-[9999]"
      style={{
        width: "100%",
        height: "100%",
      }}
    >
      <View
        className="absolute border border-zinc-800 rounded-2xl overflow-hidden"
        style={{
          top: Math.max(insets.top, 16),
          left: Math.max(insets.left, 16),
          right: Math.max(insets.right, 16),
          bottom: Math.max(insets.bottom, 16) + 24,
        }}
      >
        {/* Header */}
        <View className="flex flex-row items-center justify-between px-4 py-3 bg-zinc-900 border-b border-zinc-800">
          <View className="flex flex-row items-center gap-2">
            <View className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <Text className="text-white font-bold text-sm font-mono">App Console Logs</Text>
          </View>

          <View className="flex flex-row gap-2 px-3">
            <Pressable
              onPress={() => setIsPaused(!isPaused)}
              style={{
                paddingHorizontal: 6,
                paddingVertical: 4,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: isPaused ? "#b45309" : "#3f3f46", // amber-700 : zinc-700
                backgroundColor: isPaused ? "rgba(120, 53, 4, 0.2)" : "#27272a", // bg-amber-950/20 : bg-zinc-800
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  fontFamily: monoStyle.fontFamily,
                  fontWeight: "500",
                  color: isPaused ? "#fbbf24" : "#d4d4d8", // amber-400 : zinc-300
                }}
              >
                {isPaused ? "▶ Resume" : "⏸ Pause"}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setAutoScroll(!autoScroll)}
              style={{
                paddingHorizontal: 6,
                paddingVertical: 4,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: autoScroll ? "#065f46" : "#3f3f46", // emerald-800 : zinc-700
                backgroundColor: "#27272a",
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  fontFamily: monoStyle.fontFamily,
                  fontWeight: "500",
                  color: autoScroll ? "#34d399" : "#ffffff", // emerald-400 : white
                }}
              >
                {autoScroll ? "↓ Auto" : "◌ Manual"}
              </Text>
            </Pressable>

            <Pressable
              onPress={clearLogs}
              style={{
                paddingHorizontal: 6,
                paddingVertical: 4,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: "#b91c1c", // red-700
                backgroundColor: "#27272a",
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  fontFamily: monoStyle.fontFamily,
                  fontWeight: "500",
                  color: "#f87171", // red-400
                }}
              >
                🗑️ Clear
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setIsOpen(false)}
              style={{
                paddingHorizontal: 6,
                paddingVertical: 4,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: "#b91c1c", // red-700
                backgroundColor: "#27272a",
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  fontFamily: monoStyle.fontFamily,
                  fontWeight: "700",
                  color: "#f87171", // red-400
                }}
              >
                Close
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Logs Stream */}
        <ScrollView
          ref={scrollViewRef}
          className="flex-1 p-3 bg-black/40 rounded-2xl"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.4)" }}
          contentContainerStyle={{ flexGrow: 1, paddingBottom: 20 }}
          onScrollBeginDrag={() => setAutoScroll(false)}
          onLayout={() => {
            if (autoScroll) {
              setTimeout(() => {
                scrollViewRef.current?.scrollToEnd({ animated: false });
              }, 60);
            }
          }}
          onContentSizeChange={() => {
            if (autoScroll) {
              setTimeout(() => {
                scrollViewRef.current?.scrollToEnd({ animated: false });
              }, 60);
            }
          }}
        >
          {logs.length === 0 ? (
            <Text className="text-zinc-500 text-xs font-mono text-center mt-6">
              Console is empty. Waiting for logs...
            </Text>
          ) : (
            logs.map((log, index) => {
              const color = getLogColor(log.level, log.category);
              const timeStr = log.timestamp ? log.timestamp.split("T")[1].slice(0, -1) : "";

              return (
                <View key={index} className="flex flex-row flex-wrap mb-1">
                  {timeStr ? (
                    <Text
                      className="text-zinc-500 text-xs mr-1.5"
                      style={[monoStyle, { color: "#71717a" }]}
                    >
                      [{timeStr}]
                    </Text>
                  ) : null}
                  {log.category ? (
                    <Text
                      className="text-zinc-400 text-xs font-bold mr-1.5"
                      style={[monoStyle, { color: "#a1a1aa" }]}
                    >
                      [{log.category}]
                    </Text>
                  ) : null}
                  <Text className="text-xs flex-1" style={[monoStyle, { color }]}>
                    {log.message}
                  </Text>
                </View>
              );
            })
          )}
        </ScrollView>
      </View>
    </View>
  );
}
