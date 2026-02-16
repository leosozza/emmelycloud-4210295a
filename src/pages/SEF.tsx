import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Search, Pencil, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const REGIONAL_DIRECTIONS = [
  "Direção Regional de Lisboa e Vale do Tejo",
  "Direção Regional do Norte",
  "Direção Regional do Centro",
  "Direção Regional do Alentejo",
  "Direção Regional do Algarve",
  "Direção Regional dos Açores",
  "Direção Regional da Madeira",
];

interface SEFForm {
  regional_direction: string;
  name: string;
  details: string;
}

const emptyForm: SEFForm = {
  regional_direction: "",
  name: "",
  details: "",
};

export default function SEFPage() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<SEFForm>(emptyForm);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: locations = [], isLoading } = useQuery({
    queryKey: ["sef_locations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sef_locations")
        .select("*")
        .order("regional_direction, name");
      if (error) throw error;
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: SEFForm) => {
      const payload = {
        regional_direction: data.regional_direction,
        name: data.name,
        details: data.details || null,
      };
      if (editingId) {
        const { error } = await supabase
          .from("sef_locations")
          .update(payload)
          .eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("sef_locations").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sef_locations"] });
      setDialogOpen(false);
      setEditingId(null);
      setForm(emptyForm);
      toast({ title: editingId ? "Localização atualizada" : "Localização criada" });
    },
    onError: (e: any) => {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("sef_locations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sef_locations"] });
      toast({ title: "Localização eliminada" });
    },
  });

  const openEdit = (loc: any) => {
    setEditingId(loc.id);
    setForm({
      regional_direction: loc.regional_direction,
      name: loc.name,
      details: loc.details || "",
    });
    setDialogOpen(true);
  };

  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const filtered = locations.filter(
    (l: any) =>
      l.name.toLowerCase().includes(search.toLowerCase()) ||
      l.regional_direction.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Localizações SEF</h1>
        <Button onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" /> Nova Localização
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Pesquisar localizações..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Direção Regional</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead className="w-24">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  A carregar...
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  Nenhuma localização encontrada
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((l: any) => (
                <TableRow key={l.id}>
                  <TableCell>{l.regional_direction}</TableCell>
                  <TableCell className="font-medium">{l.name}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(l)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteMutation.mutate(l.id)}
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Editar Localização" : "Nova Localização"}
            </DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveMutation.mutate(form);
            }}
            className="space-y-4"
          >
            <div>
              <Label>Direção Regional *</Label>
              <Select
                value={form.regional_direction}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, regional_direction: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a direção regional" />
                </SelectTrigger>
                <SelectContent>
                  {REGIONAL_DIRECTIONS.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Nome *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </div>
            <div>
              <Label>Detalhes</Label>
              <Textarea
                value={form.details}
                onChange={(e) => setForm((f) => ({ ...f, details: e.target.value }))}
                rows={4}
              />
            </div>
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
