import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Contact, Briefcase, MapPin } from "lucide-react";
import ClientesPage from "./Clientes";
import ServicosPage from "./Servicos";
import SEFPage from "./SEF";

export default function CarteiraPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Carteira</h1>

      <Tabs defaultValue="clientes" className="w-full">
        <TabsList className="w-full max-w-md">
          <TabsTrigger value="clientes" className="flex-1 gap-2">
            <Contact className="h-4 w-4" />
            Clientes
          </TabsTrigger>
          <TabsTrigger value="servicos" className="flex-1 gap-2">
            <Briefcase className="h-4 w-4" />
            Serviços
          </TabsTrigger>
          <TabsTrigger value="sef" className="flex-1 gap-2">
            <MapPin className="h-4 w-4" />
            SEF
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
