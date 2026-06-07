import type { BrowserPlugin } from "../../../stores/usePluginBrowserStore";
import { nativeGraphAddPlugin } from "../../../bridge/nativeGraph";
import { CollapsibleSection } from "./CollapsibleSection";
import { PluginCard } from "./PluginCard";

interface RecentsSectionProps {
  recentPlugins: BrowserPlugin[];
  favoriteIds: Set<string>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/**
 * Collapsible Recent plugins section — default open, hidden when empty.
 */
export function RecentsSection({
  recentPlugins,
  favoriteIds,
  selectedId,
  onSelect,
}: RecentsSectionProps) {
  if (recentPlugins.length === 0) return null;

  return (
    <CollapsibleSection
      label="Recent plugins"
      defaultOpen
      headerClassName="text-accent-teal"
      data-testid="recents-section"
    >
      <div className="space-y-1 pb-2 mb-2 border-b border-white/5">
        {recentPlugins.map((p) => (
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
