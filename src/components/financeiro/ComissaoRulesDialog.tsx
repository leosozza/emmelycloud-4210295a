import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useCommissionRules, useSaveCommissionRule, useDeleteCommissionRule, CommissionRule } from "@/hooks/useCommissions";
import { Plus, Trash2, Calculator, Pencil, Check, X } from "lucide-react";

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
  const deleteRule = useDeleteCommissionRule();

  // New rule form
  const [newRole, setNewRole] = useState("comercial");
  const [newArea, setNewArea] = useState("__all__");
  const [newPerc, setNewPerc] = useState("10");
  const [newMin, setNewMin] = useState("0");
  const [newMax, setNewMax] = useState("");

  // Inline editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<CommissionRule>>({});

  // Simulator
  const [simValue, setSimValue] = useState("");
  const [simRole, setSimRole] = useState("comercial");
  const [simArea, setSimArea] = useState("__all__");

  // Delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const activeRules = rules.filter((r) => r.is_active);
  const inactiveRules = rules.filter((r) => !r.is_active);

  // Simulator result
  const simResult = useMemo(() => {
    const val = Number(simValue);
    if (!val || val <= 0) return null;

    const matching = activeRules.filter((r) => {
      if (r.role !== simRole) return false;
      if (simArea !== "__all__" && r.legal_area && r.legal_area !== simArea) return false;
      if (r.legal_area === null || simArea === "__all__" || r.legal_area === simArea) {
        if (val < r.min_value) return false;
        if (r.max_value && val > r.max_value) return false;
        return true;
      }
      return false;
    });

    if (matching.length === 0) return { rule: null, commission: 0 };

    // Pick the most specific rule (with legal_area match first, then highest percentage)
    const best = matching.sort((a, b) => {
      if (a.legal_area && !b.legal_area) return -1;
      if (!a.legal_area && b.legal_area) return 1;
      return b.percentage - a.percentage;
    })[0];

    return { rule: best, commission: (val * best.percentage) / 100 };
  }, [simValue, simRole, simArea, activeRules]);

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

  const handleToggle = (rule: CommissionRule) => {
    saveRule.mutate({ ...rule, is_active: !rule.is_active });
  };

  const startEdit = (rule: CommissionRule) => {
    setEditingId(rule.id);
    setEditData({ ...rule });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditData({});
  };

  const saveEdit = () => {
    if (!editingId) return;
    saveRule.mutate(editData as CommissionRule, { onSuccess: () => cancelEdit() });
  };

  const confirmDelete = (id: string) => {
    deleteRule.mutate(id, { onSuccess: () => setDeletingId(null) });
  };

  const renderRuleRow = (rule: CommissionRule) => {
    const isEditing = editingId === rule.id;
    const isDeleting = deletingId === rule.id;

    if (isEditing) {
      return (
        <TableRow key={rule.id} className="bg-accent/30">
          <TableCell>
            <Select value={editData.role || rule.role} onValueChange={(v) => setEditData({ ...editData, role: v })}>
              <SelectTrigger className="h-7 text-xs w-[100px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </TableCell>
          <TableCell>
            <Select
              value={editData.legal_area || "__all__"}
              onValueChange={(v) => setEditData({ ...editData, legal_area: v === "__all__" ? null : v })}
            >
              <SelectTrigger className="h-7 text-xs w-[120px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {AREAS.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </TableCell>
          <TableCell>
            <Input
              type="number"
              value={editData.percentage ?? rule.percentage}
              onChange={(e) => setEditData({ ...editData, percentage: Number(e.target.value) })}
              className="h-7 w-16 text-xs text-right"
            />
          </TableCell>
          <TableCell>
            <Input
              type="number"
              value={editData.min_value ?? rule.min_value}
              onChange={(e) => setEditData({ ...editData, min_value: Number(e.target.value) })}
              className="h-7 w-20 text-xs text-right"
            />
          </TableCell>
          <TableCell>
            <Input
              type="number"
              value={editData.max_value ?? ""}
              onChange={(e) => setEditData({ ...editData, max_value: e.target.value ? Number(e.target.value) : null })}
              placeholder="∞"
              className="h-7 w-20 text-xs text-right"
            />
          </TableCell>
          <TableCell>
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={saveEdit} disabled={saveRule.isPending}>
                <Check className="h-3.5 w-3.5 text-green-600" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={cancelEdit}>
                <X className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
          </TableCell>
        </TableRow>
      );
    }

    return (
      <TableRow key={rule.id}>
        <TableCell className="text-xs capitalize">{rule.role}</TableCell>
        <TableCell className="text-xs capitalize">{rule.legal_area || "Todas"}</TableCell>
        <TableCell className="text-right text-xs">{Number(rule.percentage).toFixed(1)}%</TableCell>
        <TableCell className="text-right text-xs">€{Number(rule.min_value).toFixed(0)}</TableCell>
        <TableCell className="text-right text-xs">{rule.max_value ? `€${Number(rule.max_value).toFixed(0)}` : "∞"}</TableCell>
        <TableCell>
          <div className="flex items-center gap-1">
            <Switch checked={rule.is_active} onCheckedChange={() => handleToggle(rule)} />
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(rule)}>
              <Pencil className="h-3 w-3" />
            </Button>
            {isDeleting ? (
              <div className="flex gap-1">
                <Button size="sm" variant="destructive" className="h-7 text-xs px-2" onClick={() => confirmDelete(rule.id)} disabled={deleteRule.isPending}>
                  Sim
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => setDeletingId(null)}>
                  Não
                </Button>
              </div>
            ) : (
              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setDeletingId(rule.id)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        </TableCell>
      </TableRow>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configuração de Comissões</DialogTitle>
        </DialogHeader>

        {/* Simulator */}
        <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Calculator className="h-4 w-4 text-primary" />
            Simulador de Comissão
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Valor da proposta (€)</label>
              <Input
                type="number"
                value={simValue}
                onChange={(e) => setSimValue(e.target.value)}
                placeholder="Ex: 5000"
                className="w-32 h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Papel</label>
              <Select value={simRole} onValueChange={setSimRole}>
                <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Área jurídica</label>
              <Select value={simArea} onValueChange={setSimArea}>
                <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {AREAS.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          {simResult && (
            <div className="rounded-md border bg-background p-3 text-sm">
              {simResult.rule ? (
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-muted-foreground">Regra aplicada: </span>
                    <span className="font-medium capitalize">{simResult.rule.role}</span>
                    {simResult.rule.legal_area && (
                      <span className="text-muted-foreground"> · {simResult.rule.legal_area}</span>
                    )}
                    <span className="text-muted-foreground"> · {Number(simResult.rule.percentage).toFixed(1)}%</span>
                  </div>
                  <div className="text-lg font-bold text-primary">
                    €{simResult.commission.toFixed(2)}
                  </div>
                </div>
              ) : (
                <span className="text-muted-foreground">Nenhuma regra encontrada para estes critérios.</span>
              )}
            </div>
          )}
        </div>

        <Separator />

        {/* Add new rule */}
        <div className="space-y-2">
          <span className="text-sm font-medium">Adicionar regra</span>
          <div className="flex flex-wrap items-end gap-2">
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
        </div>

        <Separator />

        {/* Active rules */}
        {isLoading ? (
          <div className="py-4 text-center text-muted-foreground">Carregando...</div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <span className="text-sm font-medium">Regras activas ({activeRules.length})</span>
              {activeRules.length === 0 ? (
                <div className="py-3 text-center text-xs text-muted-foreground">Nenhuma regra activa.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Papel</TableHead>
                      <TableHead>Área</TableHead>
                      <TableHead className="text-right">%</TableHead>
                      <TableHead className="text-right">Mín</TableHead>
                      <TableHead className="text-right">Máx</TableHead>
                      <TableHead>Acções</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>{activeRules.map(renderRuleRow)}</TableBody>
                </Table>
              )}
            </div>

            {inactiveRules.length > 0 && (
              <div className="space-y-2">
                <span className="text-sm font-medium text-muted-foreground">Inactivas ({inactiveRules.length})</span>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Papel</TableHead>
                      <TableHead>Área</TableHead>
                      <TableHead className="text-right">%</TableHead>
                      <TableHead className="text-right">Mín</TableHead>
                      <TableHead className="text-right">Máx</TableHead>
                      <TableHead>Acções</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>{inactiveRules.map(renderRuleRow)}</TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
