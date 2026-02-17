import { createContext, useContext, useState, ReactNode, useCallback } from "react";
import { Locale } from "date-fns";
import { ptBR, pt } from "date-fns/locale";

type LocaleCode = "pt-BR" | "pt-PT";
type CurrencyCode = "BRL" | "EUR";

interface LocaleContextType {
  locale: LocaleCode;
  currency: CurrencyCode;
  currencySymbol: string;
  dateFnsLocale: Locale;
  setLocale: (locale: LocaleCode) => void;
  /** Format a value that is stored in EUR (base currency) — automatically converts to BRL when locale is pt-BR */
  formatCurrency: (valueInEUR: number) => string;
}

const STORAGE_KEY = "emmely-locale";

// Average exchange rate EUR → BRL (updated periodically; a real app would fetch live rates)
const EUR_TO_BRL = 6.10;

const LocaleContext = createContext<LocaleContextType | undefined>(undefined);

const config: Record<LocaleCode, { currency: CurrencyCode; symbol: string; dateFnsLocale: Locale }> = {
  "pt-BR": { currency: "BRL", symbol: "R$", dateFnsLocale: ptBR },
  "pt-PT": { currency: "EUR", symbol: "€", dateFnsLocale: pt },
};

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<LocaleCode>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "pt-BR" || saved === "pt-PT") return saved;
    } catch {}
    return "pt-PT";
  });

  const setLocale = useCallback((l: LocaleCode) => {
    setLocaleState(l);
    try { localStorage.setItem(STORAGE_KEY, l); } catch {}
  }, []);

  const { currency, symbol, dateFnsLocale } = config[locale];

  const formatCurrency = useCallback(
    (valueInEUR: number) => {
      const displayValue = locale === "pt-BR" ? valueInEUR * EUR_TO_BRL : valueInEUR;
      return new Intl.NumberFormat(locale, { style: "currency", currency }).format(displayValue);
    },
    [locale, currency]
  );

  return (
    <LocaleContext.Provider value={{ locale, currency, currencySymbol: symbol, dateFnsLocale, setLocale, formatCurrency }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within LocaleProvider");
  return ctx;
}
