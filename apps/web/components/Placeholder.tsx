import { PageHeader } from "@/components/PageHeader";

// Route stub from the UI foundation PR. The page session that owns this route replaces the whole file.
export function Placeholder({
  title,
  description,
  board,
}: {
  title: string;
  description: string;
  /** Board name in the mockup artifact. */
  board: string;
}) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <div className="rounded-card border border-dashed border-input p-8 text-muted-foreground">
        Not built yet. Content comes from the mockup board “{board}”.
      </div>
    </>
  );
}
