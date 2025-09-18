import { WEBSOCKET_URL } from "@/constants/env";
import NetInfo from "@react-native-community/netinfo";
import { useCallback, useEffect, useState } from "react";

function useSocket({
  onReceiveBackendUrl,
  onReceiveAds,
  deviceCode,
}: {
  onReceiveBackendUrl: (data: string) => void;
  onReceiveAds: (data: any) => void;
  deviceCode: LocalState | undefined;
}) {
  const [socket, setSocket] = useState<WebSocket | null>(null);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    if (deviceCode) {
      let newSocket: WebSocket | null = null;
      const connect = () => {
        if (newSocket && newSocket.readyState === WebSocket.OPEN) {
          newSocket.close();
        }
        console.log(WEBSOCKET_URL + `?type=device&id=${deviceCode}`);

        newSocket = new WebSocket(
          WEBSOCKET_URL + `?type=device&id=${deviceCode}`
        );

        newSocket.onopen = () => {
          setSocket(newSocket);
          console.log("Socket connected");
        };
        newSocket.onclose = (event) => {
          if (timeout) {
            clearTimeout(timeout);
            timeout = null;
          }
          setSocket(null);
          console.log("Socket closed, reconnecting in 5 seconds", event.reason);
          timeout = setTimeout(connect, 5000);
        };

        newSocket.onmessage = (event) => {
          const data = JSON.parse(event.data);
          console.log(data, "data");

          if (data.event === "send-to-device") {
            onReceiveAds(data.data);
            return;
          }
          if (data.event === "backend-url") {
            onReceiveBackendUrl(data.data);
          }

          if (data.event === "ping") {
            newSocket?.send(JSON.stringify({ event: "pong" }));
          }
        };
      };
      connect();
      const unsubscribe = NetInfo.addEventListener((state) => {
        if (state.isConnected) {
          if (!newSocket) {
            connect();
          }
        }
      });

      return () => {
        timeout && clearTimeout(timeout);
        unsubscribe();
        if (newSocket) {
          newSocket.close();
          newSocket = null;
        }
      };
    }
  }, [deviceCode]);

  const sendLog = useCallback(
    ({
      adId,
      accountId,
      campaignId,
      messageType,
      uploadRef,
    }: SendLogParams) => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        const currentTime = new Date();

        socket.send(
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
      } else {
        console.log("log cound not be sent as socket connection is lost");
      }
    },
    [socket, deviceCode]
  );

  return {
    sendLog,
  };
}

export default useSocket;
