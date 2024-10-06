import { AdContext } from "@/context/AdContext";
import { useContext } from "react";

export function useAdContext() {
  return useContext(AdContext);
}
