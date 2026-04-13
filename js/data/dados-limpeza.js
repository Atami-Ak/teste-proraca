/**
 * dados-limpeza.js — Cleaning Audit Catalog (SIGA v2)
 *
 * Scoring: each item scored 0-5
 * Final score: (sum of scores / max possible) × 100%
 * Tiers: 90-100 Excellent | 75-89 Acceptable | 50-74 Attention | <50 Critical
 *
 * Item types:
 *   "score"     → 5 buttons (0 Péssimo → 5 Excelente)
 *   "passfail"  → Pass (5pts) / Fail (0pts)
 *
 * critical: true  → if score = 0, inspection flagged as CRITICAL, action required
 * requiresPhotoOnFail: true → photo mandatory when score = 0
 * actionType: "cleaning" | "structural" | "material"
 *   cleaning   → internal corrective task
 *   structural → generates Maintenance Work Order
 *   material   → generates Purchase Work Order
 */

export const equipeLimpeza = [
  { id: "LIMP-001", nome: "João Silva",     cargo: "Auxiliar de Limpeza" },
  { id: "LIMP-002", nome: "Maria Oliveira", cargo: "Auxiliar de Limpeza" },
  { id: "LIMP-003", nome: "Carlos Santos",  cargo: "Operador de Limpeza" },
  { id: "LIMP-004", nome: "Ana Costa",      cargo: "Supervisora 5S"      },
];

