export const DEVICE_TYPES = ["mobile", "tablet", "desktop"] as const;
export type DeviceType = (typeof DEVICE_TYPES)[number];

export function isDeviceType(v: unknown): v is DeviceType {
  return DEVICE_TYPES.includes(v as DeviceType);
}

/** Best-effort guess from the browser. Runs on the client only. */
export function detectDevice(): DeviceType {
  const ua = navigator.userAgent;
  const uaData = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData;

  // iPadOS pretends to be a Mac, but Macs have no touch screen
  const isIPad = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  // Android tablets leave "Mobile" out of the user agent
  const isAndroidTablet = /Android/i.test(ua) && !/Mobile/i.test(ua);
  if (isIPad || isAndroidTablet || /Tablet/i.test(ua)) return "tablet";

  if (uaData?.mobile || /Mobi|iPhone|iPod|Android/i.test(ua)) return "mobile";
  return "desktop";
}
