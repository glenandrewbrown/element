/**
 * Shared BrowserPlugin fixture helpers for stories + unit tests.
 *
 * N2 / D-1 added the alias-aware group fields (`description`, `aliases`,
 * `variants`, `isFavorite`, `recentRank`) to BrowserPlugin. Rather than repeat
 * sensible defaults across ~20 fixture literals — and re-break every fixture the
 * next time a field is added — fixtures spread a partial through these helpers.
 *
 * The defaults mirror what `usePluginBrowserStore.refresh()` derives for a
 * solitary (single-variant) plugin: the family is just itself, not favourited,
 * not recent, no secondary description.
 */
import type { BrowserPlugin } from "../stores/usePluginBrowserStore";

/**
 * A fixture row that omits the N2 group fields (they're filled by
 * `withGroupDefaults`). Annotate a `demoPlugins` array with `BrowserPluginSeed[]`
 * so literal `signalOut: "audio"` etc. check against the unions without
 * per-element `as const`.
 */
export type BrowserPluginSeed = Omit<
  BrowserPlugin,
  "description" | "aliases" | "variants" | "isFavorite" | "recentRank"
> &
  Partial<
    Pick<BrowserPlugin, "description" | "aliases" | "variants" | "isFavorite" | "recentRank">
  >;

/** Fill the N2 group fields (and `description`) on a row that omits them. */
export function withGroupDefaults(p: BrowserPluginSeed): BrowserPlugin {
  return {
    ...p,
    description: p.description ?? "",
    aliases: p.aliases ?? [p.identifier],
    variants: p.variants ?? [{ format: p.format, identifier: p.identifier }],
    isFavorite: p.isFavorite ?? false,
    recentRank: p.recentRank ?? -1,
  };
}

/** Build a complete BrowserPlugin from a partial (identifier required). */
export function makeBrowserPlugin(
  partial: Partial<BrowserPlugin> & Pick<BrowserPlugin, "identifier">,
): BrowserPlugin {
  const identifier = partial.identifier;
  const format = partial.format ?? "VST3";
  return {
    identifier,
    name: partial.name ?? identifier,
    description: partial.description ?? "",
    manufacturer: partial.manufacturer ?? "",
    format,
    category: partial.category ?? "Uncategorised",
    blockCategory: partial.blockCategory ?? "audiofx",
    signalOut: partial.signalOut ?? "audio",
    usageCount: partial.usageCount ?? 0,
    aliases: partial.aliases ?? [identifier],
    variants: partial.variants ?? [{ format, identifier }],
    isFavorite: partial.isFavorite ?? false,
    recentRank: partial.recentRank ?? -1,
  };
}
