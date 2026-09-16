import { useId } from "react";
import "./Toggle.css";

interface ToggleProps {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function Toggle({ label, hint, checked, onChange }: ToggleProps) {
  const id = useId();

  return (
    <div className="op-toggle-row">
      <div className="op-toggle-row__text">
        <label className="op-field__label" htmlFor={id}>
          {label}
        </label>
        {hint && <span className="op-field__hint">{hint}</span>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        className="op-toggle"
        data-on={checked}
        onClick={() => onChange(!checked)}
      >
        <span className="op-toggle__thumb" />
      </button>
    </div>
  );
}
