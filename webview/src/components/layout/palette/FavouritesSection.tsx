import type { BrowserPlugin } from "../../../stores/usePluginBrowserStore";
import { nativeGraphAddPlugin } from "../../../bridge/nativeGraph";
import { CollapsibleSection } from "./CollapsibleSection";
import { PluginCard, StarGlyph } from "./PluginCard";

interface FavouritesSectionProps {
  favPlugins: BrowserPlugin[];
  favoriteIds: Set<string>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/**
 * Collapsible Favourites section — default open, hidden when empty.
 */
export function FavouritesSection({
  favPlugins,
  favoriteIds,
  selectedId,
  onSelect,
}: FavouritesSectionProps) {
  if (favPlugins.length === 0) return null;

  return (
    <CollapsibleSection
      label={
        <span className="flex items-center gap-1 text-accent-orange">
          <StarGlyph size={9} />
          Favourites
        </span>
      }
      defaultOpen
      data-testid="favourites-section"
    >
      <div className="space-y-1 pb-2 mb-2 border-b border-white/5">
        {favPlugins.map((p) => (
          <PluginCard
            key={p.identifier}
            plugin={{
              id: p.identifier,
              name: p.name,
              description: p.description ?? "",
              category: p.blockCategory,
              format: p.format,
              variants: p.variants ?? [{ format: p.format, identifier: p.identifier }],
            }}
            view="list"
            selected={p.identifier === selectedId}
            isFavourite={favoriteIds.has(p.identifier)}
            onSelect={() => onSelect(p.identifier)}
            onAdd={() => void nativeGraphAddPlugin(p.identifier)}
            onAddVariant={(id) => void nativeGraphAddPlugin(id)}
          />
        ))}
      </div>
    </CollapsibleSection>
  );
}
