import { melcoProvider } from "./melco.mjs";
import { pulseIdProvider } from "./pulseid.mjs";
import { wilcomProvider } from "./wilcom.mjs";
import { zskProvider } from "./zsk.mjs";

export function getProviders() {
  return [
    wilcomProvider.describe(),
    pulseIdProvider.describe(),
    melcoProvider.describe(),
    zskProvider.describe(),
  ];
}

export function getProvider(id) {
  if (id === "wilcom") return wilcomProvider;
  if (id === "pulse") return pulseIdProvider;
  if (id === "melco") return melcoProvider;
  if (id === "zsk") return zskProvider;
  return null;
}
