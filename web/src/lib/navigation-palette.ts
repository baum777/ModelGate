import type { WorkspaceMode } from "./localization.js";

export type NavigationPaletteEntry = {
  id: string;
  kind: "tab" | "session";
  label: string;
  detail: string;
  mode: WorkspaceMode;
  onSelect: () => void;
};
