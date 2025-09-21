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

interface LocalState {
  // Define the shape of deviceCode
  id: string;
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
  const maxReconnectAttempts = 10; // Limit reconnection attempts
  const reconnectInterval = 5000; // 5 seconds

  const connect = useCallback(() => {
    if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
      console.error(
        "Max reconnection attempts reached. Stopping reconnection."
      );
      return;
    }

    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.close();
    }

    if (!deviceCode) return;

    console.log(
      `Connecting to WebSocket: ${WEBSOCKET_URL}?type=device&id=${deviceCode}`
    );
    const newSocket = new WebSocket(
      `${WEBSOCKET_URL}?type=device&id=${deviceCode}`
    );

    newSocket.onopen = () => {
      setSocket(newSocket);
      socketRef.current = newSocket;
      reconnectAttemptsRef.current = 0; // Reset attempts on successful connection
      console.log("WebSocket connected");
    };

    newSocket.onclose = (event) => {
      setSocket(null);
      socketRef.current = null;
      console.log(
        `WebSocket closed: ${event.reason}. Reconnecting in ${
          reconnectInterval / 1000
        }s...`
      );

      if (!isUnmountedRef.current) {
        reconnectAttemptsRef.current += 1;
        reconnectTimeoutRef.current = setTimeout(connect, reconnectInterval);
      }
    };

    newSocket.onerror = (event) => {
      console.log("WebSocket error:", event);
      newSocket.close(); // Close the socket on error
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
      } catch (error) {
        console.error("Error parsing WebSocket message:", error);
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
        console.log("Network connected, attempting WebSocket connection...");
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
        setSocket(null);
      }
      unsubscribe();
    };
  }, [connect, deviceCode]);
  const sendLog = useCallback(
    ({
      adId,
      accountId,
      campaignId,
      messageType,
      uploadRef,
    }: SendLogParams) => {
      if (
        socketRef.current &&
        socketRef.current.readyState === WebSocket.OPEN
      ) {
        const currentTime = new Date();
        socketRef.current.send(
          JSON.stringify({
            event: "device-log",
            logs: {
              deviceId: deviceCode,
              adId,
              accountId,
              campaignId,
              messageType,
              loggedOn: new Date(
                currentTime.getTime() - currentTime.getTimezoneOffset() * 60000
              ).toISOString(),
              uploadRef,
            },
          })
        );
        console.log("Log sent:");
      } else {
        console.warn("Cannot send log: WebSocket connection is not open");
      }
    },
    [deviceCode]
  );

  return { sendLog };
}

export default useSocket;
