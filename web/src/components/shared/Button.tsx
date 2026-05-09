import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";

type ButtonProps = {
  variant?: ButtonVariant;
  icon?: ReactNode;
  fullWidth?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({
  variant = "primary",
  icon,
  fullWidth = false,
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  const classes = [
    "mobile-ui-button",
    `mobile-ui-button-${variant}`,
    fullWidth ? "mobile-ui-button-full" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button type={type} className={classes} {...rest}>
      {icon ? <span className="mobile-ui-button-icon" aria-hidden="true">{icon}</span> : null}
      <span>{children}</span>
    </button>
  );
}
