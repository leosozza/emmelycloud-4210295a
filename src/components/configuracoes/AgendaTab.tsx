import { useEffect, useState } from "react";
import { Save, RefreshCw, Calendar, Clock, Video, User } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useBitrixUsers } from "@/hooks/useBitrixUsers";

const WEEKDAYS = [
  { id: 1, label: "Seg" },
  { id: 2, label: "Ter" },
  { id: 3, label: "Qua" },
  { id: 4, label: "Qui" },
  { id: 5, label: "Sex" },
  { id: 6, label: "Sáb" },
  { id: 0, label: "Dom" },
];

const DURATIONS = [
  { value: "15", label: "15 minutos" },
  { value: "30", label: "30 minutos" },
  { value: "45", label: "45 minutos" },
  { value: "60", label: "1 hora" },
  { value: "90", label: "1h30" },
  { value: "120", label: "2 horas" },
];

interface AgendaConfig {
  work_start: string;
  work_end: string;
  weekdays: number[];
  duration_minutes: number;
  buffer_minutes: number;
  meeting_type: "presencial" | "online" | "both";
  send_meeting_link: boolean;
  event_title_template: string;
  default_user_id: string;
}

const DEFAULT_CONFIG: AgendaConfig = {
  work_start: "09:00",
  work_end: "18:00",
  weekdays: [1, 2, 3, 4, 5],
  duration_minutes: 30,
  buffer_minutes: 15,
  meeting_type: "both",
  send_meeting_link: true,
  event_title_template: "Reunião — {cliente}",
  default_user_id: "",
};

