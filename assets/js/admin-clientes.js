// assets/js/admin-clientes.js

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

const clientsCollectionRef = collection(db, "crmClients");

const clientForm = document.getElementById("clientForm");
const clientFormPanel = document.getElementById("clientFormPanel");
const toggleClientFormButton = document.getElementById("toggleClientFormButton");
const clearClientFormButton = document.getElementById("clearClientFormButton");
const clientFormMessage = document.getElementById("clientFormMessage");
const clientsList = document.getElementById("clientsList");
const clientSearchInput = document.getElementById("clientSearchInput");
const clientStatusFilter = document.getElementById("clientStatusFilter");
const saveClientButton = document.querySelector("[data-save-client-button]");

let clientsCache = [];
let unsubscribeClients = null;

const statusLabels = {
  implantacao: "Em implantação",
  ativo: "Ativo",
  pausado: "Pausado",
  encerrado: "Encerrado"
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

function showClientMessage(message, type = "info") {
  if (!clientFormMessage) return;

  clientFormMessage.textContent = message;
  clientFormMessage.className = `admin-message ${type}`;
}

function setSaving(isSaving) {
  if (!saveClientButton) return;

  saveClientButton.disabled = isSaving;
  saveClientButton.textContent = isSaving ? "Salvando..." : "Salvar cliente";
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

  if (!number) return "Sem mensalidade";

  return number.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function formatDateFromInput(dateString) {
  if (!dateString) return "Sem data";

  const [year, month, day] = dateString.split("-");

  if (!year || !month || !day) return "Sem data";

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

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getWhatsAppLink(phone) {
  const onlyNumbers = String(phone || "").replace(/\D/g, "");

  if (!onlyNumbers) return "";

  const numberWithCountry = onlyNumbers.startsWith("55")
    ? onlyNumbers
    : `55${onlyNumbers}`;

  return `https://wa.me/${numberWithCountry}`;
}

function resetClientForm() {
  if (!clientForm) return;

  clientForm.reset();

  const status = document.getElementById("clientStatus");
  const type = document.getElementById("clientProjectType");

  if (status) status.value = "implantacao";
  if (type) type.value = "Site institucional";

  showClientMessage("");
}

function renderClients() {
  if (!clientsList) return;

  const searchTerm = normalizeText(clientSearchInput?.value || "");
  const statusFilter = clientStatusFilter?.value || "todos";

  const filteredClients = clientsCache.filter((client) => {
    const textToSearch = normalizeText(`
      ${client.name || ""}
      ${client.contact || ""}
      ${client.email || ""}
      ${client.phone || ""}
      ${client.projectName || ""}
      ${client.projectType || ""}
      ${client.notes || ""}
    `);

    const matchesSearch = !searchTerm || textToSearch.includes(searchTerm);
    const matchesStatus = statusFilter === "todos" || client.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  if (!filteredClients.length) {
    clientsList.innerHTML = `
      <div class="admin-empty">
        Nenhum cliente encontrado por enquanto.
      </div>
    `;
    return;
  }

  clientsList.innerHTML = filteredClients.map((client) => {
    const status = client.status || "implantacao";
    const whatsappLink = getWhatsAppLink(client.phone);
    const projectUrl = client.projectUrl || "";

    return `
      <article class="admin-list-card" data-client-id="${client.id}">
        <div class="admin-list-main">
          <div class="admin-list-title-row">
            <h3>${escapeHTML(client.name || "Cliente sem nome")}</h3>
            <span class="admin-status-badge status-client-${status}">
              ${statusLabels[status] || "Em implantação"}
            </span>
          </div>

          <p class="admin-list-subtitle">
            ${escapeHTML(client.projectName || "Projeto sem nome")} • ${escapeHTML(client.projectType || "Tipo não informado")}
          </p>

          <div class="admin-list-meta">
            ${client.contact ? `<span>Contato: ${escapeHTML(client.contact)}</span>` : ""}
            ${client.email ? `<span>${escapeHTML(client.email)}</span>` : ""}
            ${client.phone ? `<span>${escapeHTML(client.phone)}</span>` : ""}
            <span>${formatMoney(client.monthlyValue)}</span>
            ${client.dueDay ? `<span>Vence dia ${escapeHTML(client.dueDay)}</span>` : ""}
            ${client.startDate ? `<span>Entrada: ${formatDateFromInput(client.startDate)}</span>` : ""}
            <span>Criado em: ${formatTimestamp(client.createdAt)}</span>
          </div>

          ${client.notes ? `<p class="admin-list-message">${escapeHTML(client.notes)}</p>` : ""}
        </div>

        <div class="admin-list-actions">
          <select class="admin-small-select" data-client-status-select>
            <option value="implantacao" ${status === "implantacao" ? "selected" : ""}>Em implantação</option>
            <option value="ativo" ${status === "ativo" ? "selected" : ""}>Ativo</option>
            <option value="pausado" ${status === "pausado" ? "selected" : ""}>Pausado</option>
            <option value="encerrado" ${status === "encerrado" ? "selected" : ""}>Encerrado</option>
          </select>

          <a class="admin-mini-button" href="/admin/cliente.html?id=${encodeURIComponent(client.id)}">
             Ver/editar
          </a>

          ${projectUrl ? `
            <a class="admin-mini-button" href="${escapeHTML(projectUrl)}" target="_blank" rel="noopener">
              Abrir projeto
            </a>
          ` : ""}

          ${whatsappLink ? `
            <a class="admin-mini-button" href="${whatsappLink}" target="_blank" rel="noopener">
              WhatsApp
            </a>
          ` : ""}

          <button type="button" class="admin-mini-button danger" data-delete-client>
            Excluir
          </button>
        </div>
      </article>
    `;
  }).join("");
}

async function createClient(event) {
  event.preventDefault();

  const user = auth.currentUser;

  if (!user) {
    showClientMessage("Sua sessão expirou. Faça login novamente.", "error");
    return;
  }

  const name = getInputValue("clientName");
  const contact = getInputValue("clientContact");
  const email = getInputValue("clientEmail");
  const phone = getInputValue("clientPhone");
  const projectName = getInputValue("clientProjectName");
  const projectType = getInputValue("clientProjectType");
  const status = getInputValue("clientStatus") || "implantacao";
  const monthlyValue = parseMoney(getInputValue("clientMonthlyValue"));
  const dueDay = getInputValue("clientDueDay");
  const startDate = getInputValue("clientStartDate");
  const projectUrl = getInputValue("clientProjectUrl");
  const notes = getInputValue("clientNotes");

  if (!name) {
    showClientMessage("Informe pelo menos o nome do cliente ou empresa.", "error");
    return;
  }

  if (dueDay && (Number(dueDay) < 1 || Number(dueDay) > 31)) {
    showClientMessage("O dia de vencimento precisa estar entre 1 e 31.", "error");
    return;
  }

  try {
    setSaving(true);
    showClientMessage("");

    await addDoc(clientsCollectionRef, {
      name,
      contact,
      email,
      phone,
      projectName,
      projectType,
      status,
      monthlyValue,
      dueDay,
      startDate,
      projectUrl,
      notes,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: user.email,
      updatedBy: user.email
    });

    resetClientForm();
    showClientMessage("Cliente cadastrado com sucesso.", "success");
  } catch (error) {
    console.error("Erro ao cadastrar cliente:", error);
    showClientMessage("Não foi possível cadastrar o cliente. Confira as regras do Firestore.", "error");
  } finally {
    setSaving(false);
  }
}

async function updateClientStatus(clientId, newStatus) {
  const user = auth.currentUser;

  if (!user) {
    alert("Sua sessão expirou. Faça login novamente.");
    return;
  }

  try {
    const clientRef = doc(db, "crmClients", clientId);

    await updateDoc(clientRef, {
      status: newStatus,
      updatedAt: serverTimestamp(),
      updatedBy: user.email
    });
  } catch (error) {
    console.error("Erro ao atualizar status do cliente:", error);
    alert("Não foi possível atualizar o status do cliente.");
  }
}

async function deleteClient(clientId) {
  const confirmed = confirm("Tem certeza que deseja excluir este cliente?");

  if (!confirmed) return;

  try {
    const clientRef = doc(db, "crmClients", clientId);
    await deleteDoc(clientRef);
  } catch (error) {
    console.error("Erro ao excluir cliente:", error);
    alert("Não foi possível excluir este cliente.");
  }
}

function startClientsListener() {
  if (!clientsList || unsubscribeClients) return;

  const clientsQuery = query(
    clientsCollectionRef,
    orderBy("createdAt", "desc")
  );

  unsubscribeClients = onSnapshot(clientsQuery, (snapshot) => {
    clientsCache = snapshot.docs.map((docItem) => ({
      id: docItem.id,
      ...docItem.data()
    }));

    renderClients();
  }, (error) => {
    console.error("Erro ao carregar clientes:", error);

    clientsList.innerHTML = `
      <div class="admin-empty">
        Não foi possível carregar os clientes. Confira o login e as regras do Firestore.
      </div>
    `;
  });
}

if (clientForm) {
  clientForm.addEventListener("submit", createClient);
}

if (toggleClientFormButton && clientFormPanel) {
  toggleClientFormButton.addEventListener("click", () => {
    clientFormPanel.classList.toggle("is-hidden");
  });
}

if (clearClientFormButton) {
  clearClientFormButton.addEventListener("click", resetClientForm);
}

if (clientSearchInput) {
  clientSearchInput.addEventListener("input", renderClients);
}

if (clientStatusFilter) {
  clientStatusFilter.addEventListener("change", renderClients);
}

if (clientsList) {
  clientsList.addEventListener("change", (event) => {
    const statusSelect = event.target.closest("[data-client-status-select]");

    if (!statusSelect) return;

    const card = event.target.closest("[data-client-id]");
    const clientId = card?.dataset.clientId;

    if (!clientId) return;

    updateClientStatus(clientId, statusSelect.value);
  });

  clientsList.addEventListener("click", (event) => {
    const deleteButton = event.target.closest("[data-delete-client]");

    if (!deleteButton) return;

    const card = event.target.closest("[data-client-id]");
    const clientId = card?.dataset.clientId;

    if (!clientId) return;

    deleteClient(clientId);
  });
}

onAuthStateChanged(auth, (user) => {
  if (!user) return;
  startClientsListener();
});