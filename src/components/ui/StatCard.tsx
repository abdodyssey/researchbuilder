import React from "react";
import { Card } from "./Card";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  description?: string;
}

export function StatCard({ title, value, icon, description }: StatCardProps) {
  return (
    <Card>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">
            {title}
          </p>
          <p className="text-2xl font-extrabold font-outfit text-text-primary tracking-tight">
            {value}
          </p>
          {description && (
            <p className="text-xs text-text-secondary mt-1">{description}</p>
          )}
        </div>
        <div className="w-10 h-10 rounded-lg bg-bg-main border border-border-color flex items-center justify-center text-primary">
          {icon}
        </div>
      </div>
    </Card>
  );
}
