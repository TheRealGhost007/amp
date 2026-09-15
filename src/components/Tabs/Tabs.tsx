import { KeyboardEvent, ReactNode, useId } from "react";
import "./Tabs.css";

interface Tab {
  id: string;
  label: string;
}

interface TabsProps {
  tabs: Tab[];
  activeId: string;
  onChange: (id: string) => void;
  children: ReactNode;
}

/** Accessible tabs: roving tabindex, arrow-key navigation, ARIA
 * tablist/tab/tabpanel roles. */
export function Tabs({ tabs, activeId, onChange, children }: TabsProps) {
  const baseId = useId();

  function handleKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const delta = e.key === "ArrowRight" ? 1 : -1;
    const next = tabs[(index + delta + tabs.length) % tabs.length];
    onChange(next.id);
    document.getElementById(`${baseId}-tab-${next.id}`)?.focus();
  }

  return (
    <div className="op-tabs">
      <div className="op-tabs__list" role="tablist">
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            id={`${baseId}-tab-${tab.id}`}
            role="tab"
            type="button"
            aria-selected={tab.id === activeId}
            aria-controls={`${baseId}-panel-${tab.id}`}
            tabIndex={tab.id === activeId ? 0 : -1}
            className={["op-tabs__tab", tab.id === activeId && "op-tabs__tab--active"]
              .filter(Boolean)
              .join(" ")}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, index)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${baseId}-panel-${activeId}`}
        aria-labelledby={`${baseId}-tab-${activeId}`}
      >
        {children}
      </div>
    </div>
  );
}
