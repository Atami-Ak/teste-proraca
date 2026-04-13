// =======================================================
// BANCO DE DADOS CENTRAL DA FROTA (DADOS REAIS)
// =======================================================
export const frotaDB = [
    // --- CAMINHÕES DA PLANILHA OFICIAL ---
    { id: "VEIC-001", placa: "OEC-3E92", modelo: "FORD CARGO 816 E", categoria: "Caminhões Leves (3/4)", icone: "🚚", motoristaPadrao: "JUSCELINO" },
    { id: "VEIC-002", placa: "QRS-3051", modelo: "VOLVO VM 330 L-S", categoria: "Carretas", icone: "🚛" }, // Sem condutor na planilha
    { id: "VEIC-003", placa: "RST-3E58", modelo: "M. BENS / ACTROS 2429", categoria: "Caminhões Toco/Truck", icone: "🚛", motoristaPadrao: "REGINALDO" },
    { id: "VEIC-004", placa: "ESL-5D38", modelo: "VOLVO VM 330 L-S", categoria: "Carretas", icone: "🚛", motoristaPadrao: "TIMOTEO" },
    { id: "VEIC-005", placa: "RSL-0D12", modelo: "VOLVO VM 330 L-S", categoria: "Carretas", icone: "🚛", motoristaPadrao: "JOÃO PEREIRA" },
    { id: "VEIC-006", placa: "RSM-6B13", modelo: "DAF / XF FTT 530 4º EIXO", categoria: "Caminhões 4º Eixo", icone: "🚛", motoristaPadrao: "BRUNO" },
    { id: "VEIC-007", placa: "RSQ 2H28", modelo: "IVECO / TECTOR 24-280", categoria: "Caminhões Toco/Truck", icone: "🚛", motoristaPadrao: "DAVI" },
    { id: "VEIC-008", placa: "SLS-3H29", modelo: "M. BENS / ACTROS 2448S", categoria: "Caminhões 4º Eixo", icone: "🚛", motoristaPadrao: "JEAN" },
    { id: "VEIC-009", placa: "QRR-4D94", modelo: "TOCO ATEGO 1719", categoria: "Caminhões Toco/Truck", icone: "🚛", motoristaPadrao: "JOSIMAR" },
    { id: "VEIC-010", placa: "QRT-9J44", modelo: "VOLVO VM 330 L-S", categoria: "Carretas", icone: "🚛", motoristaPadrao: "ZE D-10" },
    { id: "VEIC-011", placa: "NIX-9668", modelo: "B-TRUK VOLVO VM 270", categoria: "Caminhões Bitruck", icone: "🚛", motoristaPadrao: "CARLOS IVAN" },
    { id: "VEIC-012", placa: "QRV-5A23", modelo: "B-TRUK VOLVO VM 360", categoria: "Caminhões Bitruck", icone: "🚛", motoristaPadrao: "ANDRÉ" },
    { id: "VEIC-013", placa: "QRV-2F43", modelo: "VOLVO VM 360 L-S", categoria: "Carretas", icone: "🚛", motoristaPadrao: "DENIS" },
    { id: "VEIC-014", placa: "RST-4H12", modelo: "VOLVO/FH 540 6X4T", categoria: "Rodotrem", icone: "🚛", motoristaPadrao: "ALEXANDRE" },
    { id: "VEIC-015", placa: "PID-7114", modelo: "BITRUK VOLVO VM 330", categoria: "Caminhões Bitruck", icone: "🚛", motoristaPadrao: "JOÃO CARLOS" },
    { id: "VEIC-016", placa: "JAU-8G04", modelo: "VOLVO VM 330 L-S", categoria: "Carretas", icone: "🚛", motoristaPadrao: "CARLINHOS" },
    { id: "VEIC-017", placa: "ETH-5H08", modelo: "VOLVO VM 330 L-S", categoria: "Carretas", icone: "🚛", motoristaPadrao: "ADÃO" },
    { id: "VEIC-018", placa: "PIG-3696", modelo: "B-TRUK SCANIA P-310", categoria: "Caminhões Bitruck", icone: "🚛" }, // Sem condutor na planilha

    // --- VEÍCULOS LEVES (USO COMPARTILHADO / SEM MOTORISTA FIXO) ---
    { id: "VEIC-019", placa: "SIG-0001", modelo: "Fiat Strada Endurance", categoria: "Carros Leves", icone: "🚗" }, 
    { id: "VEIC-020", placa: "RTY-5555", modelo: "Honda CG 160 Titan", categoria: "Motos", icone: "🏍️" } 
];

// =======================================================
// O CHECKLIST OFICIAL PADRÃO (CAMINHÕES E CARROS)
// =======================================================
export const checklistPadrao = [
    {
        grupo: "1. Condições da Cabine / Interior",
        itens: [
            "Chave Veículo", "Bancos", "Ar Condicionado", "CD Player e Sistema de Som", 
            "Painel", "Tapetes", "Limpador Parabrisa", "Esguichos Parabrisa", 
            "Revestimento Interno", "Limpeza Interna", "Luz de Cabine", "Interclima"
        ]
    },
    {
        grupo: "2. Segurança e Elétrica",
        itens: [
            "Botões de Funções", "Luzes Advertência Painel", "Buzina", 
            "Vidro Janela Esquerda", "Vidro Janela Direita", "Retrovisor Esquerdo", 
            "Retrovisor Direito", "Luz Seta Dianteira"
        ]
    },
    {
        grupo: "3. Kit de Viagem (Acessórios)",
        itens: [
            "Rede", "Facão", "Ferramentas", "Pistola de Ar", 
            "Garrafa Térmica", "Lona para Forro"
        ]
    }
];

// =======================================================
// CHECKLIST EXCLUSIVO PARA MOTOS
// =======================================================
export const checklistMoto = [
    {
        grupo: "1. Estrutura e Ciclística",
        itens: [
            "Chave da Moto", "Painel de Instrumentos", "Pneus (Calibragem e Desgaste)", 
            "Rodas e Raios", "Corrente / Relação (Tensão/Lubrificação)", 
            "Freio Dianteiro", "Freio Traseiro"
        ]
    },
    {
        grupo: "2. Motor e Desempenho",
        itens: [
            "Nível de Óleo do Motor", "Sem Vazamentos (Óleo/Combustível)?", 
            "Ausência de Ruídos Anormais no Motor?", "Sistema de Escapamento (Fixação/Fumaça)", 
            "Acionamento da Embreagem", "Marcha Lenta e Aceleração"
        ]
    },
    {
        grupo: "3. Segurança e Elétrica",
        itens: [
            "Farol Dianteiro (Alto e Baixo)", "Lanterna Traseira / Luz de Freio", 
            "Setas (Direita e Esquerda)", "Buzina", "Retrovisores (Alinhamento)"
        ]
    },
    {
        grupo: "4. Acessórios e Equipamentos",
        itens: [
            "Baú (Tranca e Fixação)", "Antena Corta-Pipa", "Capacete (Viseira e Cinta)",
            "Capa de Chuva"
        ]
    }
];