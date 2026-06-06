import { nativeMoleculeInsert } from "../../../bridge/nativeGraph";
import { CollapsibleSection } from "./CollapsibleSection";

interface Molecule {
  name: string;
  description?: string;
}

interface MoleculesSectionProps {
  molecules: Molecule[];
}

/**
 * Collapsible Molecules section — default collapsed, hidden when empty.
 */
export function MoleculesSection({ molecules }: MoleculesSectionProps) {
  if (molecules.length === 0) return null;

  return (
    <CollapsibleSection
      label="Molecules"
      defaultOpen={false}
      data-testid="molecules-section"
    >
      <div className="space-y-1 pb-2 mb-2 border-b border-white/5">
        {molecules.map((m) => (
          <button
            key={m.name}
            type="button"
            className="w-full text-left text-[10px] px-2 py-1.5 rounded-md text-text-secondary hover:bg-elevated hover:neu-raised hover:text-accent-blue truncate transition-[box-shadow,background-color,color] duration-150 ease-out"
            title={m.description || "Insert molecule at default position"}
            onClick={() => void nativeMoleculeInsert(m.name, 140, 140)}
          >
            {m.name || "Untitled"}
          </button>
        ))}
      </div>
    </CollapsibleSection>
  );
}
