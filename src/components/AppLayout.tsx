import { useState } from "react";
import { Outlet, Navigate } from "react-router-dom";
import { AppHeader } from "@/components/AppHeader";
import { CommandPalette } from "@/components/CommandPalette";
import { useAuthContext } from "@/contexts/AuthContext";
import { Scale } from "lucide-react";

export function AppLayout() {
  const { session, loading } = useAuthContext();
  const [cmdOpen, setCmdOpen] = useState(false);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary animate-pulse">
            <Scale className="h-6 w-6 text-primary-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">A carregar...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/auth" replace />;
  }

  return (
    <div className="flex min-h-screen w-full flex-col">
      <AppHeader onSearchClick={() => setCmdOpen(true)} />
      <main className="flex-1 p-6 bg-background">
        <Outlet />
      </main>
      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} />
    </div>
  );
}
