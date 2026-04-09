import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  FileDown, 
  Check, 
  ArrowRight,
  Workflow,
} from "lucide-react";
import { flowTemplates, templateCategories, FlowTemplate } from "./FlowTemplates";

interface FlowTemplatesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (template: FlowTemplate, name: string) => void;
}

export function FlowTemplatesDialog({ 
  open, 
  onOpenChange, 
  onImport 
}: FlowTemplatesDialogProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<FlowTemplate | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [flowName, setFlowName] = useState("");
  const [step, setStep] = useState<"browse" | "confirm">("browse");

  const filteredTemplates = selectedCategory 
    ? flowTemplates.filter(t => t.category === selectedCategory)
    : flowTemplates;

  const handleSelectTemplate = (template: FlowTemplate) => {
    setSelectedTemplate(template);
    setFlowName(template.name);
    setStep("confirm");
  };

  const handleImport = () => {
    if (selectedTemplate && flowName.trim()) {
      onImport(selectedTemplate, flowName.trim());
      handleClose();
    }
  };

  const handleClose = () => {
    setSelectedTemplate(null);
    setSelectedCategory(null);
    setFlowName("");
    setStep("browse");
    onOpenChange(false);
  };

  const getCategoryColor = (category: string) => {
    return templateCategories.find(c => c.id === category)?.color || "#6b7280";
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileDown className="h-5 w-5 text-primary" />
            {step === "browse" ? "Importar Template de Fluxo" : "Confirmar Importação"}
          </DialogTitle>
          <DialogDescription>
            {step === "browse" 
              ? "Escolha um template pronto para começar rapidamente"
              : "Revise e personalize o nome do seu fluxo"
            }
          </DialogDescription>
        </DialogHeader>

        {step === "browse" ? (
          <>
            {/* Category Filter */}
            <div className="flex gap-2 mb-4">
              <Button
                size="sm"
                variant={selectedCategory === null ? "default" : "outline"}
                onClick={() => setSelectedCategory(null)}
              >
                Todos
              </Button>
              {templateCategories.map((cat) => (
                <Button
                  key={cat.id}
                  size="sm"
                  variant={selectedCategory === cat.id ? "default" : "outline"}
                  onClick={() => setSelectedCategory(cat.id)}
                  style={{
                    borderColor: selectedCategory === cat.id ? cat.color : undefined,
                    backgroundColor: selectedCategory === cat.id ? cat.color : undefined,
                  }}
                >
                  {cat.label}
                </Button>
              ))}
            </div>

            {/* Templates Grid */}
            <ScrollArea className="h-[400px] pr-4">
              <div className="grid gap-4 md:grid-cols-2">
                {filteredTemplates.map((template) => {
                  const Icon = template.icon;
                  const categoryColor = getCategoryColor(template.category);
                  
                  return (
                    <div
                      key={template.id}
                      onClick={() => handleSelectTemplate(template)}
                      className="relative border rounded-lg p-4 cursor-pointer transition-all hover:border-primary hover:shadow-md group"
                    >
                      <div className="flex items-start gap-3">
                        <div 
                          className="h-10 w-10 rounded-lg flex items-center justify-center"
                          style={{ backgroundColor: `${categoryColor}20` }}
                        >
                          <Icon className="h-5 w-5" style={{ color: categoryColor }} />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-medium">{template.name}</h4>
                            <Badge 
                              variant="secondary" 
                              className="text-[10px] h-5"
                              style={{ 
                                backgroundColor: `${categoryColor}20`,
                                color: categoryColor
                              }}
                            >
                              {templateCategories.find(c => c.id === template.category)?.label}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {template.description}
                          </p>
                          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                            <span>{template.nodes.length} blocos</span>
                            <span>{template.edges.length} conexões</span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <ArrowRight className="h-5 w-5 text-primary" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </>
        ) : (
          <div className="space-y-6 py-4">
            {/* Selected Template Preview */}
            {selectedTemplate && (
              <div className="border rounded-lg p-4 bg-muted/30">
                <div className="flex items-center gap-3">
                  <div 
                    className="h-12 w-12 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: `${getCategoryColor(selectedTemplate.category)}20` }}
                  >
                    <selectedTemplate.icon 
                      className="h-6 w-6" 
                      style={{ color: getCategoryColor(selectedTemplate.category) }} 
                    />
                  </div>
                  <div>
                    <h4 className="font-medium">{selectedTemplate.name}</h4>
                    <p className="text-sm text-muted-foreground">{selectedTemplate.description}</p>
                  </div>
                </div>
                
                <div className="mt-4 flex items-center gap-6 text-sm">
                  <div className="flex items-center gap-2">
                    <Workflow className="h-4 w-4 text-muted-foreground" />
                    <span>{selectedTemplate.nodes.length} blocos</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500" />
                    <span>Pronto para usar</span>
                  </div>
                </div>
              </div>
            )}

            {/* Flow Name Input */}
            <div className="space-y-2">
              <Label htmlFor="flow-name">Nome do Fluxo</Label>
              <Input
                id="flow-name"
                placeholder="Digite um nome para o fluxo"
                value={flowName}
                onChange={(e) => setFlowName(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Você pode personalizar o nome ou manter o original
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          {step === "browse" ? (
            <Button variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStep("browse")}>
                Voltar
              </Button>
              <Button onClick={handleImport} disabled={!flowName.trim()}>
                <FileDown className="h-4 w-4 mr-2" />
                Importar Template
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
