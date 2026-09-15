import { InputHTMLAttributes, forwardRef } from "react";
import "./Slider.css";

interface SliderProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: string;
}

/** Native range input under the hood — keyboard and screen-reader support
 * come for free; only the visual track/thumb are restyled. Used for both
 * playback progress and volume. */
export const Slider = forwardRef<HTMLInputElement, SliderProps>(
  ({ label, className, min = 0, max = 100, value, ...rest }, ref) => {
    const percent = ((Number(value) - Number(min)) / (Number(max) - Number(min))) * 100;

    return (
      <input
        ref={ref}
        type="range"
        aria-label={label}
        min={min}
        max={max}
        value={value}
        className={["op-slider", className].filter(Boolean).join(" ")}
        style={{ "--op-slider-fill": `${percent}%` } as React.CSSProperties}
        {...rest}
      />
    );
  },
);

Slider.displayName = "Slider";
