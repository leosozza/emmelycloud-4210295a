type LocaleCode = "pt-BR" | "pt-PT";

const translations: Record<string, Record<LocaleCode, string>> = {
  user: { "pt-BR": "Usuário", "pt-PT": "Utilizador" },
  mobile: { "pt-BR": "Celular", "pt-PT": "Telemóvel" },
  file: { "pt-BR": "Arquivo", "pt-PT": "Ficheiro" },
  team: { "pt-BR": "Equipe", "pt-PT": "Equipa" },
  delete: { "pt-BR": "Excluir", "pt-PT": "Eliminar" },
  save: { "pt-BR": "Salvar", "pt-PT": "Guardar" },
  saving: { "pt-BR": "Salvando...", "pt-PT": "A guardar..." },
  loading: { "pt-BR": "Carregando...", "pt-PT": "A carregar..." },
  search: { "pt-BR": "Buscar", "pt-PT": "Pesquisar" },
  close: { "pt-BR": "Fechar", "pt-PT": "Fechar" },
  cancel: { "pt-BR": "Cancelar", "pt-PT": "Cancelar" },
};

export function createT(locale: LocaleCode) {
  return (key: string): string => {
    return translations[key]?.[locale] ?? key;
  };
}
