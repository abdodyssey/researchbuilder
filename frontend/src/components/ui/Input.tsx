import React from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, icon, className = "", ...props }, ref) => {
    return (
      <div className="space-y-1.5 w-full">
        {label && (
          <label className="block text-[10px] font-bold text-text-secondary uppercase tracking-wider select-none">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {icon && (
            <div className="absolute left-3 text-text-muted pointer-events-none flex items-center justify-center">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            className={`w-full bg-bg-main border border-border-color text-text-primary px-3 py-2 text-sm rounded-md placeholder-text-muted transition-all duration-150 hover:border-border-hover focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:opacity-50 disabled:bg-bg-card/60 ${
              icon ? "pl-9" : ""
            } ${error ? "border-status-error focus:border-status-error focus:ring-status-error/10" : ""} ${className}`}
            {...props}
          />
        </div>
        {error && <p className="text-[11px] text-status-error font-medium">{error}</p>}
      </div>
    );
  }
);

Input.displayName = "Input";
