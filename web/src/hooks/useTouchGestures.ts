import { useCallback, useMemo, useRef } from "react";
import type { HTMLAttributes, PointerEvent as ReactPointerEvent } from "react";

type GestureOptions = {
  longPressMs?: number;
  swipeDistancePx?: number;
  onLongPress?: () => void;
  onSwipeLeft?: () => void;
};

type GestureHandlers = Pick<
  HTMLAttributes<HTMLElement>,
  "onPointerDown" | "onPointerMove" | "onPointerUp" | "onPointerCancel" | "onPointerLeave" | "onContextMenu"
>;

const MOVE_CANCEL_THRESHOLD_PX = 10;

export function useTouchGestures(options: GestureOptions): { handlers: GestureHandlers } {
  const longPressMs = options.longPressMs ?? 420;
  const swipeDistancePx = options.swipeDistancePx ?? 52;

  const pointerIdRef = useRef<number | null>(null);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const longPressTriggeredRef = useRef(false);
  const longPressHandleRef = useRef<number | null>(null);

  const clearLongPressTimer = useCallback(() => {
    if (longPressHandleRef.current === null) {
      return;
    }

    window.clearTimeout(longPressHandleRef.current);
    longPressHandleRef.current = null;
  }, []);

  const resetGestureState = useCallback(() => {
    pointerIdRef.current = null;
    startXRef.current = 0;
    startYRef.current = 0;
    longPressTriggeredRef.current = false;
    clearLongPressTimer();
  }, [clearLongPressTimer]);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    pointerIdRef.current = event.pointerId;
    startXRef.current = event.clientX;
    startYRef.current = event.clientY;
    longPressTriggeredRef.current = false;

    clearLongPressTimer();
    longPressHandleRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      options.onLongPress?.();
    }, longPressMs);

    event.currentTarget.setPointerCapture(event.pointerId);
  }, [clearLongPressTimer, longPressMs, options]);

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (pointerIdRef.current !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - startXRef.current;
    const deltaY = event.clientY - startYRef.current;

    if (Math.abs(deltaX) > MOVE_CANCEL_THRESHOLD_PX || Math.abs(deltaY) > MOVE_CANCEL_THRESHOLD_PX) {
      clearLongPressTimer();
    }
  }, [clearLongPressTimer]);

  const onPointerUp = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (pointerIdRef.current !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - startXRef.current;
    const deltaY = event.clientY - startYRef.current;

    if (!longPressTriggeredRef.current && deltaX <= -swipeDistancePx && Math.abs(deltaY) <= 44) {
      options.onSwipeLeft?.();
    }

    resetGestureState();
  }, [options, resetGestureState, swipeDistancePx]);

  const onPointerCancel = useCallback(() => {
    resetGestureState();
  }, [resetGestureState]);

  const handlers = useMemo<GestureHandlers>(() => ({
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onPointerLeave: onPointerCancel,
    onContextMenu: (event) => event.preventDefault(),
  }), [onPointerCancel, onPointerDown, onPointerMove, onPointerUp]);

  return { handlers };
}
