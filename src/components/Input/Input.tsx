import { InputHTMLAttributes, forwardRef, useId } from "react";
import "./Input.css";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, hint, id, className, ...rest }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;

    return (
      <div className="op-field">
        {label && (
          <label className="op-field__label" htmlFor={inputId}>
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={["op-input", className].filter(Boolean).join(" ")}
          aria-describedby={hint ? `${inputId}-hint` : undefined}
          {...rest}
        />
        {hint && (
          <span className="op-field__hint" id={`${inputId}-hint`}>
            {hint}
          </span>
        )}
      </div>
    );
  },
);

Input.displayName = "Input";