export const catalogoZonas = [
  // ──────────────────────────────────────────────────────────────
  {
    id: "ZONA-01",
    nome: "Estoque / Expedição",
    icone: "📦",
    setor: "Logística",
    riskLevel: "high",
    descricao: "Área de armazenamento de produtos acabados e expedição.",
    responsaveis: ["LIMP-001", "LIMP-002"],
    sections: [
      {
        id: "z1_s1",
        nome: "🧹 Limpeza Geral",
        items: [
          { id: "z1_s1_1", texto: "Piso varrido, livre de pó, plásticos e detritos", tipo: "score", critical: false, requiresPhotoOnFail: false, actionType: "cleaning" },
          { id: "z1_s1_2", texto: "Ausência de teias de aranha e ninhos de insetos", tipo: "score", critical: false, requiresPhotoOnFail: false, actionType: "cleaning" },
          { id: "z1_s1_3", texto: "Lixeiras esvaziadas e com sacos íntegros",       tipo: "passfail", critical: false, requiresPhotoOnFail: false, actionType: "cleaning" },
          { id: "z1_s1_4", texto: "Iluminação adequada e luminárias limpas",         tipo: "passfail", critical: false, requiresPhotoOnFail: true,  actionType: "structural" },
        ],
      },
      {
        id: "z1_s2",
        nome: "📐 Organização (5S)",
        items: [
          { id: "z1_s2_1", texto: "Corredores livres e desobstruídos",                              tipo: "score",    critical: true,  requiresPhotoOnFail: true,  actionType: "cleaning"   },
          { id: "z1_s2_2", texto: "Paletes alinhados dentro das marcações no piso",                  tipo: "score",    critical: false, requiresPhotoOnFail: false, actionType: "cleaning"   },
          { id: "z1_s2_3", texto: "Produtos identificados com rótulos virados para a frente",         tipo: "passfail", critical: false, requiresPhotoOnFail: false, actionType: "cleaning"   },
          { id: "z1_s2_4", texto: "Ausência de materiais obsoletos ou sucata fora do lugar designado", tipo: "score",    critical: false, requiresPhotoOnFail: false, actionType: "cleaning"   },
          { id: "z1_s2_5", texto: "Empilhadeiras/Carrinhos estacionados na vaga correta",             tipo: "passfail", critical: false, requiresPhotoOnFail: false, actionType: "cleaning"   },
        ],
      },
      {
        id: "z1_s3",
        nome: "⚠️ Segurança",
        items: [
          { id: "z1_s3_1", texto: "Extintores e hidrantes livres de bloqueios e sinalizados", tipo: "passfail", critical: true,  requiresPhotoOnFail: true,  actionType: "structural" },
          { id: "z1_s3_2", texto: "Fitas de demarcação de segurança visíveis e intactas",     tipo: "passfail", critical: false, requiresPhotoOnFail: true,  actionType: "structural" },
          { id: "z1_s3_3", texto: "Saídas de emergência desobstruídas e sinalizadas",         tipo: "passfail", critical: true,  requiresPhotoOnFail: true,  actionType: "structural" },
        ],
      },
      {
        id: "z1_s4",
        nome: "🗑️ Gestão de Resíduos",
        items: [
          { id: "z1_s4_1", texto: "Resíduos segregados corretamente (comum, reciclável, perigoso)", tipo: "score",    critical: false, requiresPhotoOnFail: false, actionType: "cleaning" },
          { id: "z1_s4_2", texto: "Área de descarte de embalagens organizada",                      tipo: "passfail", critical: false, requiresPhotoOnFail: false, actionType: "cleaning" },
        ],
      },
    ],
  },

  // ──────────────────────────────────────────────────────────────
  {
    id: "ZONA-02",
    nome: "Maquinários / Chão de Fábrica",
    icone: "⚙️",
    setor: "Produção",
    riskLevel: "critical",
    descricao: "Chão de fábrica e entorno dos equipamentos de produção.",
    responsaveis: ["LIMP-003"],
    sections: [
      {
        id: "z2_s1",
        nome: "🧹 Limpeza de Equipamentos",
        items: [
          { id: "z2_s1_1", texto: "Máquinas sem acúmulo excessivo de pó, graxas ou restos de produto", tipo: "score",    critical: false, requiresPhotoOnFail: false, actionType: "cleaning"   },
          { id: "z2_s1_2", texto: "Bancadas de trabalho limpas e organizadas",                          tipo: "score",    critical: false, requiresPhotoOnFail: false, actionType: "cleaning"   },
          { id: "z2_s1_3", texto: "Calhas e ralos de escoamento limpos e sem bloqueios",                 tipo: "passfail", critical: false, requiresPhotoOnFail: true,  actionType: "structural" },
          { id: "z2_s1_4", texto: "Lixeiras de descarte de contaminação esvaziadas",                    tipo: "passfail", critical: false, requiresPhotoOnFail: false, actionType: "cleaning"   },
        ],
      },
      {
        id: "z2_s2",
        nome: "⚠️ Segurança Operacional",
        items: [
          { id: "z2_s2_1", texto: "Piso livre de óleo, graxa ou água (risco de queda)",                        tipo: "score",    critical: true,  requiresPhotoOnFail: true,  actionType: "cleaning"   },
          { id: "z2_s2_2", texto: "Painéis elétricos fechados e sem acúmulo de pó (risco de incêndio)",        tipo: "passfail", critical: true,  requiresPhotoOnFail: true,  actionType: "structural" },
          { id: "z2_s2_3", texto: "Inexistência de gambiarras elétricas (fios soltos, fitas isolantes)",        tipo: "passfail", critical: true,  requiresPhotoOnFail: true,  actionType: "structural" },
          { id: "z2_s2_4", texto: "EPIs de uso coletivo disponíveis, limpos e bem acondicionados",              tipo: "passfail", critical: false, requiresPhotoOnFail: true,  actionType: "material"   },
          { id: "z2_s2_5", texto: "Fitas de demarcação de segurança visíveis e não rasgadas",                   tipo: "passfail", critical: false, requiresPhotoOnFail: false, actionType: "structural" },
        ],
      },
      {
        id: "z2_s3",
        nome: "📐 Organização 5S",
        items: [
          { id: "z2_s3_1", texto: "Ferramentas guardadas corretamente no Quadro de Sombras",           tipo: "score",    critical: false, requiresPhotoOnFail: false, actionType: "cleaning"   },
          { id: "z2_s3_2", texto: "Somente ferramentas e materiais em uso estão nas bancadas",         tipo: "passfail", critical: false, requiresPhotoOnFail: false, actionType: "cleaning"   },
          { id: "z2_s3_3", texto: "Identificação visual dos equipamentos está legível e atualizada",   tipo: "passfail", critical: false, requiresPhotoOnFail: false, actionType: "structural" },
        ],
      },
    ],
  },

  // ──────────────────────────────────────────────────────────────
  {
    id: "ZONA-03",
    nome: "Insumos / Matérias-Primas",
    icone: "🌾",
    setor: "Recebimento",
    riskLevel: "critical",
    descricao: "Área de recebimento e armazenamento de matérias-primas.",
    responsaveis: ["LIMP-004"],
    sections: [
      {
        id: "z3_s1",
        nome: "🧹 Higiene e Limpeza",
        items: [
          { id: "z3_s1_1", texto: "Área varrida e sem restos de produto espalhados no piso",             tipo: "score",    critical: false, requiresPhotoOnFail: false, actionType: "cleaning" },
          { id: "z3_s1_2", texto: "Balanças e dosadores higienizados após o uso",                         tipo: "score",    critical: false, requiresPhotoOnFail: false, actionType: "cleaning" },
          { id: "z3_s1_3", texto: "Estrados plásticos limpos e não quebrados",                            tipo: "passfail", critical: false, requiresPhotoOnFail: true,  actionType: "material" },
        ],
      },
      {
        id: "z3_s2",
        nome: "⚠️ Controle de Pragas e Contaminação",
        items: [
          { id: "z3_s2_1", texto: "Ausência total de pragas, fezes de roedores ou insetos",               tipo: "passfail", critical: true,  requiresPhotoOnFail: true,  actionType: "structural" },
          { id: "z3_s2_2", texto: "Sacarias íntegras e sem vazamentos de produto no chão",                tipo: "score",    critical: false, requiresPhotoOnFail: true,  actionType: "cleaning"   },
          { id: "z3_s2_3", texto: "Janelas e portas mantidas fechadas ou teladas",                        tipo: "passfail", critical: true,  requiresPhotoOnFail: true,  actionType: "structural" },
        ],
      },
      {
        id: "z3_s3",
        nome: "📐 Organização (FIFO / 5S)",
        items: [
          { id: "z3_s3_1", texto: "Identificação de validade visível (Sistema FIFO aplicado)",             tipo: "score",    critical: false, requiresPhotoOnFail: false, actionType: "cleaning" },
          { id: "z3_s3_2", texto: "Paletes de madeira em bom estado, sem pregos soltos",                  tipo: "passfail", critical: false, requiresPhotoOnFail: true,  actionType: "material" },
          { id: "z3_s3_3", texto: "Sem ferramentas esquecidas perto das moegas (risco de quebra)",         tipo: "passfail", critical: true,  requiresPhotoOnFail: true,  actionType: "structural"},
          { id: "z3_s3_4", texto: "Lixeiras da área esvaziadas com sacos íntegros",                       tipo: "passfail", critical: false, requiresPhotoOnFail: false, actionType: "cleaning" },
        ],
      },
    ],
  },

  // ──────────────────────────────────────────────────────────────
  {
    id: "ZONA-04",
    nome: "Áreas de Apoio",
    icone: "🚻",
    setor: "Facilities",
    riskLevel: "medium",
    descricao: "Banheiros, refeitório, almoxarifado e oficina.",
    responsaveis: ["LIMP-001", "LIMP-002", "LIMP-003", "LIMP-004"],
    sections: [
      {
        id: "z4_s1",
        nome: "🚿 Banheiros e Sanitários",
        items: [
          { id: "z4_s1_1", texto: "Vasos sanitários e mictórios higienizados e sem odores",       tipo: "score",    critical: false, requiresPhotoOnFail: false, actionType: "cleaning" },
          { id: "z4_s1_2", texto: "Pias limpas, sem restos de sabão, barba ou sujeira",           tipo: "score",    critical: false, requiresPhotoOnFail: false, actionType: "cleaning" },
          { id: "z4_s1_3", texto: "Saboneteiras e papéis (toalha/higiênico) abastecidos",         tipo: "passfail", critical: false, requiresPhotoOnFail: true,  actionType: "material" },
          { id: "z4_s1_4", texto: "Espelhos e vidros limpos e sem marcas de respingos",           tipo: "score",    critical: false, requiresPhotoOnFail: false, actionType: "cleaning" },
          { id: "z4_s1_5", texto: "Piso lavado e sem manchas, mofo ou lodo",                     tipo: "score",    critical: false, requiresPhotoOnFail: true,  actionType: "cleaning" },
        ],
      },
      {
        id: "z4_s2",
        nome: "🍽️ Refeitório e Cozinha",
        items: [
          { id: "z4_s2_1", texto: "Mesas do refeitório limpas, sem restos de comida",             tipo: "score",    critical: false, requiresPhotoOnFail: false, actionType: "cleaning" },
          { id: "z4_s2_2", texto: "Geladeira/micro-ondas sem alimentos vencidos ou derramados",   tipo: "passfail", critical: true,  requiresPhotoOnFail: true,  actionType: "cleaning" },
          { id: "z4_s2_3", texto: "Lixeiras comuns e recicláveis esvaziadas com sacos trocados",  tipo: "passfail", critical: false, requiresPhotoOnFail: false, actionType: "cleaning" },
        ],
      },
      {
        id: "z4_s3",
        nome: "🔧 Oficina e Almoxarifado",
        items: [
          { id: "z4_s3_1", texto: "Bancadas da oficina limpas e organizadas",                     tipo: "score",    critical: false, requiresPhotoOnFail: false, actionType: "cleaning"   },
          { id: "z4_s3_2", texto: "Almoxarifado sem caixas rasgadas ou peças atiradas no chão",   tipo: "passfail", critical: false, requiresPhotoOnFail: false, actionType: "cleaning"   },
          { id: "z4_s3_3", texto: "Corredores do almoxarifado desobstruídos",                     tipo: "passfail", critical: false, requiresPhotoOnFail: false, actionType: "cleaning"   },
        ],
      },
    ],
  },
];

// ── Score calculation helpers ────────────────────────────────────────────────

/** Returns max possible score for a zone (all items scored 5) */
export function calcularMaxScore(zona) {
  return zona.sections.reduce((total, sec) =>
    total + sec.items.reduce((s, item) => s + 5, 0), 0);
}

/** Converts raw item scores map to section scores + overall % */
export function calcularPontuacao(zona, scoresMap) {
  let totalObtido = 0;
  let totalPossivel = 0;
  const sections = [];

  for (const sec of zona.sections) {
    let secObtido = 0;
    let secPossivel = 0;
    const items = [];

    for (const item of sec.items) {
      const score = scoresMap[item.id] ?? null;
      if (score === null) continue; // N/A — skip
      secObtido   += score;
      secPossivel += 5;
      items.push({ ...item, scoreGiven: score });
    }

    const secScore = secPossivel > 0 ? Math.round((secObtido / secPossivel) * 100) : 100;
    sections.push({ id: sec.id, nome: sec.nome, score: secScore, items });
    totalObtido   += secObtido;
    totalPossivel += secPossivel;
  }

  const finalScore = totalPossivel > 0 ? Math.round((totalObtido / totalPossivel) * 100) : 0;
  return { finalScore, sections };
}
