// Theme preference: "system" (default, nothing stored) or an explicit "light" | "dark" kept in localStorage.
export type ThemePref = "system" | "light" | "dark";
export const THEME_KEY = "pp-theme";

// Runs in <head> before first paint, and follows system changes while the preference is "system".
export const THEME_SCRIPT = `(function(){var k="${THEME_KEY}",m=window.matchMedia("(prefers-color-scheme: dark)");function a(){var t=null;try{t=localStorage.getItem(k)}catch(e){}if(t!=="light"&&t!=="dark")t=m.matches?"dark":"light";document.documentElement.setAttribute("data-theme",t)}a();m.addEventListener("change",a);window.__ppApplyTheme=a})()`;

export function readThemePref(): ThemePref {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

export function applyThemePref(pref: ThemePref) {
  try {
    if (pref === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, pref);
  } catch {}
  const w = window as Window & { __ppApplyTheme?: () => void };
  w.__ppApplyTheme?.();
  window.dispatchEvent(new Event(THEME_KEY));
}
