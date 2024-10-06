import { WEBSOCKET_URL } from "@/constants/env";
import NetInfo from "@react-native-community/netinfo";
import { useCallback, useEffect, useState } from "react";

function useSocket({
  onReceiveAds,
  deviceCode,
}: {
  onReceiveAds: (data: any) => void;
  deviceCode: LocalState | undefined;
}) {
  const [socket, setSocket] = useState<WebSocket | null>(null);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    if (deviceCode) {
      let newSocket: WebSocket | null = null;
      const connect = () => {
        if (newSocket) {
          newSocket.close();
        }
        newSocket = new WebSocket(
          WEBSOCKET_URL + `?type=device&id=${deviceCode}`
        );

        newSocket.onopen = () => {
          setSocket(newSocket);
        };
        newSocket.onclose = () => {
          if (timeout) {
            clearTimeout(timeout);
            timeout = null;
          }
          setSocket(null);
          console.log("Socket closed, reconnecting in 5 seconds");
          timeout = setTimeout(connect, 5000);
        };

        newSocket.onmessage = (event) => {
          const data = JSON.parse(event.data);
          if (data.event === "send-to-device") {
            onReceiveAds(data.data);
            return;
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
        unsubscribe();
        if (newSocket) {
          newSocket.close();
        }
      };
    }
  }, [deviceCode, onReceiveAds]);

  const sendLog = useCallback(
    ({
      adId,
      accountId,
      campaignId,
      messageType,
      uploadRef,
    }: SendLogParams) => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(
          JSON.stringify({
            event: "device-log",
            logs: {
              deviceId: "90J9R6",
              adId,
              accountId,
              campaignId,
              messageType,
              loggedOn: new Date().toISOString(),
              uploadRef,
            },
          })
        );
      } else {
        console.log("log cound not be sent as socket connection is lost");
      }
    },
    [socket]
  );

  return {
    sendLog,
  };
}

export default useSocket;
