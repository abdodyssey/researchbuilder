"use client"

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      closeButton
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:!bg-background group-[.toaster]:!text-foreground group-[.toaster]:!border-border group-[.toaster]:shadow-xl group-[.toaster]:!rounded-xl font-sans border",
          description: "group-[.toast]:!text-muted-foreground",
          actionButton:
            "group-[.toast]:!bg-primary group-[.toast]:!text-primary-foreground font-medium",
          cancelButton:
            "group-[.toast]:!bg-muted group-[.toast]:!text-muted-foreground font-medium",
          closeButton:
            "group-[.toast]:!bg-background group-[.toast]:!text-muted-foreground group-[.toast]:!border-border hover:group-[.toast]:!bg-muted",
          error: "group-[.toaster]:!text-destructive group-[.toaster]:!border-destructive/30 group-[.toaster]:!bg-background",
          success: "group-[.toaster]:!text-primary group-[.toaster]:!border-primary/30 group-[.toaster]:!bg-background",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
