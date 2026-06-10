// assets/js/admin-cliente.js

import { auth, db } from "./firebase-config.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const params = new URLSearchParams(window.location.search);
const clientId = params.get("id");

const clientEditForm = document.getElementById("clientEditForm");
const clientEditMessage = document.getElementById("clientEditMessage");
const saveClientEditButton = document.querySelector("[data-save-client-edit-button]");

const clientPageTitle = document.getElementById("clientPageTitle");
const clientPageSubtitle = document.getElementById("clientPageSubtitle");

const clientSummaryStatus = document.getElementById("clientSummaryStatus");
const clientSummaryMonthly = document.getElementById("clientSummaryMonthly");
const clientSummaryDueDay = document.getElementById("clientSummaryDueDay");
const clientSummaryProjectType = document.getElementById("clientSummaryProjectType");

const clientWhatsappLink = document.getElementById("clientWhatsappLink");
const clientProjectLink = document.getElementById("clientProjectLink");

const clientDemandsList = document.getElementById("clientDemandsList");
const clientDemandsStatusFilter = document.getElementById("clientDemandsStatusFilter");

const clientPaymentsList = document.getElementById("clientPaymentsList");
const clientPaymentsStatusFilter = document.getElementById("clientPaymentsStatusFilter");
const clientPaymentsMonthFilter = document.getElementById("clientPaymentsMonthFilter");

const clientPaymentsPaidMonth = document.getElementById("clientPaymentsPaidMonth");
const clientPaymentsPendingTotal = document.getElementById("clientPaymentsPendingTotal");
const clientPaymentsOverdueTotal = document.getElementById("clientPaymentsOverdueTotal");

const statusLabels = {
  implantacao: "Em implantação",
  ativo: "Ativo",
  pausado: "Pausado",
  encerrado: "Encerrado"
};

