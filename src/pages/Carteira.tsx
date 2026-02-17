import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Contact, Briefcase, MapPin } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/PageHeader";
import ClientesPage from "./Clientes";
import ServicosPage from "./Servicos";
import SEFPage from "./SEF";

export default function CarteiraPage() {
  const { data: clientsCount } = useQuery({
    queryKey: ["clients-count"],
    queryFn: async () => {
      const { count } = await supabase.from("clients").select("id", { count: "exact", head: true });
      return count ?? 0;
    },
  });

  const { data: servicesCount } = useQuery({
    queryKey: ["services-count"],
    queryFn: async () => {
      const { count } = await supabase.from("services").select("id", { count: "exact", head: true });
      return count ?? 0;
    },
  });

  const { data: sefCount } = useQuery({
    queryKey: ["sef-count"],
    queryFn: async () => {
      const { count } = await supabase.from("sef_locations").select("id", { count: "exact", head: true });
      return count ?? 0;
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Carteira" description="Clientes, serviços e localizações SEF" />

      <Tabs defaultValue="clientes" className="w-full">
        <TabsList className="w-full max-w-md">
          <TabsTrigger value="clientes" className="flex-1 gap-2">
            <Contact className="h-4 w-4" />
            Clientes
            <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">{clientsCount ?? "..."}</Badge>
          </TabsTrigger>
          <TabsTrigger value="servicos" className="flex-1 gap-2">
            <Briefcase className="h-4 w-4" />
            Serviços
            <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">{servicesCount ?? "..."}</Badge>
          </TabsTrigger>
          <TabsTrigger value="sef" className="flex-1 gap-2">
            <MapPin className="h-4 w-4" />
            SEF
            <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">{sefCount ?? "..."}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="clientes">
          <ClientesPage />
        </TabsContent>
        <TabsContent value="servicos">
          <ServicosPage />
        </TabsContent>
        <TabsContent value="sef">
          <SEFPage />
        </TabsContent>
      </Tabs>
    </div>
  );
}
