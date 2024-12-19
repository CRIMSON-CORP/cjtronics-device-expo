import { customAlphabet } from "nanoid/non-secure";
import { useEffect } from "react";
import useAsyncStorage from "./useAsyncStorage";

const nanoid = customAlphabet("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", 10);
const testDeviceCode = "SRC2TS";
function useDeviceCode() {
  const { item: deviceCode, loaded, setItem } = useAsyncStorage("device-code");

  useEffect(() => {
    if (
      (!deviceCode || deviceCode === "undefined" || deviceCode === null) &&
      loaded
    ) {
      setItem(nanoid(6));
    }
  }, [deviceCode, loaded, setItem]);

  return testDeviceCode;
}

export default useDeviceCode;
