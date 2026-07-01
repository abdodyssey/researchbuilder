import React from "react";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "trial" | "basic" | "premium" | "success" | "warning" | "error" | "info" | "neutral";
  children: React.ReactNode;
}

export function Badge({ children, variant = "neutral", className = "", ...props }: BadgeProps) {
  let baseStyles = "inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider border shrink-0 select-none";
  
  let variantStyles = "";
  if (variant === "trial") {
    variantStyles = "bg-bg-main text-text-secondary border-border-color";
  } else if (variant === "basic") {
    variantStyles = "bg-status-info/10 text-status-info border-status-info/20";
  } else if (variant === "premium") {
    variantStyles = "bg-primary/10 text-primary border-primary/20";
  } else if (variant === "success") {
    variantStyles = "bg-status-success/10 text-status-success border-status-success/20";
  } else if (variant === "warning") {
    variantStyles = "bg-status-warning/10 text-status-warning border-status-warning/20";
  } else if (variant === "error") {
    variantStyles = "bg-status-error/10 text-status-error border-status-error/20";
  } else if (variant === "info") {
    variantStyles = "bg-status-info/10 text-status-info border-status-info/20";
  } else if (variant === "neutral") {
    variantStyles = "bg-bg-card text-text-secondary border-border-color";
  }

  return (
    <span className={`${baseStyles} ${variantStyles} ${className}`} {...props}>
      {children}
    </span>
  );
}
