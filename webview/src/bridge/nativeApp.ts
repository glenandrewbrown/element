import { invokeElementNative } from "./juceBackend";

export type AboutInfo = {
  name: string;
  version: string;
  copyright: string;
};

export async function nativeAppGetAbout(): Promise<AboutInfo | null> {
  const r = await invokeElementNative("elementAppGetAbout", []);
  if (r == null || typeof r !== "object") return null;
  const o = r as Record<string, unknown>;
  return {
    name: String(o.name ?? "Element"),
    version: String(o.version ?? ""),
    copyright: String(o.copyright ?? ""),
  };
}

export async function nativeAppCheckForUpdates(): Promise<void> {
  await invokeElementNative("elementAppCheckForUpdates", []);
}
