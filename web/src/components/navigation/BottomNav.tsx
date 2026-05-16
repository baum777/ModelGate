import type { ReactNode } from "react";

export type BottomNavItem = {
  key: string;
  label: string;
  icon: ReactNode;
  active?: boolean;
  badge?: string;
  testId?: string;
  onPress: () => void;
};

type BottomNavProps = {
  ariaLabel: string;
  items: BottomNavItem[];
};

export function BottomNav({ ariaLabel, items }: BottomNavProps) {
  return (
    <nav className="mobile-bottom-nav" aria-label={ariaLabel}>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          className={item.active ? "workspace-tab workspace-tab-active workspace-tab-mobile" : "workspace-tab workspace-tab-mobile"}
          onClick={item.onPress}
          aria-current={item.active ? "page" : undefined}
          aria-label={item.label}
          data-testid={item.testId}
        >
          {item.icon}
          <span aria-hidden={!item.active}>{item.active ? item.label : ""}</span>
          {item.badge ? <span className="mobile-bottom-nav-badge">{item.badge}</span> : null}
        </button>
      ))}
    </nav>
  );
}
