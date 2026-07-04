import React from "react";
import { CheckCircle2 } from "lucide-react";

interface StepperProps {
  steps: string[];
  currentStep: number;
}

export function Stepper({ steps, currentStep }: StepperProps) {
  return (
    <div className="flex items-center w-full max-w-2xl mx-auto">
      {steps.map((label, i) => {
        const stepNum = i + 1;
        const isDone = stepNum < currentStep;
        const isActive = stepNum === currentStep;

        return (
          <React.Fragment key={i}>
            <div className="flex flex-col items-center gap-1.5 min-w-0">
              <div
                className={`
                  w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all
                  ${isDone ? "bg-status-success text-white" : ""}
                  ${isActive ? "bg-primary text-white ring-4 ring-primary/20" : ""}
                  ${!isDone && !isActive ? "bg-bg-main border border-border-color text-text-muted" : ""}
                `}
              >
                {isDone ? <CheckCircle2 className="w-4 h-4" /> : stepNum}
              </div>
              <span
                className={`text-[10px] font-medium text-center leading-tight hidden sm:block ${
                  isActive ? "text-primary font-bold" : isDone ? "text-status-success" : "text-text-muted"
                }`}
              >
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={`flex-1 h-0.5 mx-1.5 rounded-full transition-colors ${
                  stepNum < currentStep ? "bg-status-success" : "bg-border-color"
                }`}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
