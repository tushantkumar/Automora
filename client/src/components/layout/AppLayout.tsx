import { Sidebar } from "./Sidebar";
import { Bell, Search, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      
      <div className="pl-64">
        {/* Header */}
        <header className="h-16 border-b border-border px-8 flex items-center justify-between sticky top-0 bg-background/80 backdrop-blur-md z-10">
          <div className="flex items-center gap-4 w-96">
            <div className="relative w-full">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                placeholder="Search workflows, customers, emails..." 
                className="pl-9 bg-muted/50 border-transparent hover:bg-muted focus:bg-background focus:border-ring transition-all h-9" 
              />
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="relative text-muted-foreground hover:text-foreground">
              <Bell className="w-5 h-5" />
              <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-background" />
            </Button>
            <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-md shadow-primary/20">
              New Workflow
            </Button>
          </div>
        </header>

        {/* Main Content */}
        <main className="p-8 max-w-7xl mx-auto animate-in-fade">
          {children}
        </main>
      </div>
    </div>
  );
}
