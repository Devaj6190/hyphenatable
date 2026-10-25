// Theme preference kept in localStorage: "light" is the default when nothing is stored; "dark" and "system" are
// explicit choices from the toggle. The same tokens drive both themes.
export type ThemePref = "system" | "light" | "dark";
export const THEME_KEY = "pp-theme";

// Runs in <head> before first paint, and follows system changes only while the preference is "system".
export const THEME_SCRIPT = `(function(){var k="${THEME_KEY}",m=window.matchMedia("(prefers-color-scheme: dark)");function a(){var t=null;try{t=localStorage.getItem(k)}catch(e){}if(t==="system")t=m.matches?"dark":"light";else if(t!=="dark")t="light";document.documentElement.setAttribute("data-theme",t)}a();m.addEventListener("change",a);window.__ppApplyTheme=a})()`;

export function readThemePref(): ThemePref {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === "system" || t === "dark" ? t : "light";
  } catch {
    return "light";
  }
}

export function applyThemePref(pref: ThemePref) {
  try {
    localStorage.setItem(THEME_KEY, pref);
  } catch {}
  const w = window as Window & { __ppApplyTheme?: () => void };
  w.__ppApplyTheme?.();
  window.dispatchEvent(new Event(THEME_KEY));
}
