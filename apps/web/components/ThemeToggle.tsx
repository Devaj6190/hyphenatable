"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useLayoutEffect, useSyncExternalStore } from "react";
import { Segmented } from "@/components/Segmented";
import {
  applyThemePref,
  readThemePref,
  THEME_KEY,
  type ThemePref,
} from "@/lib/theme";

const subscribe = (cb: () => void) => {
  window.addEventListener(THEME_KEY, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(THEME_KEY, cb);
    window.removeEventListener("storage", cb);
  };
};

export function ThemeToggle() {
  const pref = useSyncExternalStore<ThemePref>(
    subscribe,
    readThemePref,
    () => "system",
  );
  // Strict Mode's dev remount clears <html data-theme>; re-apply. No-op in production.
  useLayoutEffect(() => {
    (window as Window & { __ppApplyTheme?: () => void }).__ppApplyTheme?.();
  }, []);
  return (
    <Segmented
      label="Theme"
      size="sm"
      value={pref}
      onValueChange={applyThemePref}
      options={[
        {
          value: "system",
          label: "System theme",
          icon: Monitor,
          iconOnly: true,
        },
        { value: "light", label: "Light theme", icon: Sun, iconOnly: true },
        { value: "dark", label: "Dark theme", icon: Moon, iconOnly: true },
      ]}
    />
  );
}
