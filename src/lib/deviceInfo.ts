export type ClientDeviceInfo = {
  deviceName?: string;
  osVersion?: string;
  os: string;
  browser: string;
  platform: string;
  screen: string;
  timezone: string;
  language: string;
};

type HighEntropyUAData = {
  model?: string;
  platform?: string;
  platformVersion?: string;
};

type NavigatorWithUAData = Navigator & {
  userAgentData?: {
    platform?: string;
    mobile?: boolean;
    getHighEntropyValues?: (hints: string[]) => Promise<HighEntropyUAData>;
  };
};

function cleanVersionNumber(raw: string | null | undefined): string {
  const v = (raw ?? "").trim().replace(/_/g, ".");
  if (!v || /^0+(?:\.0+)*$/.test(v)) return "";
  // Trim trailing ".0" parts (e.g. "14.0.0" -> "14", "15.1.0" -> "15.1")
  const parts = v.split(".").filter(Boolean);
  while (parts.length > 1 && parts[parts.length - 1] === "0") {
    parts.pop();
  }
  return parts.join(".");
}

function parseAndroidFromUA(ua: string): { deviceName?: string; androidVersion?: string } {
  let androidVersion: string | undefined;
  const verMatch = /Android\s+([0-9]+(?:\.[0-9]+){0,2})/i.exec(ua);
  if (verMatch?.[1]) {
    const cleaned = cleanVersionNumber(verMatch[1]);
    if (cleaned) androidVersion = cleaned;
  }

  let deviceName: string | undefined;
  // Classic Android UA: "(Linux; Android 13; SM-A546E Build/TP1A.220624.014)"
  const parenMatch = /\(([^)]+)\)/.exec(ua);
  if (parenMatch?.[1]) {
    const tokens = parenMatch[1]
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    const androidIdx = tokens.findIndex((t) => /^Android\b/i.test(t));
    if (androidIdx >= 0) {
      for (let i = androidIdx + 1; i < tokens.length; i += 1) {
        let candidate = (tokens[i] ?? "").replace(/\s+Build\/.*$/i, "").trim();
        candidate = candidate.replace(/\s+MIUI\/.*$/i, "").trim();
        if (
          !candidate ||
          candidate === "K" ||
          candidate.toLowerCase() === "wv" ||
          candidate.toLowerCase() === "mobile" ||
          candidate.toLowerCase() === "linux" ||
          candidate.toLowerCase() === "u" ||
          /^[a-z]{2}(?:-[a-z]{2})?$/i.test(candidate)
        ) {
          continue;
        }
        deviceName = candidate.slice(0, 80);
        break;
      }
    }
  }

  return { deviceName, androidVersion };
}

