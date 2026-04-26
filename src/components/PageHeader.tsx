import { LucideIcon } from "lucide-react";

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  children?: React.ReactNode;
}

export function PageHeader({ title, description, icon: Icon, children }: PageHeaderProps) {
  return (
    <div className="bg-card border rounded-xl sm:rounded-2xl px-4 py-4 sm:px-6 sm:py-5 mb-4 sm:mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        {Icon && (
          <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Icon className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-bold text-foreground truncate">{title}</h1>
          {description && (
            <p className="text-muted-foreground text-xs sm:text-sm mt-0.5 line-clamp-2">{description}</p>
          )}
        </div>
      </div>
      {children && (
        <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
          {children}
        </div>
      )}
    </div>
  );
}
