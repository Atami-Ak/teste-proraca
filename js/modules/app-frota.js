import { checkAuth } from "../core/db-auth.js";
import { frotaDB, checklistPadrao, checklistMoto } from "../data/dados-frota.js";
import { salvarChecklistFrota } from "../core/db.js";

await checkAuth("formulario-frota");

function mostrarAviso(msg, tipo = "erro") {
  let el = document.getElementById("_aviso_frota");
  if (!el) {
    el = document.createElement("div");
    el.id = "_aviso_frota";
    el.style.cssText = "position:fixed;top:20px;left:50%;transform:translateX(-50%);padding:14px 22px;border-radius:8px;z-index:9999;font-weight:bold;max-width:90%;text-align:center;box-shadow:0 4px 12px rgba(0,0,0,0.18);transition:opacity 0.3s;";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.background = tipo === "sucesso" ? "#059669" : "#dc2626";
  el.style.color = "white";
  el.style.display = "block";
  el.style.opacity = "1";
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.style.opacity = "0"; setTimeout(() => el.style.display = "none", 300); }, 4000);
}

let checklistEmUso = [];

function preencherDataHoraAtual() {
    const agora = new Date();
    document.getElementById("data-inspecao").value = agora.toISOString().split('T')[0];
    document.getElementById("hora-inspecao").value = agora.toTimeString().substring(0,5);
}

function verificarVeiculoNaURL() {
    const params = new URLSearchParams(window.location.search);
    const idUrl = params.get("id");
    
    if (idUrl) {
        const veiculo = frotaDB.find(v => v.id === idUrl);
        if (veiculo) aplicarVeiculoNoFormulario(veiculo);
    }
}

const inputBusca = document.getElementById("busca-veiculo");
const listaVeiculos = document.getElementById("lista-veiculos");
const inputVeiculoId = document.getElementById("veiculo-selecionado-id");

inputBusca.addEventListener("input", (e) => {
    const termo = e.target.value.toLowerCase().trim();
    listaVeiculos.innerHTML = "";
    
    if (termo.length < 2) {
        listaVeiculos.classList.remove("active");
        return;
    }

    const filtrados = frotaDB.filter(v => 
        v.placa.toLowerCase().includes(termo) || 
        v.modelo.toLowerCase().includes(termo)
    );

    if (filtrados.length > 0) {
        listaVeiculos.classList.add("active");
        filtrados.forEach(v => {
            const div = document.createElement("div");
            div.className = "vehicle-item";
            div.innerHTML = `<span style="font-size: 1.1rem;">${v.placa}</span> <span style="color:#64748b; font-size:0.85rem;">${v.modelo}</span>`;
            
            div.onclick = () => aplicarVeiculoNoFormulario(v);
            listaVeiculos.appendChild(div);
        });
    } else {
        listaVeiculos.classList.remove("active");
    }
});

document.addEventListener("click", (e) => {
    if(e.target !== inputBusca) listaVeiculos.classList.remove("active");
});

function aplicarVeiculoNoFormulario(veiculo) {
    inputBusca.value = `${veiculo.placa} - ${veiculo.modelo}`;
    inputVeiculoId.value = veiculo.id;
    listaVeiculos.classList.remove("active");
    
    inputBusca.style.borderColor = "var(--success)";
    inputBusca.style.backgroundColor = "#f0fdf4";
    inputBusca.style.fontWeight = "bold";
    inputBusca.style.color = "var(--success)";

    const blocoMotorista = document.getElementById("bloco-motorista");
    const inputMotorista = document.getElementById("nome-motorista");
    
    // VARIÁVEIS DO NOVO BLOCO DE DESTINO
    const blocoDestino = document.getElementById("bloco-destino");
    const inputDestino = document.getElementById("cidade-destino");

    if (veiculo.categoria === "Carros Leves" || veiculo.categoria === "Motos") {
        // Esconde MOTORISTA
        blocoMotorista.style.display = "none";
        inputMotorista.required = false;
        inputMotorista.value = "Uso Compartilhado"; 
        
        // Esconde DESTINO
        blocoDestino.style.display = "none";
        inputDestino.required = false;
        inputDestino.value = "Uso Local / Base"; 
    } else {
        // Exibe MOTORISTA (Para Caminhões)
        blocoMotorista.style.display = "block";
        inputMotorista.required = true;
        inputMotorista.value = veiculo.motoristaPadrao || "";
        
        // Exibe DESTINO (Para Caminhões)
        blocoDestino.style.display = "block";
        inputDestino.required = true;
        inputDestino.value = ""; 
    }

    if (veiculo.categoria === "Motos") {
        checklistEmUso = checklistMoto;
    } else {
        checklistEmUso = checklistPadrao;
    }

    renderizarChecklist(checklistEmUso);
}

