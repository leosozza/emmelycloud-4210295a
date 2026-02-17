import { Outlet } from "react-router-dom";
import { AppHeader } from "@/components/AppHeader";

export function AppLayout() {
  return (
    <div className="flex min-h-screen w-full flex-col">
      <AppHeader />
      <main className="flex-1 p-6 bg-background">
        <Outlet />
      </main>
    </div>
  );
}
