import React from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: React.ReactNode;
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  className = "",
  disabled,
  ...props
}: ButtonProps) {
  let baseStyles = "inline-flex items-center justify-center gap-2 font-medium transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50 disabled:pointer-events-none cursor-pointer select-none active:scale-[0.98]";
  
  let sizeStyles = "";
  if (size === "sm") {
    sizeStyles = "text-xs px-3 py-1.5 rounded-md";
  } else if (size === "md") {
    sizeStyles = "text-sm px-4 py-2 rounded-md";
  } else if (size === "lg") {
    sizeStyles = "text-base px-5 py-2.5 rounded-lg";
  }

  let variantStyles = "";
  if (variant === "primary") {
    variantStyles = "bg-primary text-white hover:bg-primary-hover shadow-sm border border-transparent";
  } else if (variant === "secondary") {
    variantStyles = "bg-bg-card text-text-primary hover:bg-bg-main border border-border-color hover:border-border-hover shadow-sm";
  } else if (variant === "danger") {
    variantStyles = "bg-status-error text-white hover:bg-status-error/90 border border-transparent shadow-sm";
  } else if (variant === "ghost") {
    variantStyles = "text-text-secondary hover:text-text-primary hover:bg-bg-card/80 border border-transparent";
  }

  return (
    <button
      disabled={disabled || loading}
      className={`${baseStyles} ${sizeStyles} ${variantStyles} ${className}`}
      {...props}
    >
      {loading ? (
        <span className="animate-spin rounded-full h-3.5 w-3.5 border-t-2 border-b-2 border-current shrink-0"></span>
      ) : (
        icon && <span className="shrink-0">{icon}</span>
      )}
      {children && <span>{children}</span>}
    </button>
  );
}
