/**
 * ativos-categorias.js — Default Category Definitions
 *
 * Each category defines:
 *  - name             : display name
 *  - prefix           : asset code prefix  (e.g. "TI" → TI-0001)
 *  - icon             : emoji icon
 *  - color            : hex color for UI
 *  - fields           : dynamic form schema — array of field definitions
 *  - maintenanceTypes : which types apply  ['preventiva','corretiva','inspecao']
 *  - maintenanceConfig: scheduling rules enforced in the maintenance form
 *
 * maintenanceConfig shape:
 *  {
 *    preventiveFrequencyDays : number  — auto-suggest next date for preventive
 *    defaultType             : string  — pre-selected type in new-maint modal
 *    requiresTechnician      : boolean — validation in maintenance form
 *    notes                   : string  — hint shown in maintenance modal
 *  }
 *
 * Field types: text | number | date | select | textarea
 */

export const DEFAULT_CATEGORIES = [
  {
    name: "Informática",
    prefix: "TI",
    icon: "💻",
    color: "#3b82f6",
    maintenanceTypes: ["preventiva", "corretiva"],
    maintenanceConfig: {
      preventiveFrequencyDays: 180,
      defaultType: "preventiva",
      requiresTechnician: false,
      notes: "Verificar poeira, atualizações de SO e estado físico.",
    },
    fields: [
      { key: "marca",        label: "Marca",              type: "text"   },
      { key: "modelo",       label: "Modelo",             type: "text"   },
      { key: "processador",  label: "Processador",        type: "text"   },
      { key: "ram",          label: "Memória RAM",        type: "text"   },
      { key: "armazenamento",label: "Armazenamento",      type: "text"   },
      { key: "nSerie",       label: "Número de Série",    type: "text"   },
      { key: "so",           label: "Sistema Operacional",type: "text"   },
    ],
  },
  {
    name: "Móveis e Utensílios",
    prefix: "MOV",
    icon: "🪑",
    color: "#8b5cf6",
    maintenanceTypes: ["corretiva", "inspecao"],
    maintenanceConfig: {
      preventiveFrequencyDays: null,
      defaultType: "inspecao",
      requiresTechnician: false,
      notes: "Verificar estrutura, estofado e nivelamento.",
    },
    fields: [
      { key: "material",  label: "Material", type: "select",
        options: ["Madeira", "Metal", "Plástico", "Tecido / MDF", "Outro"] },
      { key: "cor",       label: "Cor",                 type: "text" },
      { key: "dimensoes", label: "Dimensões (LxAxP)",   type: "text" },
    ],
  },
  {
    name: "Maquinário Industrial",
    prefix: "MAQ",
    icon: "⚙️",
    color: "#f59e0b",
    maintenanceTypes: ["preventiva", "corretiva", "inspecao"],
    maintenanceConfig: {
      preventiveFrequencyDays: 90,
      defaultType: "preventiva",
      requiresTechnician: true,
      notes: "Verificar lubrificação, correias, filtros e apertos. Exige técnico habilitado.",
    },
    fields: [
      { key: "fabricante",    label: "Fabricante",          type: "text"   },
      { key: "modelo",        label: "Modelo",              type: "text"   },
      { key: "nSerie",        label: "Número de Série",     type: "text"   },
      { key: "anoFabricacao", label: "Ano de Fabricação",   type: "number" },
      { key: "potenciaKW",    label: "Potência (kW)",       type: "number" },
      { key: "tensao",        label: "Tensão",              type: "select",
        options: ["110V", "220V", "380V", "Trifásico 220V", "Trifásico 380V"] },
      { key: "horasOperacao", label: "Horas de Operação",   type: "number" },
    ],
  },
  {
    name: "Ferramentas",
    prefix: "FER",
    icon: "🔧",
    color: "#64748b",
    maintenanceTypes: ["corretiva", "inspecao"],
    maintenanceConfig: {
      preventiveFrequencyDays: 365,
      defaultType: "inspecao",
      requiresTechnician: false,
      notes: "Verificar desgaste, calibração e integridade física.",
    },
    fields: [
      { key: "tipo",   label: "Tipo",                 type: "text" },
      { key: "marca",  label: "Marca",                type: "text" },
      { key: "nSerie", label: "Número de Série",      type: "text" },
      { key: "norma",  label: "Norma / Certificação", type: "text" },
    ],
  },
  {
    name: "Logística e Armazenagem",
    prefix: "LOG",
    icon: "📦",
    color: "#10b981",
    maintenanceTypes: ["preventiva", "corretiva", "inspecao"],
    maintenanceConfig: {
      preventiveFrequencyDays: 180,
      defaultType: "inspecao",
      requiresTechnician: false,
      notes: "Verificar capacidade de carga, integridade estrutural e fixações.",
    },
    fields: [
      { key: "tipo",       label: "Tipo", type: "select",
        options: ["Prateleira", "Rack", "Palete", "Esteira", "Empilhadeira Manual", "Outro"] },
      { key: "capacidade", label: "Capacidade (kg)",     type: "number" },
      { key: "dimensoes",  label: "Dimensões (LxAxP m)", type: "text"   },
      { key: "material",   label: "Material",            type: "text"   },
    ],
  },
  {
    name: "Equipamentos de Segurança",
    prefix: "SEG",
    icon: "🦺",
    color: "#ef4444",
    maintenanceTypes: ["preventiva", "inspecao"],
    maintenanceConfig: {
      preventiveFrequencyDays: 180,
      defaultType: "inspecao",
      requiresTechnician: false,
      notes: "Verificar validade, integridade e conformidade com a norma CA.",
    },
    fields: [
      { key: "tipo",           label: "Tipo de Equipamento",  type: "text" },
      { key: "ca",             label: "Nº CA / Norma",        type: "text" },
      { key: "validade",       label: "Validade",             type: "date" },
      { key: "ultimaInspecao", label: "Última Inspeção",      type: "date" },
      { key: "capacidade",     label: "Capacidade / Classe",  type: "text" },
    ],
  },
  {
    name: "Cozinha e Apoio",
    prefix: "COZ",
    icon: "🍳",
    color: "#f97316",
    maintenanceTypes: ["preventiva", "corretiva"],
    maintenanceConfig: {
      preventiveFrequencyDays: 90,
      defaultType: "preventiva",
      requiresTechnician: false,
      notes: "Limpeza profunda, verificação de selos e resistências.",
    },
    fields: [
      { key: "marca",      label: "Marca",      type: "text"   },
      { key: "modelo",     label: "Modelo",     type: "text"   },
      { key: "capacidade", label: "Capacidade", type: "text"   },
      { key: "tensao",     label: "Tensão",     type: "select",
        options: ["110V", "220V", "Gás", "N/A"] },
    ],
  },
  {
    name: "Climatização",
    prefix: "CLIM",
    icon: "❄️",
    color: "#06b6d4",
    maintenanceTypes: ["preventiva", "corretiva", "inspecao"],
    maintenanceConfig: {
      preventiveFrequencyDays: 90,
      defaultType: "preventiva",
      requiresTechnician: true,
      notes: "Limpeza de filtros, verificação de gás, dreno e apertos. Exige técnico habilitado.",
    },
    fields: [
      { key: "marca",            label: "Marca",                    type: "text"   },
      { key: "modelo",           label: "Modelo",                   type: "text"   },
      { key: "btu",              label: "Capacidade BTU",           type: "number" },
      { key: "tensao",           label: "Tensão",                   type: "select",
        options: ["110V", "220V", "Bifásico", "Trifásico"] },
      { key: "alturaInstalacao", label: "Altura de Instalação (m)", type: "number" },
      { key: "ultimaLimpeza",    label: "Última Limpeza",           type: "date"   },
      { key: "nSerie",           label: "Número de Série",          type: "text"   },
    ],
  },
  {
    name: "Comunicação",
    prefix: "COM",
    icon: "📡",
    color: "#a855f7",
    maintenanceTypes: ["corretiva", "inspecao"],
    maintenanceConfig: {
      preventiveFrequencyDays: 365,
      defaultType: "inspecao",
      requiresTechnician: false,
      notes: "Verificar conectividade, firmware e integridade física.",
    },
    fields: [
      { key: "tipo",   label: "Tipo", type: "select",
        options: ["Rádio", "Telefone", "Interfone", "Switch", "Roteador",
                  "Câmera IP", "DVR/NVR", "Outro"] },
      { key: "marca",  label: "Marca",           type: "text" },
      { key: "modelo", label: "Modelo",          type: "text" },
      { key: "nSerie", label: "Número de Série", type: "text" },
      { key: "ip",     label: "Endereço IP",     type: "text" },
    ],
  },
  {
    name: "Infraestrutura",
    prefix: "INF",
    icon: "🏗️",
    color: "#475569",
    maintenanceTypes: ["preventiva", "corretiva", "inspecao"],
    maintenanceConfig: {
      preventiveFrequencyDays: 180,
      defaultType: "inspecao",
      requiresTechnician: true,
      notes: "Inspeção obrigatória semestral. Verificar rachaduras, infiltrações e instalações.",
    },
    fields: [
      { key: "tipo",           label: "Tipo", type: "select",
        options: ["Parede", "Telhado", "Piso", "Forro", "Iluminação",
                  "Quadro Elétrico", "Instalação Elétrica", "Instalação Hidráulica",
                  "Porta / Portão", "Janela", "Outro"] },
      { key: "area",           label: "Área (m²)",       type: "number" },
      { key: "material",       label: "Material",        type: "text"   },
      { key: "ultimaInspecao", label: "Última Inspeção", type: "date"   },
      { key: "observacoes",    label: "Observações",     type: "textarea" },
    ],
  },
  {
    name: "Outros",
    prefix: "OUT",
    icon: "📎",
    color: "#94a3b8",
    maintenanceTypes: ["corretiva", "inspecao"],
    maintenanceConfig: {
      preventiveFrequencyDays: null,
      defaultType: "corretiva",
      requiresTechnician: false,
      notes: null,
    },
    fields: [
      { key: "descricao", label: "Descrição Adicional", type: "textarea" },
    ],
  },
];

/** Predefined factory locations */
export const LOCATIONS = [
  "Produção",
  "Almoxarifado",
  "Manutenção",
  "Administrativo",
  "RH",
  "Financeiro",
  "TI",
  "Cozinha",
  "Refeitório",
  "Recepção",
  "Depósito",
  "Área Externa",
  "Portaria",
  "Vestiário",
  "Laboratório",
  "Expédição",
  "Carregamento",
];