const demandStatusLabels = {
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

const paymentStatusLabels = {
  pendente: "Pendente",
  pago: "Pago",
  atrasado: "Atrasado",
  cancelado: "Cancelado"
};

let currentClient = null;
let clientDemandsCache = [];
let unsubscribeClientDemands = null;

let clientPaymentsCache = [];
let unsubscribeClientPayments = null;

function getInputValue(id) {
  const element = document.getElementById(id);
  return element ? element.value.trim() : "";
}

function setInputValue(id, value) {
  const element = document.getElementById(id);

  if (!element) return;

  element.value = value || "";
}

function escapeHTML(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showMessage(message, type = "info") {
  if (!clientEditMessage) return;

  clientEditMessage.textContent = message;
  clientEditMessage.className = `admin-message ${type}`;
}

function setSaving(isSaving) {
  if (!saveClientEditButton) return;

  saveClientEditButton.disabled = isSaving;
  saveClientEditButton.textContent = isSaving ? "Salvando..." : "Salvar alterações";
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

function formatExtraMoney(value) {
  const number = Number(value || 0);

  if (!number) return "";

  return number.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function formatMoneyForInput(value) {
  const number = Number(value || 0);

  if (!number) return "";

  return number.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
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

function getWhatsAppLink(phone) {
  const onlyNumbers = String(phone || "").replace(/\D/g, "");

  if (!onlyNumbers) return "";

  const numberWithCountry = onlyNumbers.startsWith("55")
    ? onlyNumbers
    : `55${onlyNumbers}`;

  return `https://wa.me/${numberWithCountry}`;
}

function hideElement(element) {
  if (!element) return;
  element.classList.add("is-hidden");
}

function showElement(element) {
  if (!element) return;
  element.classList.remove("is-hidden");
}

function updateSummary(client) {
  if (!client) return;

  if (clientPageTitle) {
    clientPageTitle.textContent = client.name || "Cliente sem nome";
  }

  if (clientPageSubtitle) {
    const projectName = client.projectName || "Projeto sem nome";
    const contact = client.contact ? `Contato: ${client.contact}` : "Sem contato principal informado";

    clientPageSubtitle.textContent = `${projectName} • ${contact}`;
  }

  if (clientSummaryStatus) {
    clientSummaryStatus.textContent = statusLabels[client.status] || "Em implantação";
  }

  if (clientSummaryMonthly) {
    clientSummaryMonthly.textContent = formatMoney(client.monthlyValue);
  }

  if (clientSummaryDueDay) {
    clientSummaryDueDay.textContent = client.dueDay ? `Dia ${client.dueDay}` : "Sem vencimento";
  }

  if (clientSummaryProjectType) {
    clientSummaryProjectType.textContent = client.projectType || "Não informado";
  }

  const whatsappUrl = getWhatsAppLink(client.phone);

  if (clientWhatsappLink && whatsappUrl) {
    clientWhatsappLink.href = whatsappUrl;
    showElement(clientWhatsappLink);
  } else {
    hideElement(clientWhatsappLink);
  }

  if (clientProjectLink && client.projectUrl) {
    clientProjectLink.href = client.projectUrl;
    showElement(clientProjectLink);
  } else {
    hideElement(clientProjectLink);
  }
}

function fillForm(client) {
  setInputValue("clientName", client.name);
  setInputValue("clientContact", client.contact);
  setInputValue("clientEmail", client.email);
  setInputValue("clientPhone", client.phone);
  setInputValue("clientProjectName", client.projectName);
  setInputValue("clientProjectType", client.projectType || "Site institucional");
  setInputValue("clientStatus", client.status || "implantacao");
  setInputValue("clientMonthlyValue", formatMoneyForInput(client.monthlyValue));
  setInputValue("clientDueDay", client.dueDay);
  setInputValue("clientStartDate", client.startDate);
  setInputValue("clientProjectUrl", client.projectUrl);
  setInputValue("clientNotes", client.notes);
}

async function loadClient() {
  if (!clientId) {
    if (clientPageTitle) {
      clientPageTitle.textContent = "Cliente não informado";
    }

    showMessage("Nenhum ID de cliente foi enviado na URL.", "error");
    return;
  }

  try {
    const clientRef = doc(db, "crmClients", clientId);
    const clientSnap = await getDoc(clientRef);

    if (!clientSnap.exists()) {
      if (clientPageTitle) {
        clientPageTitle.textContent = "Cliente não encontrado";
      }

      showMessage("Este cliente não existe ou foi excluído.", "error");
      return;
    }

    currentClient = {
      id: clientSnap.id,
      ...clientSnap.data()
    };

    updateSummary(currentClient);
    fillForm(currentClient);
  } catch (error) {
    console.error("Erro ao carregar cliente:", error);
    showMessage("Não foi possível carregar este cliente.", "error");
  }
}

async function saveClientChanges(event) {
  event.preventDefault();

  const user = auth.currentUser;

  if (!user) {
    showMessage("Sua sessão expirou. Faça login novamente.", "error");
    return;
  }

  if (!clientId) {
    showMessage("ID do cliente não encontrado.", "error");
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
    showMessage("Informe pelo menos o nome do cliente ou empresa.", "error");
    return;
  }

  if (dueDay && (Number(dueDay) < 1 || Number(dueDay) > 31)) {
    showMessage("O dia de vencimento precisa estar entre 1 e 31.", "error");
    return;
  }

  try {
    setSaving(true);
    showMessage("");

    const clientRef = doc(db, "crmClients", clientId);

    const updatedClient = {
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
      updatedAt: serverTimestamp(),
      updatedBy: user.email
    };

    await updateDoc(clientRef, updatedClient);

    currentClient = {
      ...currentClient,
      ...updatedClient
    };

    updateSummary(currentClient);
    showMessage("Cliente atualizado com sucesso.", "success");
  } catch (error) {
    console.error("Erro ao salvar cliente:", error);
    showMessage("Não foi possível salvar as alterações.", "error");
  } finally {
    setSaving(false);
  }
}

function sortDemandsByCreatedAt(demands) {
  return [...demands].sort((a, b) => {
    const dateA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
    const dateB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;

    return dateB - dateA;
  });
}

function renderClientDemands() {
  if (!clientDemandsList) return;

  const statusFilter = clientDemandsStatusFilter?.value || "todos";

  const filteredDemands = sortDemandsByCreatedAt(clientDemandsCache).filter((demand) => {
    return statusFilter === "todos" || demand.status === statusFilter;
  });

  if (!filteredDemands.length) {
    clientDemandsList.innerHTML = `
      <div class="admin-empty">
        Nenhuma demanda encontrada para este cliente.
      </div>
    `;
    return;
  }

  clientDemandsList.innerHTML = filteredDemands.map((demand) => {
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
              ${escapeHTML(demandStatusLabels[status] || "Pendente")}
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
            ${escapeHTML(demand.type || "Tipo não informado")}
          </p>

          <div class="admin-list-meta">
            <span>Prazo: ${formatDateFromInput(demand.dueDate)}</span>
            <span>Criada em: ${formatTimestamp(demand.createdAt)}</span>
            ${extraValue ? `<span>Valor extra: ${formatExtraMoney(extraValue)}</span>` : ""}
          </div>

          ${demand.description ? `
            <p class="admin-list-message">${escapeHTML(demand.description)}</p>
          ` : ""}

          ${demand.notes ? `
            <p class="admin-list-message admin-list-note">
              <strong>Notas internas:</strong> ${escapeHTML(demand.notes)}
            </p>
          ` : ""}
        </div>

        <div class="admin-list-actions">
          <select class="admin-small-select" data-client-demand-status-select>
            <option value="pendente" ${status === "pendente" ? "selected" : ""}>Pendente</option>
            <option value="em_andamento" ${status === "em_andamento" ? "selected" : ""}>Em andamento</option>
            <option value="concluida" ${status === "concluida" ? "selected" : ""}>Concluída</option>
            <option value="pausada" ${status === "pausada" ? "selected" : ""}>Pausada</option>
            <option value="cancelada" ${status === "cancelada" ? "selected" : ""}>Cancelada</option>
          </select>

          <button type="button" class="admin-mini-button danger" data-delete-client-demand>
            Excluir
          </button>
        </div>
      </article>
    `;
  }).join("");
}

function startClientDemandsListener() {
  if (!clientDemandsList || !clientId || unsubscribeClientDemands) return;

  const demandsQuery = query(
    collection(db, "crmDemands"),
    where("clientId", "==", clientId)
  );

  unsubscribeClientDemands = onSnapshot(demandsQuery, (snapshot) => {
    clientDemandsCache = snapshot.docs.map((docItem) => ({
      id: docItem.id,
      ...docItem.data()
    }));

    renderClientDemands();
  }, (error) => {
    console.error("Erro ao carregar demandas do cliente:", error);

    clientDemandsList.innerHTML = `
      <div class="admin-empty">
        Não foi possível carregar as demandas deste cliente.
      </div>
    `;
  });
}

async function updateClientDemandStatus(demandId, newStatus) {
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

async function deleteClientDemand(demandId) {
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

function formatCurrency(value) {
  const number = Number(value || 0);

  return number.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function getCurrentMonth() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");

  return `${year}-${month}`;
}

function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function isClientPaymentOverdue(payment) {
  if (!payment || payment.status !== "pendente") return false;
  if (!payment.dueDate) return false;

  return payment.dueDate < getTodayDateString();
}

function sortPaymentsByDueDate(payments) {
  return [...payments].sort((a, b) => {
    const dateA = a.dueDate || "9999-99-99";
    const dateB = b.dueDate || "9999-99-99";

    return dateB.localeCompare(dateA);
  });
}

function updateClientPaymentsSummary() {
  const selectedMonth = clientPaymentsMonthFilter?.value || getCurrentMonth();

  const paymentsFromMonth = clientPaymentsCache.filter((payment) => {
    return payment.referenceMonth === selectedMonth;
  });

  const paidMonth = paymentsFromMonth
    .filter((payment) => payment.status === "pago")
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

  const pendingTotal = clientPaymentsCache
    .filter((payment) => ["pendente", "atrasado"].includes(payment.status || "pendente"))
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

  const overdueTotal = clientPaymentsCache
    .filter((payment) => isClientPaymentOverdue(payment) || payment.status === "atrasado")
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

  if (clientPaymentsPaidMonth) {
    clientPaymentsPaidMonth.textContent = formatCurrency(paidMonth);
  }

  if (clientPaymentsPendingTotal) {
    clientPaymentsPendingTotal.textContent = formatCurrency(pendingTotal);
  }

  if (clientPaymentsOverdueTotal) {
    clientPaymentsOverdueTotal.textContent = formatCurrency(overdueTotal);
  }
}

function renderClientPayments() {
  if (!clientPaymentsList) return;

  const statusFilter = clientPaymentsStatusFilter?.value || "todos";
  const monthFilter = clientPaymentsMonthFilter?.value || "";

  const filteredPayments = sortPaymentsByDueDate(clientPaymentsCache).filter((payment) => {
    const matchesMonth = !monthFilter || payment.referenceMonth === monthFilter;

    let matchesStatus = true;

    if (statusFilter === "vencido") {
      matchesStatus = isClientPaymentOverdue(payment);
    } else if (statusFilter !== "todos") {
      matchesStatus = payment.status === statusFilter;
    }

    return matchesMonth && matchesStatus;
  });

  updateClientPaymentsSummary();

  if (!filteredPayments.length) {
    clientPaymentsList.innerHTML = `
      <div class="admin-empty">
        Nenhum pagamento encontrado para este cliente.
      </div>
    `;
    return;
  }

  clientPaymentsList.innerHTML = filteredPayments.map((payment) => {
    const status = payment.status || "pendente";
    const overdue = isClientPaymentOverdue(payment);
    const visualStatusClass = overdue ? "status-payment-vencido" : `status-payment-${status}`;
    const visualStatusLabel = overdue ? "Vencido" : (paymentStatusLabels[status] || "Pendente");

    return `
      <article class="admin-list-card" data-payment-id="${escapeHTML(payment.id)}">
        <div class="admin-list-main">
          <div class="admin-list-title-row">
            <h3>${escapeHTML(payment.title || "Pagamento sem descrição")}</h3>

            <span class="admin-status-badge ${escapeHTML(visualStatusClass)}">
              ${escapeHTML(visualStatusLabel)}
            </span>

            <span class="admin-status-badge status-payment-type">
              ${escapeHTML(payment.type || "Tipo não informado")}
            </span>
          </div>

          <p class="admin-list-subtitle">
            ${formatCurrency(payment.amount || 0)}
          </p>

          <div class="admin-list-meta">
            <span>Referência: ${escapeHTML(payment.referenceMonth || "Sem referência")}</span>
            <span>Vencimento: ${formatDateFromInput(payment.dueDate)}</span>
            ${payment.paidDate ? `<span>Pago em: ${formatDateFromInput(payment.paidDate)}</span>` : ""}
            ${payment.method ? `<span>Forma: ${escapeHTML(payment.method)}</span>` : ""}
          </div>

          ${payment.notes ? `
            <p class="admin-list-message">${escapeHTML(payment.notes)}</p>
          ` : ""}
        </div>

        <div class="admin-list-actions">
          <select class="admin-small-select" data-client-payment-status-select>
            <option value="pendente" ${status === "pendente" ? "selected" : ""}>Pendente</option>
            <option value="pago" ${status === "pago" ? "selected" : ""}>Pago</option>
            <option value="atrasado" ${status === "atrasado" ? "selected" : ""}>Atrasado</option>
            <option value="cancelado" ${status === "cancelado" ? "selected" : ""}>Cancelado</option>
          </select>

          <button type="button" class="admin-mini-button success" data-client-payment-paid>
            Marcar pago
          </button>

          <button type="button" class="admin-mini-button danger" data-delete-client-payment>
            Excluir
          </button>
        </div>
      </article>
    `;
  }).join("");
}

function startClientPaymentsListener() {
  if (!clientPaymentsList || !clientId || unsubscribeClientPayments) return;

  const paymentsQuery = query(
    collection(db, "crmPayments"),
    where("clientId", "==", clientId)
  );

  unsubscribeClientPayments = onSnapshot(paymentsQuery, (snapshot) => {
    clientPaymentsCache = snapshot.docs.map((docItem) => ({
      id: docItem.id,
      ...docItem.data()
    }));

    renderClientPayments();
  }, (error) => {
    console.error("Erro ao carregar pagamentos do cliente:", error);

    clientPaymentsList.innerHTML = `
      <div class="admin-empty">
        Não foi possível carregar os pagamentos deste cliente.
      </div>
    `;
  });
}

async function updateClientPaymentStatus(paymentId, newStatus) {
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

  if (newStatus === "pago") {
    updatePayload.paidDate = getTodayDateString();
  }

  try {
    const paymentRef = doc(db, "crmPayments", paymentId);
    await updateDoc(paymentRef, updatePayload);
  } catch (error) {
    console.error("Erro ao atualizar pagamento:", error);
    alert("Não foi possível atualizar o status do pagamento.");
  }
}

async function markClientPaymentAsPaid(paymentId) {
  const confirmed = confirm("Marcar este pagamento como pago com a data de hoje?");

  if (!confirmed) return;

  await updateClientPaymentStatus(paymentId, "pago");
}

async function deleteClientPayment(paymentId) {
  const confirmed = confirm("Tem certeza que deseja excluir este pagamento?");

  if (!confirmed) return;

  try {
    const paymentRef = doc(db, "crmPayments", paymentId);
    await deleteDoc(paymentRef);
  } catch (error) {
    console.error("Erro ao excluir pagamento:", error);
    alert("Não foi possível excluir este pagamento.");
  }
}

if (clientEditForm) {
  clientEditForm.addEventListener("submit", saveClientChanges);
}

if (clientDemandsStatusFilter) {
  clientDemandsStatusFilter.addEventListener("change", renderClientDemands);
}

if (clientPaymentsStatusFilter) {
  clientPaymentsStatusFilter.addEventListener("change", renderClientPayments);
}

if (clientPaymentsMonthFilter) {
  clientPaymentsMonthFilter.value = getCurrentMonth();
  clientPaymentsMonthFilter.addEventListener("change", renderClientPayments);
}

if (clientDemandsList) {
  clientDemandsList.addEventListener("change", (event) => {
    const statusSelect = event.target.closest("[data-client-demand-status-select]");

    if (!statusSelect) return;

    const card = event.target.closest("[data-demand-id]");
    const demandId = card?.dataset.demandId;

    if (!demandId) return;

    updateClientDemandStatus(demandId, statusSelect.value);
  });

  clientDemandsList.addEventListener("click", (event) => {
    const deleteButton = event.target.closest("[data-delete-client-demand]");

    if (!deleteButton) return;

    const card = event.target.closest("[data-demand-id]");
    const demandId = card?.dataset.demandId;

    if (!demandId) return;

    deleteClientDemand(demandId);
  });
}

if (clientPaymentsList) {
  clientPaymentsList.addEventListener("change", (event) => {
    const statusSelect = event.target.closest("[data-client-payment-status-select]");

    if (!statusSelect) return;

    const card = event.target.closest("[data-payment-id]");
    const paymentId = card?.dataset.paymentId;

    if (!paymentId) return;

    updateClientPaymentStatus(paymentId, statusSelect.value);
  });

  clientPaymentsList.addEventListener("click", (event) => {
    const markPaidButton = event.target.closest("[data-client-payment-paid]");

    if (markPaidButton) {
      const card = event.target.closest("[data-payment-id]");
      const paymentId = card?.dataset.paymentId;

      if (!paymentId) return;

      markClientPaymentAsPaid(paymentId);
      return;
    }

    const deleteButton = event.target.closest("[data-delete-client-payment]");

    if (!deleteButton) return;

    const card = event.target.closest("[data-payment-id]");
    const paymentId = card?.dataset.paymentId;

    if (!paymentId) return;

    deleteClientPayment(paymentId);
  });
}

onAuthStateChanged(auth, (user) => {
  if (!user) return;

  loadClient();
  startClientDemandsListener();
  startClientPaymentsListener();
});