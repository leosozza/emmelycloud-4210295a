import { useState, useEffect } from "react";

export type WidgetId = "kpis" | "funnel" | "leadsByOrigin" | "revenueByArea" | "monthlyRevenue" | "recentLeads" | "sidebar";

const DEFAULT_WIDGETS: WidgetId[] = [
  "kpis", "funnel", "leadsByOrigin", "revenueByArea", "monthlyRevenue", "recentLeads", "sidebar",
];

const STORAGE_KEY = "dashboard-layout";

export function useDashboardLayout() {
  const [widgets, setWidgets] = useState<WidgetId[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return DEFAULT_WIDGETS;
  });

  const [hiddenWidgets, setHiddenWidgets] = useState<WidgetId[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY + "-hidden");
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets));
  }, [widgets]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY + "-hidden", JSON.stringify(hiddenWidgets));
  }, [hiddenWidgets]);

  const toggleWidget = (id: WidgetId) => {
    if (hiddenWidgets.includes(id)) {
      setHiddenWidgets((h) => h.filter((w) => w !== id));
      if (!widgets.includes(id)) {
        setWidgets((w) => [...w, id]);
      }
    } else {
      setHiddenWidgets((h) => [...h, id]);
    }
  };

  const reorderWidgets = (newOrder: WidgetId[]) => {
    setWidgets(newOrder);
  };

  const resetLayout = () => {
    setWidgets(DEFAULT_WIDGETS);
    setHiddenWidgets([]);
  };

  const visibleWidgets = widgets.filter((w) => !hiddenWidgets.includes(w));

  return { widgets, visibleWidgets, hiddenWidgets, toggleWidget, reorderWidgets, resetLayout };
}

export const WIDGET_LABELS: Record<WidgetId, string> = {
  kpis: "KPIs Principais",
  funnel: "Funil de Vendas",
  leadsByOrigin: "Leads por Origem",
  revenueByArea: "Receita por Área",
  monthlyRevenue: "Tendência de Receita",
  recentLeads: "Últimos Leads",
  sidebar: "Resumo Lateral",
};
