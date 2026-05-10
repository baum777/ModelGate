import { useMemo } from "react";

export function useHapticFeedback() {
  return useMemo(
    () => ({
      light: () => navigator.vibrate?.(10),
      medium: () => navigator.vibrate?.([10, 20, 10]),
      error: () => navigator.vibrate?.([20, 10, 20, 10, 20]),
    }),
    [],
  );
}
