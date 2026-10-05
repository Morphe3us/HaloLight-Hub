import { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex w-full flex-col md:flex-row">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <Topbar />
        <main className="flex-1 overflow-y-auto px-4 py-6 md:px-10 md:py-10 w-full max-w-[1280px] mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
