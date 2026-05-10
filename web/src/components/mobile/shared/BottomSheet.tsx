import { useEffect, useRef, useState, type ReactNode } from "react";

export type BottomSheetProps = {
  open: boolean;
  title: string;
  children: ReactNode;
  maxHeight?: "content" | "large";
  height?: "content" | "75vh" | "90vh";
  onDismiss: () => void;
};

export function BottomSheet({ open, title, children, maxHeight = "content", height, onDismiss }: BottomSheetProps) {
  const sheetRef = useRef<HTMLElement | null>(null);
  const startYRef = useRef(0);
  const dragYRef = useRef(0);
  const [dragY, setDragY] = useState(0);

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

  useEffect(() => {
    if (!open) {
      return;
    }

    const sheet = sheetRef.current;
    if (!sheet) {
      return;
    }

    const handleTouchStart = (event: TouchEvent) => {
      startYRef.current = event.touches[0]?.clientY ?? 0;
      dragYRef.current = 0;
    };

    const handleTouchMove = (event: TouchEvent) => {
      const currentY = event.touches[0]?.clientY ?? startYRef.current;
      const nextDragY = Math.max(0, currentY - startYRef.current);
      dragYRef.current = nextDragY;
      setDragY(nextDragY);
    };

    const handleTouchEnd = () => {
      const dragY = dragYRef.current;
      if (dragY > 80) {
        onDismiss();
      }

      dragYRef.current = 0;
      setDragY(0);
    };

    sheet.addEventListener("touchstart", handleTouchStart, { passive: true });
    sheet.addEventListener("touchmove", handleTouchMove, { passive: true });
    sheet.addEventListener("touchend", handleTouchEnd);

    return () => {
      sheet.removeEventListener("touchstart", handleTouchStart);
      sheet.removeEventListener("touchmove", handleTouchMove);
      sheet.removeEventListener("touchend", handleTouchEnd);
    };
  }, [onDismiss, open]);

  if (!open) {
    return null;
  }

  const heightClass = height === "75vh"
    ? "mobile-bottom-sheet-75vh"
    : height === "90vh"
      ? "mobile-bottom-sheet-90vh"
      : `mobile-bottom-sheet-${maxHeight}`;

  return (
    <>
      <button
        type="button"
        className="mobile-bottom-sheet-backdrop"
        aria-label={`Close ${title}`}
        onClick={onDismiss}
      />
      <section
        ref={sheetRef}
        className={`mobile-bottom-sheet ${heightClass}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          transform: dragY > 0 ? `translateY(${Math.min(dragY, 200)}px)` : undefined,
          transition: dragY > 0 ? "none" : undefined,
        }}
      >
        <span className="mobile-bottom-sheet-handle" aria-hidden="true" />
        {children}
      </section>
    </>
  );
}
