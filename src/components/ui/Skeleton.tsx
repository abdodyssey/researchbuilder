interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = "" }: SkeletonProps) {
  return <div className={`bg-bg-main animate-pulse rounded ${className}`} />;
}
