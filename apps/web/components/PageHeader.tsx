import type { ReactNode } from "react";

/** Page title block: 30px title, one plain sentence, optional actions on the right. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="flex max-w-2xl flex-col gap-1">
        <h1 className="text-[1.875rem] leading-tight font-semibold tracking-[-0.01em]">
          {title}
        </h1>
        {description && <p className="text-muted-foreground">{description}</p>}
      </div>
      {actions && (
        <div className="phone-actions flex flex-wrap gap-2 max-sm:w-full">
          {actions}
        </div>
      )}
    </div>
  );
}
