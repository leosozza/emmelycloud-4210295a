import { useState } from "react";
import { Outlet, Navigate } from "react-router-dom";
import { AppHeader } from "@/components/AppHeader";
import { CommandPalette } from "@/components/CommandPalette";
import { useAuthContext } from "@/contexts/AuthContext";
import { LumaSpin } from "@/components/ui/luma-spin";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

export function AppLayout() {
  const { session, loading } = useAuthContext();
  const [cmdOpen, setCmdOpen] = useState(false);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background safe-x">
        <div className="flex flex-col items-center gap-3">
          <LumaSpin />
          <p className="text-sm text-muted-foreground">A carregar...</p>
          <span className="absolute text-6xl md:text-8xl font-bold text-foreground/[0.03] rotate-[-30deg] whitespace-nowrap pointer-events-none select-none">
            Emmely Fernandes
          </span>
        </div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/auth" replace />;
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <AppHeader onSearchClick={() => setCmdOpen(true)}>
            <SidebarTrigger className="mr-1 sm:mr-2 h-9 w-9" />
          </AppHeader>
          <main className="flex-1 p-3 sm:p-4 md:p-6 bg-background safe-x pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <Outlet />
          </main>
        </div>
      </div>
      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} />
    </SidebarProvider>
  );
}
