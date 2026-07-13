import React from "react";
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  description?: string;
}

export function StatCard({ title, value, icon, description }: StatCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardDescription className="text-xs font-medium uppercase tracking-wider">
          {title}
        </CardDescription>
        <CardTitle className="text-2xl font-bold tracking-tight">
          {value}
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        <CardAction className="flex size-10 items-center justify-center rounded-lg border bg-muted text-muted-foreground">
          {icon}
        </CardAction>
      </CardHeader>
    </Card>
  );
}
