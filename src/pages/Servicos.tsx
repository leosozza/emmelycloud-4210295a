import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Search, Pencil, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ServiceForm {
  name: string;
  currency: string;
  value: string;
  budget_details: string;
  contract_intro: string;
  contract_details: string;
}

const emptyForm: ServiceForm = {
  name: "",
  currency: "EUR",
  value: "0",
  budget_details: "",
  contract_intro: "",
  contract_details: "",
};

export default function ServicosPage() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ServiceForm>(emptyForm);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: services = [], isLoading } = useQuery({
    queryKey: ["services"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("*")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: ServiceForm) => {
      const payload = {
        name: data.name,
        currency: data.currency,
        value: parseFloat(data.value) || 0,
        budget_details: data.budget_details || null,
        contract_intro: data.contract_intro || null,
        contract_details: data.contract_details || null,
      };
      if (editingId) {
        const { error } = await supabase
          .from("services")
          .update(payload)
          .eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("services").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["services"] });
      setDialogOpen(false);
      setEditingId(null);
      setForm(emptyForm);
      toast({ title: editingId ? "Serviço atualizado" : "Serviço criado" });
    },
    onError: (e: any) => {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("services").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["services"] });
      toast({ title: "Serviço eliminado" });
    },
  });

  const openEdit = (s: any) => {
    setEditingId(s.id);
    setForm({
      name: s.name,
      currency: s.currency,
      value: String(s.value),
      budget_details: s.budget_details || "",
      contract_intro: s.contract_intro || "",
      contract_details: s.contract_details || "",
    });
    setDialogOpen(true);
  };

  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const filtered = services.filter((s: any) =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <Button onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" /> Novo Serviço
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Pesquisar serviços..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Moeda</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead className="w-24">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  A carregar...
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  Nenhum serviço encontrado
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((s: any) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell>{s.currency}</TableCell>
                  <TableCell>{Number(s.value).toFixed(2)} €</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(s)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteMutation.mutate(s.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Editar Serviço" : "Novo Serviço"}
            </DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveMutation.mutate(form);
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-3">
                <Label>Nome *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>
              <div>
                <Label>Moeda</Label>
                <Input
                  value={form.currency}
                  onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                />
              </div>
              <div className="col-span-2">
                <Label>Valor</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.value}
                  onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
                />
              </div>
            </div>

            <Tabs defaultValue="budget">
              <TabsList className="w-full">
                <TabsTrigger value="budget" className="flex-1">
                  Detalhe Orçamento
                </TabsTrigger>
                <TabsTrigger value="intro" className="flex-1">
                  Introdução Contrato
                </TabsTrigger>
                <TabsTrigger value="details" className="flex-1">
                  Detalhe Contrato
                </TabsTrigger>
              </TabsList>
              <TabsContent value="budget">
                <Textarea
                  value={form.budget_details}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, budget_details: e.target.value }))
                  }
                  rows={6}
                  placeholder="Detalhes do orçamento..."
                />
              </TabsContent>
              <TabsContent value="intro">
                <Textarea
                  value={form.contract_intro}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, contract_intro: e.target.value }))
                  }
                  rows={6}
                  placeholder="Introdução do contrato..."
                />
              </TabsContent>
              <TabsContent value="details">
                <Textarea
                  value={form.contract_details}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, contract_details: e.target.value }))
                  }
                  rows={6}
                  placeholder="Detalhes do contrato..."
                />
              </TabsContent>
            </Tabs>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "A guardar..." : "Guardar"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
