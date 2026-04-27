/**
 * dados-limpeza.js — Cleaning Audit Catalog (SIGA v2)
 *
 * Sections reorganized into 5 Sensos per zone (Melhoria 2):
 *   S1 — Seiri    (Utilização)
 *   S2 — Seiton   (Organização)
 *   S3 — Seiso    (Limpeza)
 *   S4 — Seiketsu (Padronização)
 *   S5 — Shitsuke (Disciplina)
 *
 * Item types:
 *   "score"     → 5 buttons (0 Péssimo → 5 Excelente)
 *   "passfail"  → Pass (5pts) / Fail (0pts)
 *
 * critical: true  → badge 🔴 CRÍTICO; if score=0, ação obrigatória 24h
 * requiresPhotoOnFail: true → foto obrigatória quando score=0
 * actionType:
 *   "cleaning"   → tarefa corretiva interna
 *   "structural" → badge 🏗️ Estrutural; gera O.S. de Manutenção (7 dias)
 *   "material"   → badge 📦 Material; gera Pedido de Compra
 *
 * Score mínimo por seção: se qualquer S1-S5 tiver score < 60%, o
 * status final da inspeção é no máximo "🟠 Atenção" (aplicado no formulário).
 */

export const equipeLimpeza = [
  { id: "LIMP-001", nome: "João Silva",     cargo: "Auxiliar de Limpeza" },
  { id: "LIMP-002", nome: "Maria Oliveira", cargo: "Auxiliar de Limpeza" },
  { id: "LIMP-003", nome: "Carlos Santos",  cargo: "Operador de Limpeza" },
  { id: "LIMP-004", nome: "Ana Costa",      cargo: "Supervisora 5S"      },
];

