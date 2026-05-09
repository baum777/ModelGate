import { useEffect, type ReactNode } from "react";

export type BottomSheetProps = {
  open: boolean;
  title: string;
  children: ReactNode;
  maxHeight?: "content" | "large";
  onDismiss: () => void;
};

export function BottomSheet({ open, title, children, maxHeight = "content", onDismiss }: BottomSheetProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onDismiss();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onDismiss, open]);

  if (!open) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        className="mobile-bottom-sheet-backdrop"
        aria-label={`Close ${title}`}
        onClick={onDismiss}
      />
      <section
        className={`mobile-bottom-sheet mobile-bottom-sheet-${maxHeight}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <span className="mobile-bottom-sheet-handle" aria-hidden="true" />
        {children}
      </section>
    </>
  );
}
