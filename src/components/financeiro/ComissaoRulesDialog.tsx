import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useCommissionRules, useSaveCommissionRule } from "@/hooks/useCommissions";
import { Plus } from "lucide-react";

const ROLES = [
  { value: "comercial", label: "Comercial" },
  { value: "advogado", label: "Advogado" },
  { value: "admin", label: "Admin" },
];

const AREAS = [
  { value: "__all__", label: "Todas as áreas" },
  { value: "trabalhista", label: "Trabalhista" },
  { value: "civil", label: "Civil" },
  { value: "familia", label: "Família" },
  { value: "criminal", label: "Criminal" },
  { value: "imigracao", label: "Imigração" },
  { value: "consumidor", label: "Consumidor" },
  { value: "previdenciario", label: "Previdenciário" },
  { value: "outro", label: "Outro" },
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function ComissaoRulesDialog({ open, onOpenChange }: Props) {
  const { data: rules = [], isLoading } = useCommissionRules();
  const saveRule = useSaveCommissionRule();

  const [newRole, setNewRole] = useState("comercial");
  const [newArea, setNewArea] = useState("__all__");
  const [newPerc, setNewPerc] = useState("10");
  const [newMin, setNewMin] = useState("0");
  const [newMax, setNewMax] = useState("");

  const handleAdd = () => {
    saveRule.mutate({
      role: newRole,
      legal_area: newArea === "__all__" ? null : newArea,
      percentage: Number(newPerc),
      min_value: Number(newMin),
      max_value: newMax ? Number(newMax) : null,
      is_active: true,
    });
  };

  const handleToggle = (rule: any) => {
    saveRule.mutate({ ...rule, is_active: !rule.is_active });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Regras de Comissão</DialogTitle>
        </DialogHeader>

        {/* Add new rule */}
        <div className="flex flex-wrap items-end gap-2 pb-4 border-b">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Papel</label>
            <Select value={newRole} onValueChange={setNewRole}>
              <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Área</label>
            <Select value={newArea} onValueChange={setNewArea}>
              <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {AREAS.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">% Comissão</label>
            <Input type="number" value={newPerc} onChange={(e) => setNewPerc(e.target.value)} className="w-20 h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Mín (€)</label>
            <Input type="number" value={newMin} onChange={(e) => setNewMin(e.target.value)} className="w-24 h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Máx (€)</label>
            <Input type="number" value={newMax} onChange={(e) => setNewMax(e.target.value)} placeholder="∞" className="w-24 h-8 text-xs" />
          </div>
          <Button size="sm" onClick={handleAdd} disabled={saveRule.isPending} className="gap-1 h-8">
            <Plus className="h-3 w-3" /> Adicionar
          </Button>
        </div>

        {/* Rules table */}
        {isLoading ? (
          <div className="py-4 text-center text-muted-foreground">Carregando...</div>
        ) : rules.length === 0 ? (
          <div className="py-4 text-center text-muted-foreground">Nenhuma regra definida.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Papel</TableHead>
                <TableHead>Área</TableHead>
                <TableHead className="text-right">%</TableHead>
                <TableHead className="text-right">Mín</TableHead>
                <TableHead className="text-right">Máx</TableHead>
                <TableHead>Ativo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell className="text-xs capitalize">{rule.role}</TableCell>
                  <TableCell className="text-xs capitalize">{rule.legal_area || "Todas"}</TableCell>
                  <TableCell className="text-right text-xs">{Number(rule.percentage).toFixed(1)}%</TableCell>
                  <TableCell className="text-right text-xs">€{Number(rule.min_value).toFixed(0)}</TableCell>
                  <TableCell className="text-right text-xs">{rule.max_value ? `€${Number(rule.max_value).toFixed(0)}` : "∞"}</TableCell>
                  <TableCell>
                    <Switch checked={rule.is_active} onCheckedChange={() => handleToggle(rule)} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}
