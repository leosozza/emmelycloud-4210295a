import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type ColorTheme = "red" | "blue";

interface ThemeContextValue {
  colorTheme: ColorTheme;
  setColorTheme: (t: ColorTheme) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [colorTheme, setColorThemeState] = useState<ColorTheme>(() => {
    try {
      return (localStorage.getItem("color-theme") as ColorTheme) || "red";
    } catch {
      return "red";
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("theme-blue");
    if (colorTheme === "blue") {
      root.classList.add("theme-blue");
    }
    localStorage.setItem("color-theme", colorTheme);
  }, [colorTheme]);

  const setColorTheme = (t: ColorTheme) => setColorThemeState(t);

  return (
    <ThemeContext.Provider value={{ colorTheme, setColorTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useColorTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useColorTheme must be used within ThemeProvider");
  return ctx;
}
