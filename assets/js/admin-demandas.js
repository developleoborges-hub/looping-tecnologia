// assets/js/admin-demandas.js

import { auth, db } from "./firebase-config.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const demandsCollectionRef = collection(db, "crmDemands");
const clientsCollectionRef = collection(db, "crmClients");

const demandForm = document.getElementById("demandForm");
const demandFormPanel = document.getElementById("demandFormPanel");
const toggleDemandFormButton = document.getElementById("toggleDemandFormButton");
const clearDemandFormButton = document.getElementById("clearDemandFormButton");
const demandFormMessage = document.getElementById("demandFormMessage");
const demandsList = document.getElementById("demandsList");

const demandClient = document.getElementById("demandClient");
const demandClientFilter = document.getElementById("demandClientFilter");
const demandSearchInput = document.getElementById("demandSearchInput");
const demandStatusFilter = document.getElementById("demandStatusFilter");
const demandPriorityFilter = document.getElementById("demandPriorityFilter");
const saveDemandButton = document.querySelector("[data-save-demand-button]");

let clientsCache = [];
let demandsCache = [];
let unsubscribeClients = null;
let unsubscribeDemands = null;

const statusLabels = {
  pendente: "Pendente",
  em_andamento: "Em andamento",
  concluida: "Concluída",
  pausada: "Pausada",
  cancelada: "Cancelada"
};

const priorityLabels = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  urgente: "Urgente"
};

function getInputValue(id) {
  const element = document.getElementById(id);
  return element ? element.value.trim() : "";
}