export async function collectDeviceInfo(): Promise<ClientDeviceInfo | undefined> {
  if (typeof window === "undefined") return undefined;
  try {
    const ua = navigator.userAgent || "";
    const nav = navigator as NavigatorWithUAData;

    // Request high-entropy Client Hints (required on modern Chrome/Android to get real model & Android version)
    let ch: HighEntropyUAData | null = null;
    if (typeof nav.userAgentData?.getHighEntropyValues === "function") {
      try {
        ch = await Promise.race([
          nav.userAgentData.getHighEntropyValues(["model", "platform", "platformVersion"]),
          new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 500)),
        ]);
      } catch {
        ch = null;
      }
    }

    const chPlatform = (ch?.platform || nav.userAgentData?.platform || "").trim();
    const chModel = (ch?.model || "").trim();
    const chPlatformVer = cleanVersionNumber(ch?.platformVersion);

    let os = "Unknown OS";
    if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS";
    else if (/Android/i.test(ua) || chPlatform.toLowerCase() === "android") os = "Android";
    else if (/Mac OS X/i.test(ua) || chPlatform.toLowerCase() === "macos") os = "macOS";
    else if (/Windows/i.test(ua) || chPlatform.toLowerCase() === "windows") os = "Windows";
    else if (/Linux/i.test(ua) || chPlatform.toLowerCase() === "linux") os = "Linux";

    let browser = "Browser";
    if (/EdgA?\/|EdgiOS\//i.test(ua)) browser = "Edge";
    else if (/OPR\/|OPT\//i.test(ua)) browser = "Opera";
    else if (/SamsungBrowser\//i.test(ua)) browser = "Samsung Internet";
    else if (/CriOS\//i.test(ua) || (/Chrome\//i.test(ua) && !/Edg\//i.test(ua))) browser = "Chrome";
    else if (/FxiOS\//i.test(ua) || /Firefox\//i.test(ua)) browser = "Firefox";
    else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = "Safari";

    let deviceName = "";
    let osVersion = "";

    if (os === "Android") {
      const parsed = parseAndroidFromUA(ua);
      const validChModel = chModel && chModel !== "K" ? chModel : "";
      deviceName = (validChModel || parsed.deviceName || "Android Device").slice(0, 80);
      const ver = chPlatformVer || parsed.androidVersion || "";
      osVersion = ver ? `Android ${ver}` : "Android";
    } else if (os === "iOS") {
      if (/iPad/i.test(ua)) deviceName = "iPad";
      else if (/iPod/i.test(ua)) deviceName = "iPod";
      else deviceName = "iPhone";
      const iosMatch = /OS\s+(\d+(?:_\d+){0,2})/i.exec(ua);
      const ver = cleanVersionNumber(iosMatch?.[1]);
      osVersion = ver ? `iOS ${ver}` : "iOS";
    } else if (os === "macOS") {
      deviceName = "Mac";
      const macMatch = /Mac OS X\s+(\d+(?:[._]\d+){0,2})/i.exec(ua);
      const ver = chPlatformVer || cleanVersionNumber(macMatch?.[1]);
      osVersion = ver ? `macOS ${ver}` : "macOS";
    } else if (os === "Windows") {
      deviceName = "Windows PC";
      if (chPlatformVer) {
        const major = Number(chPlatformVer.split(".")[0]);
        if (Number.isFinite(major) && major >= 13) osVersion = "Windows 11";
        else if (Number.isFinite(major) && major >= 1) osVersion = "Windows 10";
        else osVersion = "Windows";
      } else {
        osVersion = /Windows NT 10\.0/i.test(ua) ? "Windows 10/11" : "Windows";
      }
    } else if (os === "Linux") {
      deviceName = "Linux PC";
      osVersion = "Linux";
    }

    let tz = "Unknown";
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "Unknown";
    } catch {
      tz = "Unknown";
    }

    const screenWidth = typeof window.screen?.width === "number" ? window.screen.width : 0;
    const screenHeight = typeof window.screen?.height === "number" ? window.screen.height : 0;

    return {
      ...(deviceName ? { deviceName } : {}),
      ...(osVersion ? { osVersion } : {}),
      os,
      browser,
      platform: String(chPlatform || navigator.platform || os).slice(0, 80),
      screen: `${screenWidth}x${screenHeight}`,
      timezone: String(tz).slice(0, 80),
      language: String(navigator.language || "en").slice(0, 40),
    };
  } catch {
    return undefined;
  }
}

function getWebGlGpuSignature(): string {
  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl") ||
      (canvas.getContext("experimental-webgl") as WebGLRenderingContext | null);
    if (!gl) return "";
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    if (dbg) {
      const vendor = String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) || "").trim();
      const renderer = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || "").trim();
      return `${vendor}|${renderer}`.slice(0, 140);
    }
    return String(gl.getParameter(gl.RENDERER) || "").trim().slice(0, 100);
  } catch {
    return "";
  }
}

function getCanvasHashSignature(): string {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 180;
    canvas.height = 40;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    ctx.textBaseline = "top";
    ctx.font = "14px sans-serif";
    ctx.fillStyle = "#5f259f";
    ctx.fillRect(4, 4, 42, 22);
    ctx.fillStyle = "#ffffff";
    ctx.fillText("PhonePe-FP-9329", 10, 10);
    const dataUrl = canvas.toDataURL();
    let h = 2166136261;
    for (let i = 0; i < dataUrl.length; i += 1) {
      h ^= dataUrl.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16);
  } catch {
    return "";
  }
}

async function sha256ClientHex(input: string): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle?.digest) {
    try {
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
      return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
    } catch {
      // Fallback below
    }
  }
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < input.length; i += 1) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619);
    h2 = Math.imul(h2 ^ (c + i), 2246822519);
  }
  const part = `${(h1 >>> 0).toString(16).padStart(8, "0")}${(h2 >>> 0).toString(16).padStart(8, "0")}`;
  return `${part}${part}${part}${part}`;
}

export async function computeHardwareFingerprint(
  precollected?: ClientDeviceInfo,
): Promise<string | undefined> {
  if (typeof window === "undefined") return undefined;
  try {
    const info = precollected ?? (await collectDeviceInfo());
    const sw = Math.min(window.screen?.width || 0, window.screen?.height || 0);
    const sh = Math.max(window.screen?.width || 0, window.screen?.height || 0);
    const dpr = Math.round((window.devicePixelRatio || 1) * 100) / 100;
    const colorDepth = window.screen?.colorDepth || 0;
    const cores = navigator.hardwareConcurrency || 0;
    const touch = navigator.maxTouchPoints || 0;
    const tz = info?.timezone || "";
    const os = info?.os || "";
    const model =
      info?.deviceName && info.deviceName !== "Android Device" ? info.deviceName : "";
    const gpu = getWebGlGpuSignature();
    const canvasSig = getCanvasHashSignature();

    const raw = [
      "fp-v1",
      os.toLowerCase(),
      model.toLowerCase(),
      `${sw}x${sh}@${dpr}`,
      String(colorDepth),
      String(cores),
      String(touch),
      tz.toLowerCase(),
      gpu.toLowerCase(),
      canvasSig,
    ].join("|");

    return await sha256ClientHex(raw);
  } catch {
    return undefined;
  }
}
