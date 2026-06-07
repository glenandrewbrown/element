import { useCallback } from "react";
import { nativeMoleculeInsert } from "../../../bridge/nativeGraph";
import { CollapsibleSection } from "./CollapsibleSection";
import { setSnippetDragData, snippetInsertDefault } from "../../../lib/snippetDrag";

interface Molecule {
  name: string;
  description?: string;
}

interface MoleculesSectionProps {
  molecules: Molecule[];
}

/**
 * Collapsible Molecules section — default collapsed, hidden when empty.
 *
 * Click-to-insert uses viewport centre computed from the React Flow DOM
 * transform (no ReactFlowProvider needed — safe for palette context).
 * Each item is also a drag source (HTML5 DnD, SNIPPET_DRAG_TYPE) so it can
 * be dragged onto the Board canvas to insert at the drop position.
 */
export function MoleculesSection({ molecules }: MoleculesSectionProps) {
  const handleInsert = useCallback((name: string) => {
    const { x, y } = snippetInsertDefault();
    void nativeMoleculeInsert(name, x, y);
  }, []);

  const handleDragStart = useCallback(
    (event: React.DragEvent<HTMLButtonElement>, name: string) => {
      setSnippetDragData(event.dataTransfer, { name });
    },
    [],
  );

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
            draggable
            onDragStart={(e) => handleDragStart(e, m.name)}
            className="w-full text-left text-[10px] px-2 py-1.5 rounded-md text-text-secondary hover:bg-elevated hover:neu-raised hover:text-accent-blue truncate transition-[box-shadow,background-color,color] duration-150 ease-out cursor-grab active:cursor-grabbing"
            title={m.description || "Insert snippet at viewport centre, or drag to place"}
            onClick={() => handleInsert(m.name)}
          >
            {m.name || "Untitled"}
          </button>
        ))}
      </div>
    </CollapsibleSection>
  );
}