function escapeHTML(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function parseMoney(value) {
  if (!value) return 0;

  const normalized = String(value)
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");

  const number = Number(normalized);

  return Number.isFinite(number) ? number : 0;
}

function formatMoney(value) {
  const number = Number(value || 0);

  if (!number) return "";

  return number.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function formatDateFromInput(dateString) {
  if (!dateString) return "Sem prazo";

  const [year, month, day] = dateString.split("-");

  if (!year || !month || !day) return "Sem prazo";

  return `${day}/${month}/${year}`;
}

function formatTimestamp(timestamp) {
  if (!timestamp || !timestamp.toDate) return "Sem data";

  return timestamp.toDate().toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}

function showDemandMessage(message, type = "info") {
  if (!demandFormMessage) return;

  demandFormMessage.textContent = message;
  demandFormMessage.className = `admin-message ${type}`;
}

function setSaving(isSaving) {
  if (!saveDemandButton) return;

  saveDemandButton.disabled = isSaving;
  saveDemandButton.textContent = isSaving ? "Salvando..." : "Salvar demanda";
}

function getSelectedClientData() {
  if (!demandClient) return null;

  const selectedOption = demandClient.selectedOptions[0];

  if (!selectedOption || !selectedOption.value) return null;

  return {
    id: selectedOption.value,
    name: selectedOption.dataset.name || selectedOption.textContent || ""
  };
}

function resetDemandForm() {
  if (!demandForm) return;

  demandForm.reset();

  const demandType = document.getElementById("demandType");
  const demandPriority = document.getElementById("demandPriority");
  const demandStatus = document.getElementById("demandStatus");
  const demandBillable = document.getElementById("demandBillable");

  if (demandType) demandType.value = "Alteração";
  if (demandPriority) demandPriority.value = "media";
  if (demandStatus) demandStatus.value = "pendente";
  if (demandBillable) demandBillable.value = "nao";

  showDemandMessage("");
}

function populateClientSelects() {
  if (demandClient) {
    if (!clientsCache.length) {
      demandClient.innerHTML = `<option value="">Cadastre um cliente primeiro</option>`;
      demandClient.disabled = true;
    } else {
      demandClient.disabled = false;

      demandClient.innerHTML = `
        <option value="">Selecione um cliente</option>
        ${clientsCache.map((client) => `
          <option value="${escapeHTML(client.id)}" data-name="${escapeHTML(client.name || "")}">
            ${escapeHTML(client.name || "Cliente sem nome")}
          </option>
        `).join("")}
      `;
    }
  }

  if (demandClientFilter) {
    const currentValue = demandClientFilter.value || "todos";

    demandClientFilter.innerHTML = `
      <option value="todos">Todos os clientes</option>
      ${clientsCache.map((client) => `
        <option value="${escapeHTML(client.id)}">
          ${escapeHTML(client.name || "Cliente sem nome")}
        </option>
      `).join("")}
    `;

    demandClientFilter.value = clientsCache.some((client) => client.id === currentValue)
      ? currentValue
      : "todos";
  }
}

function renderDemands() {
  if (!demandsList) return;

  const searchTerm = normalizeText(demandSearchInput?.value || "");
  const clientFilter = demandClientFilter?.value || "todos";
  const statusFilter = demandStatusFilter?.value || "todos";
  const priorityFilter = demandPriorityFilter?.value || "todas";

  const filteredDemands = demandsCache.filter((demand) => {
    const textToSearch = normalizeText(`
      ${demand.title || ""}
      ${demand.clientName || ""}
      ${demand.type || ""}
      ${demand.description || ""}
      ${demand.notes || ""}
    `);

    const matchesSearch = !searchTerm || textToSearch.includes(searchTerm);
    const matchesClient = clientFilter === "todos" || demand.clientId === clientFilter;
    const matchesStatus = statusFilter === "todos" || demand.status === statusFilter;
    const matchesPriority = priorityFilter === "todas" || demand.priority === priorityFilter;

    return matchesSearch && matchesClient && matchesStatus && matchesPriority;
  });

  if (!filteredDemands.length) {
    demandsList.innerHTML = `
      <div class="admin-empty">
        Nenhuma demanda encontrada por enquanto.
      </div>
    `;
    return;
  }

  demandsList.innerHTML = filteredDemands.map((demand) => {
    const status = demand.status || "pendente";
    const priority = demand.priority || "media";
    const isBillable = demand.billable === true;
    const extraValue = Number(demand.extraValue || 0);

    return `
      <article class="admin-list-card" data-demand-id="${escapeHTML(demand.id)}">
        <div class="admin-list-main">
          <div class="admin-list-title-row">
            <h3>${escapeHTML(demand.title || "Demanda sem título")}</h3>

            <span class="admin-status-badge status-demand-${escapeHTML(status)}">
              ${escapeHTML(statusLabels[status] || "Pendente")}
            </span>

            <span class="admin-status-badge priority-${escapeHTML(priority)}">
              ${escapeHTML(priorityLabels[priority] || "Média")}
            </span>

            ${isBillable ? `
              <span class="admin-status-badge status-billable">
                Cobrança extra
              </span>
            ` : ""}
          </div>

          <p class="admin-list-subtitle">
            ${escapeHTML(demand.clientName || "Cliente não informado")} • ${escapeHTML(demand.type || "Tipo não informado")}
          </p>

          <div class="admin-list-meta">
            <span>Prazo: ${formatDateFromInput(demand.dueDate)}</span>
            <span>Criada em: ${formatTimestamp(demand.createdAt)}</span>
            ${extraValue ? `<span>Valor extra: ${formatMoney(extraValue)}</span>` : ""}
          </div>

          ${demand.description ? `
            <p class="admin-list-message">${escapeHTML(demand.description)}</p>
          ` : ""}

          ${demand.notes ? `
            <p class="admin-list-message admin-list-note"><strong>Notas internas:</strong> ${escapeHTML(demand.notes)}</p>
          ` : ""}
        </div>

        <div class="admin-list-actions">
          <select class="admin-small-select" data-demand-status-select>
            <option value="pendente" ${status === "pendente" ? "selected" : ""}>Pendente</option>
            <option value="em_andamento" ${status === "em_andamento" ? "selected" : ""}>Em andamento</option>
            <option value="concluida" ${status === "concluida" ? "selected" : ""}>Concluída</option>
            <option value="pausada" ${status === "pausada" ? "selected" : ""}>Pausada</option>
            <option value="cancelada" ${status === "cancelada" ? "selected" : ""}>Cancelada</option>
          </select>

          ${demand.clientId ? `
            <a class="admin-mini-button" href="/admin/cliente.html?id=${encodeURIComponent(demand.clientId)}">
              Ver cliente
            </a>
          ` : ""}

          <button type="button" class="admin-mini-button danger" data-delete-demand>
            Excluir
          </button>
        </div>
      </article>
    `;
  }).join("");
}

async function createDemand(event) {
  event.preventDefault();

  const user = auth.currentUser;

  if (!user) {
    showDemandMessage("Sua sessão expirou. Faça login novamente.", "error");
    return;
  }

  const selectedClient = getSelectedClientData();
  const title = getInputValue("demandTitle");
  const type = getInputValue("demandType") || "Alteração";
  const priority = getInputValue("demandPriority") || "media";
  const status = getInputValue("demandStatus") || "pendente";
  const dueDate = getInputValue("demandDueDate");
  const billable = getInputValue("demandBillable") === "sim";
  const extraValue = parseMoney(getInputValue("demandExtraValue"));
  const description = getInputValue("demandDescription");
  const notes = getInputValue("demandNotes");

  if (!selectedClient) {
    showDemandMessage("Selecione um cliente para vincular a demanda.", "error");
    return;
  }

  if (!title) {
    showDemandMessage("Informe o título da demanda.", "error");
    return;
  }

  if (!billable && extraValue > 0) {
    showDemandMessage("Você informou valor extra, mas marcou como sem cobrança extra.", "error");
    return;
  }

  try {
    setSaving(true);
    showDemandMessage("");

    await addDoc(demandsCollectionRef, {
      clientId: selectedClient.id,
      clientName: selectedClient.name,
      title,
      type,
      priority,
      status,
      dueDate,
      billable,
      extraValue: billable ? extraValue : 0,
      description,
      notes,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: user.email,
      updatedBy: user.email
    });

    resetDemandForm();
    showDemandMessage("Demanda cadastrada com sucesso.", "success");
  } catch (error) {
    console.error("Erro ao cadastrar demanda:", error);
    showDemandMessage("Não foi possível cadastrar a demanda. Confira as regras do Firestore.", "error");
  } finally {
    setSaving(false);
  }
}

async function updateDemandStatus(demandId, newStatus) {
  const user = auth.currentUser;

  if (!user) {
    alert("Sua sessão expirou. Faça login novamente.");
    return;
  }

  const updatePayload = {
    status: newStatus,
    updatedAt: serverTimestamp(),
    updatedBy: user.email
  };

  if (newStatus === "concluida") {
    updatePayload.completedAt = serverTimestamp();
  }

  try {
    const demandRef = doc(db, "crmDemands", demandId);
    await updateDoc(demandRef, updatePayload);
  } catch (error) {
    console.error("Erro ao atualizar demanda:", error);
    alert("Não foi possível atualizar o status da demanda.");
  }
}

async function deleteDemand(demandId) {
  const confirmed = confirm("Tem certeza que deseja excluir esta demanda?");

  if (!confirmed) return;

  try {
    const demandRef = doc(db, "crmDemands", demandId);
    await deleteDoc(demandRef);
  } catch (error) {
    console.error("Erro ao excluir demanda:", error);
    alert("Não foi possível excluir esta demanda.");
  }
}

function startClientsListener() {
  if (unsubscribeClients) return;

  const clientsQuery = query(
    clientsCollectionRef,
    orderBy("name", "asc")
  );

  unsubscribeClients = onSnapshot(clientsQuery, (snapshot) => {
    clientsCache = snapshot.docs.map((docItem) => ({
      id: docItem.id,
      ...docItem.data()
    }));

    populateClientSelects();
    renderDemands();
  }, (error) => {
    console.error("Erro ao carregar clientes:", error);

    if (demandClient) {
      demandClient.innerHTML = `<option value="">Erro ao carregar clientes</option>`;
      demandClient.disabled = true;
    }
  });
}

function startDemandsListener() {
  if (!demandsList || unsubscribeDemands) return;

  const demandsQuery = query(
    demandsCollectionRef,
    orderBy("createdAt", "desc")
  );

  unsubscribeDemands = onSnapshot(demandsQuery, (snapshot) => {
    demandsCache = snapshot.docs.map((docItem) => ({
      id: docItem.id,
      ...docItem.data()
    }));

    renderDemands();
  }, (error) => {
    console.error("Erro ao carregar demandas:", error);

    demandsList.innerHTML = `
      <div class="admin-empty">
        Não foi possível carregar as demandas. Confira o login e as regras do Firestore.
      </div>
    `;
  });
}

if (demandForm) {
  demandForm.addEventListener("submit", createDemand);
}

if (toggleDemandFormButton && demandFormPanel) {
  toggleDemandFormButton.addEventListener("click", () => {
    demandFormPanel.classList.toggle("is-hidden");
  });
}

if (clearDemandFormButton) {
  clearDemandFormButton.addEventListener("click", resetDemandForm);
}

if (demandSearchInput) {
  demandSearchInput.addEventListener("input", renderDemands);
}

if (demandClientFilter) {
  demandClientFilter.addEventListener("change", renderDemands);
}

if (demandStatusFilter) {
  demandStatusFilter.addEventListener("change", renderDemands);
}

if (demandPriorityFilter) {
  demandPriorityFilter.addEventListener("change", renderDemands);
}

if (demandsList) {
  demandsList.addEventListener("change", (event) => {
    const statusSelect = event.target.closest("[data-demand-status-select]");

    if (!statusSelect) return;

    const card = event.target.closest("[data-demand-id]");
    const demandId = card?.dataset.demandId;

    if (!demandId) return;

    updateDemandStatus(demandId, statusSelect.value);
  });

  demandsList.addEventListener("click", (event) => {
    const deleteButton = event.target.closest("[data-delete-demand]");

    if (!deleteButton) return;

    const card = event.target.closest("[data-demand-id]");
    const demandId = card?.dataset.demandId;

    if (!demandId) return;

    deleteDemand(demandId);
  });
}

onAuthStateChanged(auth, (user) => {
  if (!user) return;

  startClientsListener();
  startDemandsListener();
});