export default function AgendaTab() {
  const [config, setConfig] = useState<AgendaConfig>(DEFAULT_CONFIG);
  const [configId, setConfigId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const { data: bitrixUsers, isLoading: loadingUsers } = useBitrixUsers();

  useEffect(() => {
    supabase
      .from("payment_gateway_config")
      .select("id, config")
      .eq("gateway", "booking")
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setConfigId(data.id);
          const c = data.config as any;
          if (c) setConfig({ ...DEFAULT_CONFIG, ...c });
        }
        setLoaded(true);
      });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (configId) {
        const { error } = await supabase
          .from("payment_gateway_config")
          .update({ config: config as any, updated_at: new Date().toISOString() })
          .eq("id", configId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("payment_gateway_config")
          .insert({ gateway: "booking" as any, environment: "production", is_active: true, config: config as any });
        if (error) throw error;
      }
      toast.success("Configuração da agenda guardada");
    } catch {
      toast.error("Erro ao guardar");
    }
    setSaving(false);
  };

  const toggleWeekday = (day: number) => {
    setConfig((prev) => ({
      ...prev,
      weekdays: prev.weekdays.includes(day)
        ? prev.weekdays.filter((d) => d !== day)
        : [...prev.weekdays, day].sort(),
    }));
  };

  return (
    <div className="space-y-6">
      {/* Horário de trabalho */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Clock className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">Horário de Trabalho</CardTitle>
              <CardDescription>Defina o período disponível para agendamentos</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Hora de início</Label>
              <Input
                type="time"
                value={config.work_start}
                onChange={(e) => setConfig((p) => ({ ...p, work_start: e.target.value }))}
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Hora de fim</Label>
              <Input
                type="time"
                value={config.work_end}
                onChange={(e) => setConfig((p) => ({ ...p, work_end: e.target.value }))}
                className="h-9"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Dias disponíveis</Label>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((day) => (
                <label
                  key={day.id}
                  className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm cursor-pointer hover:bg-muted/50 transition-colors"
                >
                  <Checkbox
                    checked={config.weekdays.includes(day.id)}
                    onCheckedChange={() => toggleWeekday(day.id)}
                  />
                  {day.label}
                </label>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Duração e intervalo */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <Calendar className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <CardTitle className="text-base">Slots de Atendimento</CardTitle>
              <CardDescription>Duração e intervalo entre reuniões</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Duração padrão</Label>
              <Select
                value={String(config.duration_minutes)}
                onValueChange={(v) => setConfig((p) => ({ ...p, duration_minutes: Number(v) }))}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DURATIONS.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Intervalo entre atendimentos (min)</Label>
              <Input
                type="number"
                min={0}
                max={120}
                step={5}
                value={config.buffer_minutes}
                onChange={(e) => setConfig((p) => ({ ...p, buffer_minutes: Number(e.target.value) }))}
                className="h-9"
              />
              <p className="text-[10px] text-muted-foreground">Tempo de descanso entre reuniões</p>
            </div>
          </div>

          {/* Preview dos slots */}
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-xs font-medium text-muted-foreground mb-2">Exemplo de slots gerados:</p>
            <div className="flex flex-wrap gap-1.5">
              {generatePreviewSlots(config.work_start, config.work_end, config.duration_minutes, config.buffer_minutes)
                .slice(0, 8)
                .map((slot) => (
                  <span key={slot} className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    {slot}
                  </span>
                ))}
              <span className="text-xs text-muted-foreground">…</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Responsável padrão */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
              <User className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <CardTitle className="text-base">Responsável Padrão</CardTitle>
              <CardDescription>Utilizador pré-selecionado ao abrir o calendário de agendamento</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            <Label className="text-xs">Utilizador Bitrix24</Label>
            <Select
              value={config.default_user_id || "__none__"}
              onValueChange={(v) => setConfig((p) => ({ ...p, default_user_id: v === "__none__" ? "" : v }))}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder={loadingUsers ? "A carregar…" : "Selecione…"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Nenhum (escolher ao agendar)</SelectItem>
                {(bitrixUsers || []).map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}{u.position ? ` — ${u.position}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground">
              Este utilizador será automaticamente selecionado quando o calendário abrir no Bitrix24
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Tipo de reunião */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-900/30">
              <Video className="h-5 w-5 text-violet-600" />
            </div>
            <div>
              <CardTitle className="text-base">Reunião Online</CardTitle>
              <CardDescription>Configurações de videoconferência</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs">Tipo de reunião padrão</Label>
            <Select
              value={config.meeting_type}
              onValueChange={(v) => setConfig((p) => ({ ...p, meeting_type: v as any }))}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="presencial">Presencial</SelectItem>
                <SelectItem value="online">Online</SelectItem>
                <SelectItem value="both">Ambos (escolher ao agendar)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">Enviar link de reunião</p>
              <p className="text-xs text-muted-foreground">
                Gera automaticamente o link de videoconferência do Bitrix24 ao agendar reunião online
              </p>
            </div>
            <Switch
              checked={config.send_meeting_link}
              onCheckedChange={(v) => setConfig((p) => ({ ...p, send_meeting_link: v }))}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Título padrão do evento</Label>
            <Input
              value={config.event_title_template}
              onChange={(e) => setConfig((p) => ({ ...p, event_title_template: e.target.value }))}
              className="h-9"
              placeholder="Reunião — {cliente}"
            />
            <p className="text-[10px] text-muted-foreground">
              Use <code className="bg-muted px-1 rounded">{"{cliente}"}</code> para o nome do contacto
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Save button */}
      <Button className="w-full" onClick={handleSave} disabled={saving || !loaded}>
        {saving ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
        {saving ? "A guardar…" : "Guardar Configuração da Agenda"}
      </Button>
    </div>
  );
}

function generatePreviewSlots(start: string, end: string, duration: number, buffer: number): string[] {
  const slots: string[] = [];
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let current = sh * 60 + sm;
  const endMin = eh * 60 + em;
  const step = duration + buffer;

  while (current + duration <= endMin && slots.length < 20) {
    const h = Math.floor(current / 60);
    const m = current % 60;
    slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    current += step;
  }
  return slots;
}
