import { Capacitor } from "@capacitor/core";

/**
 * Native file saving for the Capacitor (Android/iOS) build.
 *
 * In a WebView, the browser's normal "download" (an <a download> or a jsPDF
 * doc.save()) does nothing useful — nothing lands on the device. This module
 * writes the file into a dedicated, user-visible "eduignite" folder inside the
 * device Documents directory using @capacitor/filesystem.
 */

export const EDUIGNITE_FOLDER = "eduignite";

export function isNativeApp(): boolean {
  try {
    return Capacitor?.isNativePlatform?.() ?? false;
  } catch {
    return false;
  }
}

function sanitizeFileName(name: string): string {
  const cleaned = (name || "")
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || `eduignite-${Date.now()}`;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read file data."));
    reader.onloadend = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(blob);
  });
}

function parseDataUrl(dataUrl: string): { base64: string; mime: string } {
  const match = /^data:([^;,]*)(;base64)?,([\s\S]*)$/.exec(dataUrl);
  if (!match) return { base64: "", mime: "application/octet-stream" };
  const mime = match[1] || "application/octet-stream";
  const isBase64 = Boolean(match[2]);
  const payload = match[3] || "";
  if (isBase64) return { base64: payload, mime };
  // Plain (URL-encoded) data URL -> base64.
  const text = decodeURIComponent(payload);
  const base64 = typeof btoa === "function" ? btoa(unescape(encodeURIComponent(text))) : "";
  return { base64, mime };
}

async function resolveBase64(source: {
  url?: string;
  base64?: string;
  mimeType?: string;
}): Promise<{ base64: string; mime: string }> {
  if (source.base64) {
    return { base64: source.base64, mime: source.mimeType || "application/octet-stream" };
  }
  const url = source.url || "";
  if (url.startsWith("data:")) {
    const parsed = parseDataUrl(url);
    return { base64: parsed.base64, mime: source.mimeType || parsed.mime };
  }
  // blob: URLs and remote/http(s) URLs — fetch then encode.
  const res = await fetch(url);
  const blob = await res.blob();
  const base64 = await blobToBase64(blob);
  return { base64, mime: source.mimeType || blob.type || "application/octet-stream" };
}

/**
 * Save a file into the device's Documents/eduignite folder.
 * Returns the platform file URI on success.
 */
export async function saveToEduignite(opts: {
  fileName: string;
  url?: string;
  base64?: string;
  mimeType?: string;
}): Promise<string> {
  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  const { base64 } = await resolveBase64(opts);
  if (!base64) throw new Error("There was no file data to save.");

  // On older Android the public Documents folder needs a storage grant. Ask for
  // it best-effort; on Android 13+ this is a no-op and always resolves.
  try {
    const status = await Filesystem.checkPermissions();
    if (status.publicStorage !== "granted") {
      await Filesystem.requestPermissions();
    }
  } catch {
    /* permission API not available on this platform — continue */
  }

  const path = `${EDUIGNITE_FOLDER}/${sanitizeFileName(opts.fileName)}`;
  const result = await Filesystem.writeFile({
    path,
    data: base64,
    directory: Directory.Documents,
    recursive: true,
  });
  return result.uri;
}
