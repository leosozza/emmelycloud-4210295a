import { Settings, Check } from "lucide-react";
import { useColorTheme, type ColorTheme } from "@/contexts/ThemeContext";
import { cn } from "@/lib/utils";

const themes: { id: ColorTheme; label: string; colors: string[] }[] = [
  { id: "red", label: "Vermelho", colors: ["hsl(0,56%,39%)", "hsl(48,96%,89%)", "hsl(43,93%,91%)"] },
  { id: "blue", label: "Azul", colors: ["hsl(220,60%,42%)", "hsl(210,80%,90%)", "hsl(210,60%,92%)"] },
];

export default function Configuracoes() {
  const { colorTheme, setColorTheme } = useColorTheme();

  return (
    <div className="max-w-2xl space-y-8">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <Settings className="h-5 w-5 text-primary" strokeWidth={1.5} />
        </div>
        <div>
          <h1 className="text-xl font-bold">Configurações</h1>
          <p className="text-sm text-muted-foreground">Personalize a sua experiência</p>
        </div>
      </div>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Aparência</h2>
        <div className="grid grid-cols-2 gap-4">
          {themes.map((t) => {
            const selected = colorTheme === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setColorTheme(t.id)}
                className={cn(
                  "relative flex flex-col items-center gap-3 rounded-xl border-2 p-5 transition-all hover:shadow-md active:scale-[0.97]",
                  selected
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-border bg-card hover:border-muted-foreground/30"
                )}
              >
                {selected && (
                  <div className="absolute right-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary">
                    <Check className="h-3 w-3 text-primary-foreground" strokeWidth={2.5} />
                  </div>
                )}
                <div className="flex gap-1.5">
                  {t.colors.map((c, i) => (
                    <div
                      key={i}
                      className="h-10 w-10 rounded-lg shadow-inner"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
                <span className={cn("text-sm font-medium", selected ? "text-primary" : "text-foreground")}>
                  {t.label}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
