import { useState } from "react";

function useLocalStorage(key: string) {
  const [item, setState] = useState(() => {
    const value = localStorage.getItem(key);
    return value && value !== "undefined" ? JSON.parse(value) : null;
  });

  const setItem = (
    data: string | number | object | boolean,
    saveToLocalStorage = true
  ) => {
    let newState;
    if (typeof data === "function") {
      newState = data(item);
    } else {
      newState = data;
    }
    setState(newState);
    if (saveToLocalStorage) {
      localStorage.setItem(key, JSON.stringify(newState));
    }
  };

  return {
    item,
    setItem,
  };
}

export default useLocalStorage;