export const catalogoZonas = [
  // ──────────────────────────────────────────────────────────────────────────
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
        id: "z1_seiri",
        nome: "S1 — Seiri · Utilização",
        items: [
          { id: "z1_s2_4", texto: "Ausência de materiais obsoletos ou sucata fora do lugar designado",         tipo: "score",    critical: false, requiresPhotoOnFail: false, actionType: "cleaning"   },
          { id: "z1_s4_1", texto: "Resíduos segregados corretamente (comum, reciclável, perigoso)",            tipo: "score",    critical: false, requiresPhotoOnFail: false, actionType: "cleaning"   },
          { id: "z1_s4_2", texto: "Área de descarte de embalagens organizada",                                 tipo: "passfail", critical: false, requiresPhotoOnFail: false, actionType: "cleaning"   },
          { id: "z1_sh0_1", texto: "Itens sem uso identificados e etiquetados para descarte ou devolução",     tipo: "passfail", critical: false, requiresPhotoOnFail: false, actionType: "cleaning"   },
        ],
      },
      {
        id: "z1_seiton",
        nome: "S2 — Seiton · Organização",
        items: [
          { id: "z1_s2_1", texto: "Corredores livres e desobstruídos",                                        tipo: "score",    critical: true,  requiresPhotoOnFail: true,  actionType: "cleaning"   },
          { id: "z1_s2_2", texto: "Paletes alinhados dentro das marcações no piso",                            tipo: "score",    critical: false, requiresPhotoOnFail: false, actionType: "cleaning"   },
          { id: "z1_s2_3", texto: "Produtos identificados com rótulos virados para a frente",                  tipo: "passfail", critical: false, requiresPhotoOnFail: false, actionType: "cleaning"   },
          { id: "z1_s2_5", texto: "Empilhadeiras/Carrinhos estacionados na vaga correta",                      tipo: "passfail", critical: false, requiresPhotoOnFail: false, actionType: "cleaning"   },
        ],
      },
      {
        id: "z1_seiso",
        nome: "S3 — Seiso · Limpeza",
        items: [
          { id: "z1_s1_1", texto: "Piso varrido, livre de pó, plásticos e detritos",                          tipo: "score",    critical: false, requiresPhotoOnFail: false, actionType: "cleaning"   },
          { id: "z1_s1_2", texto: "Ausência de teias de aranha e ninhos de insetos",                          tipo: "score",    critical: false, requiresPhotoOnFail: false, actionType: "cleaning"   },
          { id: "z1_s1_3", texto: "Lixeiras esvaziadas e com sacos íntegros",                                 tipo: "passfail", critical: false, requiresPhotoOnFail: false, actionType: "cleaning"   },
        ],
      },
      {
        id: "z1_seiketsu",
        nome: "S4 — Seiketsu · Padronização",
        items: [
          { id: "z1_s1_4", texto: "Iluminação adequada e luminárias limpas",                                   tipo: "passfail", critical: false, requiresPhotoOnFail: true,  actionType: "structural" },
          { id: "z1_s3_1", texto: "Extintores e hidrantes livres de bloqueios e sinalizados",                  tipo: "passfail", critical: true,  requiresPhotoOnFail: true,  actionType: "structural" },
          { id: "z1_s3_2", texto: "Fitas de demarcação de segurança visíveis e intactas",                      tipo: "passfail", critical: false, requiresPhotoOnFail: true,  actionType: "structural" },
          { id: "z1_s3_3", texto: "Saídas de emergência desobstruídas e sinalizadas",                          tipo: "passfail", critical: true,  requiresPhotoOnFail: true,  actionType: "structural" },
        ],
      },
      {
        id: "z1_shitsuke",
        nome: "S5 — Shitsuke · Disciplina",
        items: [
          { id: "z1_sh_1", texto: "Registros de limpeza atualizados e assinados no último turno",              tipo: "passfail", critical: false, requiresPhotoOnFail: false, actionType: "cleaning"   },
          { id: "z1_sh_2", texto: "Equipe ciente das normas de armazenamento e movimentação do setor",         tipo: "passfail", critical: false, requiresPhotoOnFail: false, actionType: "cleaning"   },
          { id: "z1_sh_3", texto: "Ações corretivas de inspeções anteriores foram encerradas",                 tipo: "passfail", critical: false, requiresPhotoOnFail: false, actionType: "cleaning"   },
        ],
      },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
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
        id: "z2_seiri",
        nome: "S1 — Seiri · Utilização",
        items: [
          { id: "z2_s3_2", texto: "Somente ferramentas e materiais em uso estão nas bancadas",                 tipo: "passfail", critical: false, requiresPhotoOnFail: false, actionType: "cleaning"   },
          { id: "z2_sh0_1", texto: "Itens inservíveis, sucata ou resíduos removidos do chão de fábrica",      tipo: "passfail", critical: false, requiresPhotoOnFail: false, actionType: "cleaning"   },
        ],
      },
      {
        id: "z2_seiton",
        nome: "S2 — Seiton · Organização",
        items: [
          { id: "z2_s1_2", texto: "Bancadas de trabalho limpas e organizadas",                                 tipo: "score",    critical: false, requiresPhotoOnFail: false, actionType: "cleaning"   },
          { id: "z2_s3_1", texto: "Ferramentas guardadas corretamente no Quadro de Sombras",                   tipo: "score",    critical: false, requiresPhotoOnFail: false, actionType: "cleaning"   },
          { id: "z2_s3_3", texto: "Identificação visual dos equipamentos está legível e atualizada",           tipo: "passfail", critical: false, requiresPhotoOnFail: false, actionType: "structural" },
        ],
      },
      {
        id: "z2_seiso",
        nome: "S3 — Seiso · Limpeza",
        items: [
          { id: "z2_s1_1", texto: "Máquinas sem acúmulo excessivo de pó, graxas ou restos de produto",        tipo: "score",    critical: false, requiresPhotoOnFail: false, actionType: "cleaning"   },
          { id: "z2_s1_3", texto: "Calhas e ralos de escoamento limpos e sem bloqueios",                       tipo: "passfail", critical: false, requiresPhotoOnFail: true,  actionType: "structural" },
          { id: "z2_s1_4", texto: "Lixeiras de descarte de contaminação esvaziadas",                          tipo: "passfail", critical: false, requiresPhotoOnFail: false, actionType: "cleaning"   },
          { id: "z2_s2_1", texto: "Piso livre de óleo, graxa ou água (risco de queda)",                       tipo: "score",    critical: true,  requiresPhotoOnFail: true,  actionType: "cleaning"   },
        ],
      },
      {
        id: "z2_seiketsu",
        nome: "S4 — Seiketsu · Padronização",
        items: [
          { id: "z2_s2_2", texto: "Painéis elétricos fechados e sem acúmulo de pó (risco de incêndio)",       tipo: "passfail", critical: true,  requiresPhotoOnFail: true,  actionType: "structural" },
          { id: "z2_s2_3", texto: "Inexistência de gambiarras elétricas (fios soltos, fitas isolantes)",       tipo: "passfail", critical: true,  requiresPhotoOnFail: true,  actionType: "structural" },
          { id: "z2_s2_4", texto: "EPIs de uso coletivo disponíveis, limpos e bem acondicionados",             tipo: "passfail", critical: false, requiresPhotoOnFail: true,  actionType: "material"   },
          { id: "z2_s2_5", texto: "Fitas de demarcação de segurança visíveis e não rasgadas",                  tipo: "passfail", critical: false, requiresPhotoOnFail: false, actionType: "structural" },
        ],
      },
      {
        id: "z2_shitsuke",
        nome: "S5 — Shitsuke · Disciplina",
        items: [
          { id: "z2_sh_1", texto: "Registros de manutenção e limpeza dos equipamentos atualizados",            tipo: "passfail", critical: false, requiresPhotoOnFail: false, actionType: "cleaning"   },
          { id: "z2_sh_2", texto: "Equipe ciente dos procedimentos de segurança do chão de fábrica",           tipo: "passfail", critical: false, requiresPhotoOnFail: false, actionType: "cleaning"   },
          { id: "z2_sh_3", texto: "Ações corretivas de inspeções anteriores foram encerradas",                 tipo: "passfail", critical: false, requiresPhotoOnFail: false, actionType: "cleaning"   },
        ],
      },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
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
        id: "z3_seiri",
        nome: "S1 — Seiri · Utilização",
        items: [
          { id: "z3_sh0_1", texto: "Insumos vencidos ou danificados identificados e separados para descarte", tipo: "passfail", critical: true,  requiresPhotoOnFail: true,  actionType: "cleaning"   },
          { id: "z3_s3_4", texto: "Lixeiras da área esvaziadas com sacos íntegros",                           tipo: "passfail", critical: false, requiresPhotoOnFail: false, actionType: "cleaning"   },
        ],
      },
      {
        id: "z3_seiton",
        nome: "S2 — Seiton · Organização",
        items: [
          { id: "z3_s3_1", texto: "Identificação de validade visível (Sistema FIFO aplicado)",                 tipo: "score",    critical: false, requiresPhotoOnFail: false, actionType: "cleaning"   },
          { id: "z3_s3_2", texto: "Paletes de madeira em bom estado, sem pregos soltos",                      tipo: "passfail", critical: false, requiresPhotoOnFail: true,  actionType: "material"   },
          { id: "z3_s3_3", texto: "Sem ferramentas esquecidas perto das moegas (risco de quebra)",             tipo: "passfail", critical: true,  requiresPhotoOnFail: true,  actionType: "structural" },
        ],
      },
      {
        id: "z3_seiso",
        nome: "S3 — Seiso · Limpeza",
        items: [
          { id: "z3_s1_1", texto: "Área varrida e sem restos de produto espalhados no piso",                   tipo: "score",    critical: false, requiresPhotoOnFail: false, actionType: "cleaning"   },
          { id: "z3_s1_2", texto: "Balanças e dosadores higienizados após o uso",                              tipo: "score",    critical: false, requiresPhotoOnFail: false, actionType: "cleaning"   },
          { id: "z3_s1_3", texto: "Estrados plásticos limpos e não quebrados",                                 tipo: "passfail", critical: false, requiresPhotoOnFail: true,  actionType: "material"   },
          { id: "z3_s2_2", texto: "Sacarias íntegras e sem vazamentos de produto no chão",                     tipo: "score",    critical: false, requiresPhotoOnFail: true,  actionType: "cleaning"   },
        ],
      },
      {
        id: "z3_seiketsu",
        nome: "S4 — Seiketsu · Padronização",
        items: [
          { id: "z3_s2_1", texto: "Ausência total de pragas, fezes de roedores ou insetos",                    tipo: "passfail", critical: true,  requiresPhotoOnFail: true,  actionType: "structural" },
          { id: "z3_s2_3", texto: "Janelas e portas mantidas fechadas ou teladas",                             tipo: "passfail", critical: true,  requiresPhotoOnFail: true,  actionType: "structural" },
          { id: "z3_sh0_2", texto: "Temperatura e umidade do ambiente monitoradas e dentro dos limites",       tipo: "passfail", critical: false, requiresPhotoOnFail: false, actionType: "structural" },
        ],
      },
      {
        id: "z3_shitsuke",
        nome: "S5 — Shitsuke · Disciplina",
        items: [
          { id: "z3_sh_1", texto: "Controle de pragas documentado com laudos do último ciclo atualizados",     tipo: "passfail", critical: false, requiresPhotoOnFail: false, actionType: "structural" },
          { id: "z3_sh_2", texto: "Equipe ciente dos procedimentos de recebimento e controle de qualidade",    tipo: "passfail", critical: false, requiresPhotoOnFail: false, actionType: "cleaning"   },
          { id: "z3_sh_3", texto: "Ações corretivas de inspeções anteriores foram encerradas",                 tipo: "passfail", critical: false, requiresPhotoOnFail: false, actionType: "cleaning"   },
        ],
      },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
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
        id: "z4_seiri",
        nome: "S1 — Seiri · Utilização",
        items: [
          { id: "z4_s2_2", texto: "Geladeira/micro-ondas sem alimentos vencidos ou derramados",                tipo: "passfail", critical: true,  requiresPhotoOnFail: true,  actionType: "cleaning"   },
          { id: "z4_sh0_1", texto: "Produtos de limpeza obsoletos ou vencidos descartados corretamente",       tipo: "passfail", critical: false, requiresPhotoOnFail: false, actionType: "cleaning"   },
        ],
      },
      {
        id: "z4_seiton",
        nome: "S2 — Seiton · Organização",
        items: [
          { id: "z4_s3_1", texto: "Bancadas da oficina limpas e organizadas",                                  tipo: "score",    critical: false, requiresPhotoOnFail: false, actionType: "cleaning"   },
          { id: "z4_s3_2", texto: "Almoxarifado sem caixas rasgadas ou peças atiradas no chão",                tipo: "passfail", critical: false, requiresPhotoOnFail: false, actionType: "cleaning"   },
          { id: "z4_s3_3", texto: "Corredores do almoxarifado desobstruídos",                                  tipo: "passfail", critical: false, requiresPhotoOnFail: false, actionType: "cleaning"   },
          { id: "z4_s1_3", texto: "Saboneteiras e papéis (toalha/higiênico) abastecidos",                      tipo: "passfail", critical: false, requiresPhotoOnFail: true,  actionType: "material"   },
        ],
      },
      {
        id: "z4_seiso",
        nome: "S3 — Seiso · Limpeza",
        items: [
          { id: "z4_s1_1", texto: "Vasos sanitários e mictórios higienizados e sem odores",                    tipo: "score",    critical: false, requiresPhotoOnFail: false, actionType: "cleaning"   },
          { id: "z4_s1_2", texto: "Pias limpas, sem restos de sabão, barba ou sujeira",                       tipo: "score",    critical: false, requiresPhotoOnFail: false, actionType: "cleaning"   },
          { id: "z4_s1_4", texto: "Espelhos e vidros limpos e sem marcas de respingos",                       tipo: "score",    critical: false, requiresPhotoOnFail: false, actionType: "cleaning"   },
          { id: "z4_s1_5", texto: "Piso lavado e sem manchas, mofo ou lodo",                                  tipo: "score",    critical: false, requiresPhotoOnFail: true,  actionType: "cleaning"   },
          { id: "z4_s2_1", texto: "Mesas do refeitório limpas, sem restos de comida",                         tipo: "score",    critical: false, requiresPhotoOnFail: false, actionType: "cleaning"   },
          { id: "z4_s2_3", texto: "Lixeiras comuns e recicláveis esvaziadas com sacos trocados",               tipo: "passfail", critical: false, requiresPhotoOnFail: false, actionType: "cleaning"   },
        ],
      },
      {
        id: "z4_seiketsu",
        nome: "S4 — Seiketsu · Padronização",
        items: [
          { id: "z4_sh0_2", texto: "EPIs e materiais de primeiros socorros disponíveis e identificados",       tipo: "passfail", critical: false, requiresPhotoOnFail: false, actionType: "material"   },
          { id: "z4_sh0_3", texto: "Procedimentos de higiene afixados em local visível e legível",             tipo: "passfail", critical: false, requiresPhotoOnFail: false, actionType: "cleaning"   },
        ],
      },
      {
        id: "z4_shitsuke",
        nome: "S5 — Shitsuke · Disciplina",
        items: [
          { id: "z4_sh_1", texto: "Registros de limpeza dos banheiros e refeitório atualizados",               tipo: "passfail", critical: false, requiresPhotoOnFail: false, actionType: "cleaning"   },
          { id: "z4_sh_2", texto: "Equipe ciente das normas de higiene pessoal e coletiva",                    tipo: "passfail", critical: false, requiresPhotoOnFail: false, actionType: "cleaning"   },
          { id: "z4_sh_3", texto: "Ações corretivas de inspeções anteriores foram encerradas",                 tipo: "passfail", critical: false, requiresPhotoOnFail: false, actionType: "cleaning"   },
        ],
      },
    ],
  },
];

// ── Score calculation helpers ────────────────────────────────────────────────

/** Returns max possible score for a zone (all items scored 5) */
export function calcularMaxScore(zona) {
  return zona.sections.reduce((total, sec) =>
    total + sec.items.reduce((s) => s + 5, 0), 0);
}

/** Converts raw item scores map to section scores + overall % */
export function calcularPontuacao(zona, scoresMap) {
  let totalObtido  = 0;
  let totalPossivel = 0;
  const sections   = [];

  for (const sec of zona.sections) {
    let secObtido  = 0;
    let secPossivel = 0;
    const items    = [];

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

  // Flag if any section scored below 60% (caps final status at "attention")
  const hasLowSection = sections.some(s => s.score < 60);

  return { finalScore, sections, hasLowSection };
}
