import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { VirtualTable } from "@/components/ui/VirtualTable";
import { Plus, Search, Pencil, Trash2, UserPlus, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ClientContact {
  id?: string;
  name: string;
  phone: string;
  mobile: string;
  email: string;
}

interface ClientForm {
  name: string;
  document_type: string;
  document_number: string;
  nationality: string;
  birth_date: string;
  nib: string;
  address: string;
  postal_code: string;
  freguesia: string;
  concelho: string;
  distrito: string;
  country: string;
  has_active_contract: boolean;
  notes: string;
  contacts: ClientContact[];
}

const emptyForm: ClientForm = {
  name: "",
  document_type: "",
  document_number: "",
  nationality: "",
  birth_date: "",
  nib: "",
  address: "",
  postal_code: "",
  freguesia: "",
  concelho: "",
  distrito: "",
  country: "PORTUGAL",
  has_active_contract: false,
  notes: "",
  contacts: [],
};

export default function ClientesPage() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ClientForm>(emptyForm);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: contactsMap = {} } = useQuery({
    queryKey: ["client_contacts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_contacts")
        .select("*");
      if (error) throw error;
      const map: Record<string, ClientContact[]> = {};
      data.forEach((c: any) => {
        if (!map[c.client_id]) map[c.client_id] = [];
        map[c.client_id].push(c);
      });
      return map;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: ClientForm) => {
      const { contacts, ...clientData } = data;
      const payload = {
        ...clientData,
        birth_date: clientData.birth_date || null,
      };

      let clientId: string;
      if (editingId) {
        const { error } = await supabase
          .from("clients")
          .update(payload)
          .eq("id", editingId);
        if (error) throw error;
        clientId = editingId;
        // Remove old contacts
        await supabase
          .from("client_contacts")
          .delete()
          .eq("client_id", clientId);
      } else {
        const { data: inserted, error } = await supabase
          .from("clients")
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        clientId = inserted.id;
      }

      // Insert contacts
      if (contacts.length > 0) {
        const contactsPayload = contacts.map((c) => ({
          client_id: clientId,
          name: c.name,
          phone: c.phone || null,
          mobile: c.mobile || null,
          email: c.email || null,
        }));
        const { error } = await supabase
          .from("client_contacts")
          .insert(contactsPayload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["client_contacts"] });
      setDialogOpen(false);
      setEditingId(null);
      setForm(emptyForm);
      toast({ title: editingId ? "Cliente atualizado" : "Cliente criado" });
    },
    onError: (e: any) => {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("clients").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["client_contacts"] });
      toast({ title: "Cliente eliminado" });
    },
  });

  const openEdit = (client: any) => {
    setEditingId(client.id);
    setForm({
      name: client.name,
      document_type: client.document_type || "",
      document_number: client.document_number || "",
      nationality: client.nationality || "",
      birth_date: client.birth_date || "",
      nib: client.nib || "",
      address: client.address || "",
      postal_code: client.postal_code || "",
      freguesia: client.freguesia || "",
      concelho: client.concelho || "",
      distrito: client.distrito || "",
      country: client.country || "PORTUGAL",
      has_active_contract: client.has_active_contract,
      notes: client.notes || "",
      contacts: (contactsMap[client.id] || []).map((c: any) => ({
        name: c.name,
        phone: c.phone || "",
        mobile: c.mobile || "",
        email: c.email || "",
      })),
    });
    setDialogOpen(true);
  };

  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const addContact = () => {
    setForm((f) => ({
      ...f,
      contacts: [...f.contacts, { name: "", phone: "", mobile: "", email: "" }],
    }));
  };

  const removeContact = (idx: number) => {
    setForm((f) => ({
      ...f,
      contacts: f.contacts.filter((_, i) => i !== idx),
    }));
  };

  const updateContact = (idx: number, field: keyof ClientContact, value: string) => {
    setForm((f) => ({
      ...f,
      contacts: f.contacts.map((c, i) =>
        i === idx ? { ...c, [field]: value } : c
      ),
    }));
  };

  const filtered = clients.filter((c: any) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <Button onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" /> Novo Cliente
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Pesquisar clientes..."
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
              <TableHead>Documento</TableHead>
              <TableHead>ID Access</TableHead>
              <TableHead>ID Bitrix</TableHead>
              <TableHead>Nacionalidade</TableHead>
              <TableHead>Contrato</TableHead>
              <TableHead className="w-24">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  A carregar...
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  Nenhum cliente encontrado
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((c: any) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>{c.document_number || "—"}</TableCell>
                  <TableCell>{c.id_access || "—"}</TableCell>
                  <TableCell>{c.bitrix24_id || "—"}</TableCell>
                  <TableCell>{c.nationality || "—"}</TableCell>
                  <TableCell>
                    {c.has_active_contract ? (
                      <Badge>Ativo</Badge>
                    ) : (
                      <Badge variant="secondary">Inativo</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(c)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteMutation.mutate(c.id)}
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
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Editar Cliente" : "Novo Cliente"}
            </DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveMutation.mutate(form);
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Nome *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>
              <div>
                <Label>Tipo Documento</Label>
                <Input
                  value={form.document_type}
                  onChange={(e) => setForm((f) => ({ ...f, document_type: e.target.value }))}
                  placeholder="Passaporte, BI, CC..."
                />
              </div>
              <div>
                <Label>Nº Documento</Label>
                <Input
                  value={form.document_number}
                  onChange={(e) => setForm((f) => ({ ...f, document_number: e.target.value }))}
                />
              </div>
              <div>
                <Label>Nacionalidade</Label>
                <Input
                  value={form.nationality}
                  onChange={(e) => setForm((f) => ({ ...f, nationality: e.target.value }))}
                />
              </div>
              <div>
                <Label>Data de Nascimento</Label>
                <Input
                  type="date"
                  value={form.birth_date}
                  onChange={(e) => setForm((f) => ({ ...f, birth_date: e.target.value }))}
                />
              </div>
              <div>
                <Label>NIB</Label>
                <Input
                  value={form.nib}
                  onChange={(e) => setForm((f) => ({ ...f, nib: e.target.value }))}
                />
              </div>
              <div>
                <Label>País</Label>
                <Input
                  value={form.country}
                  onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Morada</Label>
                <Input
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                />
              </div>
              <div>
                <Label>Código Postal</Label>
                <Input
                  value={form.postal_code}
                  onChange={(e) => setForm((f) => ({ ...f, postal_code: e.target.value }))}
                />
              </div>
              <div>
                <Label>Freguesia</Label>
                <Input
                  value={form.freguesia}
                  onChange={(e) => setForm((f) => ({ ...f, freguesia: e.target.value }))}
                />
              </div>
              <div>
                <Label>Concelho</Label>
                <Input
                  value={form.concelho}
                  onChange={(e) => setForm((f) => ({ ...f, concelho: e.target.value }))}
                />
              </div>
              <div>
                <Label>Distrito</Label>
                <Input
                  value={form.distrito}
                  onChange={(e) => setForm((f) => ({ ...f, distrito: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.has_active_contract}
                onChange={(e) =>
                  setForm((f) => ({ ...f, has_active_contract: e.target.checked }))
                }
                id="contract-active"
              />
              <Label htmlFor="contract-active">Contrato Ativo</Label>
            </div>

            <div>
              <Label>Observações</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={3}
              />
            </div>

            {/* Contacts Section */}
            <div className="space-y-3 rounded-md border p-4">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Contactos</Label>
                <Button type="button" variant="outline" size="sm" onClick={addContact}>
                  <UserPlus className="mr-1 h-4 w-4" /> Adicionar
                </Button>
              </div>
              {form.contacts.map((contact, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2 items-end">
                  <div>
                    <Label className="text-xs">Nome</Label>
                    <Input
                      value={contact.name}
                      onChange={(e) => updateContact(idx, "name", e.target.value)}
                      placeholder="Nome"
                      required
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Telefone</Label>
                    <Input
                      value={contact.phone}
                      onChange={(e) => updateContact(idx, "phone", e.target.value)}
                      placeholder="Telefone"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Telemóvel</Label>
                    <Input
                      value={contact.mobile}
                      onChange={(e) => updateContact(idx, "mobile", e.target.value)}
                      placeholder="Telemóvel"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Email</Label>
                    <Input
                      value={contact.email}
                      onChange={(e) => updateContact(idx, "email", e.target.value)}
                      placeholder="Email"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeContact(idx)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {form.contacts.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhum contacto adicionado</p>
              )}
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
