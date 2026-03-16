import { useState, useEffect } from "react";
import { DashboardKPIs } from "@/components/dashboard/DashboardKPIs";
import { LeadsByOriginChart, RevenueByAreaChart, MonthlyRevenueChart, FunnelChartWidget } from "@/components/dashboard/DashboardChartsLive";
import { RecentLeads } from "@/components/dashboard/RecentLeads";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { DashboardCustomizer } from "@/components/dashboard/DashboardCustomizer";
import { PeriodFilter } from "@/components/dashboard/PeriodFilter";
import { useDashboardLayout, type WidgetId } from "@/hooks/useDashboardLayout";
import { useDashboardAll } from "@/hooks/useDashboardData";
import { useAuthContext } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { format } from "date-fns";
import { pt } from "date-fns/locale";

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

function SortableWidget({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative group">
      <button
        {...attributes}
        {...listeners}
        className="absolute -left-2 top-3 z-10 opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity cursor-grab active:cursor-grabbing p-1 rounded bg-muted"
        aria-label="Reordenar"
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </button>
      {children}
    </div>
  );
}

const CHART_WIDGETS: WidgetId[] = ["funnel", "leadsByOrigin", "revenueByArea", "monthlyRevenue"];
const FULL_WIDGETS: WidgetId[] = ["kpis"];
const BOTTOM_LEFT: WidgetId[] = ["recentLeads"];
const BOTTOM_RIGHT: WidgetId[] = ["sidebar"];

const Index = () => {
  const { widgets, visibleWidgets, hiddenWidgets, toggleWidget, reorderWidgets, resetLayout } = useDashboardLayout();
  const [period, setPeriod] = useState("30d");
  const { user } = useAuthContext();
  const [userName, setUserName] = useState("");
  const { data: dashboardData, isLoading } = useDashboardAll();

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("full_name")
      .eq("user_id", user.id)
      .limit(1)
      .single()
      .then(({ data }) => {
        if (data?.full_name) {
          setUserName(data.full_name.split(" ")[0]);
        }
      });
  }, [user]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = widgets.indexOf(active.id as WidgetId);
      const newIndex = widgets.indexOf(over.id as WidgetId);
      reorderWidgets(arrayMove(widgets, oldIndex, newIndex));
    }
  };

  const fullWidgets = visibleWidgets.filter((w) => FULL_WIDGETS.includes(w));
  const chartWidgets = visibleWidgets.filter((w) => CHART_WIDGETS.includes(w));
  const bottomLeft = visibleWidgets.filter((w) => BOTTOM_LEFT.includes(w));
  const bottomRight = visibleWidgets.filter((w) => BOTTOM_RIGHT.includes(w));

  const todayFormatted = format(new Date(), "EEEE, d 'de' MMMM 'de' yyyy", { locale: pt });

  // Render widget by ID, passing dashboard data via props
  const renderWidget = (id: WidgetId) => {
    switch (id) {
      case "kpis":
        return <DashboardKPIs data={dashboardData?.kpis} isLoading={isLoading} />;
      case "funnel":
        return <FunnelChartWidget data={dashboardData?.funnel} isLoading={isLoading} />;
      case "leadsByOrigin":
        return <LeadsByOriginChart data={dashboardData?.leadsByOrigin} isLoading={isLoading} />;
      case "revenueByArea":
        return <RevenueByAreaChart data={dashboardData?.revenueByArea} isLoading={isLoading} />;
      case "monthlyRevenue":
        return <MonthlyRevenueChart data={dashboardData?.monthlyRevenue} isLoading={isLoading} />;
      case "recentLeads":
        return <RecentLeads data={dashboardData?.recentLeads} isLoading={isLoading} />;
      case "sidebar":
        return <DashboardSidebar />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {getGreeting()}{userName ? `, ${userName}` : ""}
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-sm text-muted-foreground capitalize">{todayFormatted}</p>
            <div className="flex items-center gap-1.5 text-xs text-success font-medium">
              <div className="h-1.5 w-1.5 rounded-full bg-success animate-live-pulse" />
              live
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <PeriodFilter value={period} onChange={setPeriod} />
          <DashboardCustomizer
            widgets={widgets}
            hiddenWidgets={hiddenWidgets}
            toggleWidget={toggleWidget}
            resetLayout={resetLayout}
          />
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={visibleWidgets} strategy={verticalListSortingStrategy}>
          <div className="space-y-6">
            {fullWidgets.map((id) => (
              <SortableWidget key={id} id={id}>
                {renderWidget(id)}
              </SortableWidget>
            ))}

            {chartWidgets.length > 0 && (
              <div className="grid gap-5 md:grid-cols-2">
                {chartWidgets.map((id) => (
                  <SortableWidget key={id} id={id}>
                    {renderWidget(id)}
                  </SortableWidget>
                ))}
              </div>
            )}

            {(bottomLeft.length > 0 || bottomRight.length > 0) && (
              <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
                <div className="space-y-6">
                  {bottomLeft.map((id) => (
                    <SortableWidget key={id} id={id}>
                      {renderWidget(id)}
                    </SortableWidget>
                  ))}
                </div>
                {bottomRight.length > 0 && (
                  <div className="space-y-4">
                    {bottomRight.map((id) => (
                      <SortableWidget key={id} id={id}>
                        {renderWidget(id)}
                      </SortableWidget>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
};

export default Index;
