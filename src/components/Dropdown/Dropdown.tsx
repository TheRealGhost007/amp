import { useRef, useState } from "react";
import { Menu } from "../Menu/Menu";
import { Icon } from "../Icon/Icon";
import "./Dropdown.css";

interface DropdownOption {
  value: string;
  label: string;
}

interface DropdownProps {
  label: string;
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
}

export function Dropdown({ label, options, value, onChange }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const current = options.find((o) => o.value === value);

  return (
    <div className="op-field">
      <span className="op-field__label" id={`${label}-label`}>
        {label}
      </span>
      <button
        ref={triggerRef}
        type="button"
        className="op-dropdown-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${label}-label`}
        onClick={() => setOpen((o) => !o)}
      >
        <span>{current?.label ?? "Select…"}</span>
        <Icon name="chevron-down" size={16} />
      </button>
      <Menu
        anchorRef={triggerRef}
        open={open}
        onClose={() => setOpen(false)}
        items={options.map((option) => ({
          id: option.value,
          label: option.label,
          checked: option.value === value,
          onSelect: () => onChange(option.value),
        }))}
      />
    </div>
  );
}
