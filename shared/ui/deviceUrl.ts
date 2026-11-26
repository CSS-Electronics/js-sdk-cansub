const STORAGE_KEY = 'cansub-device-url';

/**
 * Normalise a user-entered CANsub address to an origin (`https://host[:port]`).
 * A bare host gets `https://`. Returns null for anything that is not http(s).
 */
export function normalizeDeviceUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    // Browsers percent-encode a host with spaces instead of rejecting it.
    if (!/^([a-z0-9-]+\.)*[a-z0-9-]+$|^\[[0-9a-f:.]+\]$/i.test(url.hostname)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * The device URL to start with: the page's `?device=` parameter, then the last URL
 * used in this browser, then the page origin when the CANsub itself serves the page.
 */
export function initialDeviceUrl(): string | null {
  const param = new URLSearchParams(location.search).get('device');
  if (param) return normalizeDeviceUrl(param);
  const saved = readSaved();
  if (saved) return saved;
  return servedByDevice() ? location.origin : null;
}

export function saveDeviceUrl(url: string): void {
  try { localStorage.setItem(STORAGE_KEY, url); } catch { /* storage unavailable */ }
}

function readSaved(): string | null {
  try { return normalizeDeviceUrl(localStorage.getItem(STORAGE_KEY) ?? ''); } catch { return null; }
}

// CANsub hostnames end in -usb.local (USB) or are reached by hostname/IP over Ethernet;
// a dev server or file:// page is never the device.
function servedByDevice(): boolean {
  if (location.protocol !== 'https:') return false;
  return !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
}
