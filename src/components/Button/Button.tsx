import { ButtonHTMLAttributes, forwardRef } from "react";
import "./Button.css";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconOnly?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "secondary", size = "md", iconOnly = false, className, ...rest }, ref) => {
    const classes = [
      "op-button",
      `op-button--${variant}`,
      `op-button--${size}`,
      iconOnly && "op-button--icon-only",
      className,
    ]
      .filter(Boolean)
      .join(" ");

    return <button ref={ref} className={classes} {...rest} />;
  },
);

Button.displayName = "Button";