function renderizarChecklist(configuracao) {
    const container = document.getElementById("container-checklist");
    container.innerHTML = ""; 
    
    configuracao.forEach((categoria, indexCat) => {
        const divGrupo = document.createElement("div");
        divGrupo.className = "checklist-group";
        
        const titulo = document.createElement("h4");
        titulo.textContent = categoria.grupo;
        divGrupo.appendChild(titulo);

        categoria.itens.forEach((item, indexItem) => {
            const radioName = `chk_${indexCat}_${indexItem}`;
            
            const divItem = document.createElement("div");
            divItem.className = "check-item";
            divItem.innerHTML = `
                <div class="check-label">${item}</div>
                <div class="check-actions">
                    <label class="radio-btn"><input type="radio" name="${radioName}" value="C" data-item="${item}"> Conforme</label>
                    <label class="radio-btn"><input type="radio" name="${radioName}" value="NC" data-item="${item}"> N/C</label>
                </div>
            `;
            divGrupo.appendChild(divItem);
        });

        container.appendChild(divGrupo);
    });
}

let arquivoEvidencia = null;
const fotoInput = document.getElementById("foto-avaria");
const previewFoto = document.getElementById("preview-foto");

fotoInput.addEventListener("change", (e) => {
    if (e.target.files && e.target.files[0]) {
        arquivoEvidencia = e.target.files[0];
        const reader = new FileReader();
        reader.onload = function(event) {
            previewFoto.innerHTML = `<img src="${event.target.result}" style="width: 100%; height: 250px; object-fit: cover; border-radius: 8px; border: 2px solid #ef4444;">`;
        };
        reader.readAsDataURL(arquivoEvidencia);
    }
});

preencherDataHoraAtual();
verificarVeiculoNaURL();

const formFrota = document.getElementById("form-frota");
const overlay = document.getElementById("overlay");

formFrota.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!inputVeiculoId.value) {
        mostrarAviso("⚠️ Por favor, pesquise e selecione um veículo válido.");
        inputBusca.focus(); return;
    }

    const btnNatureza = document.querySelector('input[name="natureza"]:checked');
    if (!btnNatureza) {
        mostrarAviso("⚠️ ATENÇÃO: Indique se esta inspeção é de SAÍDA ou RETORNO.");
        return;
    }

    let respostasChecklist = [];
    let itensNaoConformes = [];
    let totalItensOficiais = checklistEmUso.reduce((acc, cat) => acc + cat.itens.length, 0);

    const radiosMarcados = document.querySelectorAll('#container-checklist input[type="radio"]:checked');

    if (radiosMarcados.length < totalItensOficiais) {
        mostrarAviso(`⚠️ Incompleto: Faltam avaliar ${totalItensOficiais - radiosMarcados.length} itens no checklist.`);
        return;
    }

    radiosMarcados.forEach(radio => {
        const nomeItem = radio.getAttribute("data-item");
        respostasChecklist.push({ item: nomeItem, status: radio.value });
        if (radio.value === "NC") itensNaoConformes.push(nomeItem);
    });

    const txtAvaria = document.getElementById("descricao-avaria").value.trim();
    
    if (itensNaoConformes.length > 0) {
        if (txtAvaria.length < 5) {
            mostrarAviso(`🛑 REGRA: ${itensNaoConformes.length} item(ns) reprovado(s). Descreva a avaria no campo abaixo.`);
            document.getElementById("descricao-avaria").focus(); return;
        }
        if (!arquivoEvidencia) {
            mostrarAviso("📸 REGRA DE SEGURANÇA: É obrigatório anexar uma foto do defeito.");
            return;
        }
    }

    const payload = {
        idVeiculo: inputVeiculoId.value,
        natureza: btnNatureza.value, 
        data: document.getElementById("data-inspecao").value,
        hora: document.getElementById("hora-inspecao").value,
        motorista: document.getElementById("nome-motorista").value,
        destino: document.getElementById("cidade-destino").value,
        kmAtual: parseFloat(document.getElementById("km-veiculo").value),
        abastecimentoLts: parseFloat(document.getElementById("abastecimento").value) || 0,
        checklistAvaliado: respostasChecklist,
        possuiAvaria: itensNaoConformes.length > 0,
        detalhesAvaria: txtAvaria,
        timestamp: Date.now()
    };

    overlay.classList.remove("hidden");
    try {
        await salvarChecklistFrota(payload, arquivoEvidencia);
        overlay.classList.add("hidden");
        mostrarAviso("✅ Checklist salvo com sucesso!", "sucesso");
        setTimeout(() => window.location.href = "painel-frota.html", 1200);
    } catch (error) {
        console.error("Erro no envio:", error);
        overlay.classList.add("hidden");
        mostrarAviso("❌ Erro ao salvar. Verifique a sua conexão e tente novamente.");
    }
});