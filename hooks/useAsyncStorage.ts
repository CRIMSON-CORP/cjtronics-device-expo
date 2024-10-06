import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";

function useAsyncStorage(key: string | undefined) {
  const [item, setState] = useState<LocalState | undefined>(undefined);
  const [loaded, setLoaded] = useState(false);

  if (!key) {
    console.warn("A Key was not supplied when trying to use Async storage");
  }

  // Retrieve value from AsyncStorage when the component mounts
  useEffect(() => {
    if (key) {
      const loadItem = async () => {
        try {
          const value = await AsyncStorage.getItem(key);
          setState(value && value !== "undefined" ? JSON.parse(value) : null);
          setLoaded(true);
        } catch (error) {
          console.error("Error loading from AsyncStorage:", error);
        }
      };

      loadItem();
    }
  }, [key]);

  // Set item and optionally save it to AsyncStorage
  const setItem = useCallback(
    async (
      data: LocalState | ((prev: LocalState | undefined) => LocalState),
      saveToLocalStorage = true
    ) => {
      console.log("setting item");

      let newState;

      if (typeof data === "function") {
        newState = data(item);
      } else {
        newState = data;
      }

      setState(newState);

      if (saveToLocalStorage && key) {
        try {
          await AsyncStorage.setItem(key, JSON.stringify(newState));
        } catch (error) {
          console.error("Error saving to AsyncStorage:", error);
        }
      }
    },
    [key]
  );

  return {
    item,
    loaded,
    setItem,
  };
}

export default useAsyncStorage;
