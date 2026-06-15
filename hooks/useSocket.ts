import { WEBSOCKET_URL } from "@/constants/env";
import NetInfo from "@react-native-community/netinfo";
import { useCallback, useEffect, useRef, useState } from "react";

interface SendLogParams {
  adId: string;
  accountId: string;
  campaignId: string;
  messageType: string;
  uploadRef: string;
}

function useSocket({
  onReceiveBackendUrl,
  onReceiveAds,
  deviceCode,
}: {
  onReceiveBackendUrl: (data: string) => void;
  onReceiveAds: (data: any) => void;
  deviceCode: string;
}) {
  const [socket, setSocket] = useState<WebSocket | null>(null);

  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const socketRef = useRef<WebSocket | null>(null);
  const isUnmountedRef = useRef(false);
  const reconnectAttemptsRef = useRef<number>(0);
  const connectionIdRef = useRef<number>(0); // <-- kill stale retries
  const logQueueRef = useRef<SendLogParams[]>([]); // <-- buffer logs

  const maxReconnectAttempts = 10;
  const reconnectInterval = 5000;

  const connect = useCallback(() => {
    if (!deviceCode) return;

    const myConnectionId = ++connectionIdRef.current; // unique for this attempt

    if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
      console.error("[NET] [ERROR] Max reconnection attempts reached. Stopping.");
      return;
    }

    if (socketRef.current) {
      socketRef.current.onopen = null;
      socketRef.current.onclose = null;
      socketRef.current.onerror = null;
      socketRef.current.onmessage = null;
      socketRef.current.close();
      socketRef.current = null;
    }

    console.log(`[NET] [INFO] Connecting WS: ${WEBSOCKET_URL}?type=device&id=${deviceCode}`);
    const newSocket = new WebSocket(
      `${WEBSOCKET_URL}?type=device&id=${deviceCode}`
    );

    newSocket.onopen = () => {
      if (connectionIdRef.current !== myConnectionId) {
        newSocket.close(); // stale connection
        return;
      }
      setSocket(newSocket);
      socketRef.current = newSocket;
      reconnectAttemptsRef.current = 0;
      console.log("[NET] [INFO] WebSocket connected");

      // flush queued logs
      while (logQueueRef.current.length > 0) {
        const log = logQueueRef.current.shift();
        if (log) sendLog(log, true); // force send
      }
    };

    newSocket.onclose = (event) => {
      if (connectionIdRef.current !== myConnectionId) return; // stale
      setSocket(null);
      socketRef.current = null;
      console.warn(
        `[NET] [WARN] WebSocket closed: ${event.reason || "No reason given"}. Reconnecting in ${
          reconnectInterval / 1000
        }s...`
      );

      if (!isUnmountedRef.current) {
        reconnectAttemptsRef.current += 1;
        reconnectTimeoutRef.current = setTimeout(connect, reconnectInterval);
      }
    };

    newSocket.onerror = (event) => {
      console.error("[NET] [ERROR] WebSocket error:", event);
      newSocket.close();
    };

    newSocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.event === "send-to-device") {
          onReceiveAds(data.data);
        } else if (data.event === "backend-url") {
          onReceiveBackendUrl(data.data);
        } else if (data.event === "ping") {
          newSocket.send(JSON.stringify({ event: "pong" }));
        }
      } catch (err) {
        console.error("[NET] [ERROR] WS parse error:", err);
      }
    };

    socketRef.current = newSocket;
  }, [deviceCode, onReceiveAds, onReceiveBackendUrl]);

  useEffect(() => {
    if (!deviceCode) return;
    isUnmountedRef.current = false;
    connect();

    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected && !socketRef.current) {
        console.log("[NET] [INFO] Network back, trying WS reconnect...");
        connect();
      }
    });

    return () => {
      isUnmountedRef.current = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
      setSocket(null);
      unsubscribe();
    };
  }, [connect, deviceCode]);

  const sendLog = useCallback(
    (params: SendLogParams, fromQueue = false) => {
      const currentTime = new Date();
      const logPayload = {
        event: "device-log",
        logs: {
          deviceId: deviceCode,
          ...params,
          loggedOn: new Date(
            currentTime.getTime() - currentTime.getTimezoneOffset() * 60000
          ).toISOString(),
        },
      };

      if (
        socketRef.current &&
        socketRef.current.readyState === WebSocket.OPEN
      ) {
        socketRef.current.send(JSON.stringify(logPayload));
      } else {
        if (!fromQueue) {
          logQueueRef.current.push(params); // save for later
        }
      }
    },
    [deviceCode]
  );

  return { sendLog };
}

export default useSocket;
