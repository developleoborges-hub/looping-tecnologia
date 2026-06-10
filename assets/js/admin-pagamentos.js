// assets/js/admin-pagamentos.js

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

const paymentsCollectionRef = collection(db, "crmPayments");
const clientsCollectionRef = collection(db, "crmClients");

const paymentForm = document.getElementById("paymentForm");
const paymentFormPanel = document.getElementById("paymentFormPanel");
const togglePaymentFormButton = document.getElementById("togglePaymentFormButton");
const clearPaymentFormButton = document.getElementById("clearPaymentFormButton");
const paymentFormMessage = document.getElementById("paymentFormMessage");
const paymentsList = document.getElementById("paymentsList");

const paymentClient = document.getElementById("paymentClient");
const paymentReferenceMonth = document.getElementById("paymentReferenceMonth");
const paymentClientFilter = document.getElementById("paymentClientFilter");
const paymentSearchInput = document.getElementById("paymentSearchInput");
const paymentStatusFilter = document.getElementById("paymentStatusFilter");
const paymentMonthFilter = document.getElementById("paymentMonthFilter");
const savePaymentButton = document.querySelector("[data-save-payment-button]");

const paymentsExpectedMonth = document.getElementById("paymentsExpectedMonth");
const paymentsPaidMonth = document.getElementById("paymentsPaidMonth");
const paymentsPendingTotal = document.getElementById("paymentsPendingTotal");
const paymentsOverdueTotal = document.getElementById("paymentsOverdueTotal");

let clientsCache = [];
let paymentsCache = [];
let unsubscribeClients = null;
let unsubscribePayments = null;

const statusLabels = {
  pendente: "Pendente",
  pago: "Pago",
  atrasado: "Atrasado",
  cancelado: "Cancelado"
};

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

function formatMonthLabel(monthString) {
  if (!monthString) return "Sem referência";

  const [year, month] = monthString.split("-");

  if (!year || !month) return "Sem referência";

  return `${month}/${year}`;
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

function isPaymentOverdue(payment) {
  if (!payment || payment.status !== "pendente") return false;
  if (!payment.dueDate) return false;

  return payment.dueDate < getTodayDateString();
}

function showPaymentMessage(message, type = "info") {
  if (!paymentFormMessage) return;

  paymentFormMessage.textContent = message;
  paymentFormMessage.className = `admin-message ${type}`;
}

function setSaving(isSaving) {
  if (!savePaymentButton) return;

  savePaymentButton.disabled = isSaving;
  savePaymentButton.textContent = isSaving ? "Salvando..." : "Salvar pagamento";
}

function getSelectedClientData() {
  if (!paymentClient) return null;

  const selectedOption = paymentClient.selectedOptions[0];

  if (!selectedOption || !selectedOption.value) return null;

  return {
    id: selectedOption.value,
    name: selectedOption.dataset.name || selectedOption.textContent || ""
  };
}

function resetPaymentForm() {
  if (!paymentForm) return;

  paymentForm.reset();

  setInputValue("paymentType", "Mensalidade");
  setInputValue("paymentStatus", "pendente");
  setInputValue("paymentMethod", "");
  setInputValue("paymentReferenceMonth", getCurrentMonth());

  showPaymentMessage("");
}

function populateClientSelects() {
  if (paymentClient) {
    if (!clientsCache.length) {
      paymentClient.innerHTML = `<option value="">Cadastre um cliente primeiro</option>`;
      paymentClient.disabled = true;
    } else {
      paymentClient.disabled = false;

      paymentClient.innerHTML = `
        <option value="">Selecione um cliente</option>
        ${clientsCache.map((client) => `
          <option value="${escapeHTML(client.id)}" data-name="${escapeHTML(client.name || "")}" data-monthly="${escapeHTML(client.monthlyValue || 0)}">
            ${escapeHTML(client.name || "Cliente sem nome")}
          </option>
        `).join("")}
      `;
    }
  }

  if (paymentClientFilter) {
    const currentValue = paymentClientFilter.value || "todos";

    paymentClientFilter.innerHTML = `
      <option value="todos">Todos os clientes</option>
      ${clientsCache.map((client) => `
        <option value="${escapeHTML(client.id)}">
          ${escapeHTML(client.name || "Cliente sem nome")}
        </option>
      `).join("")}
    `;

    paymentClientFilter.value = clientsCache.some((client) => client.id === currentValue)
      ? currentValue
      : "todos";
  }
}

function updateStats() {
  const selectedMonth = paymentMonthFilter?.value || getCurrentMonth();

  const paymentsFromMonth = paymentsCache.filter((payment) => {
    return payment.referenceMonth === selectedMonth;
  });

  const expectedMonth = paymentsFromMonth
    .filter((payment) => payment.status !== "cancelado")
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

  const paidMonth = paymentsFromMonth
    .filter((payment) => payment.status === "pago")
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

  const pendingTotal = paymentsCache
    .filter((payment) => payment.status === "pendente")
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

  const overdueTotal = paymentsCache
    .filter((payment) => isPaymentOverdue(payment) || payment.status === "atrasado")
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

  if (paymentsExpectedMonth) paymentsExpectedMonth.textContent = formatMoney(expectedMonth);
  if (paymentsPaidMonth) paymentsPaidMonth.textContent = formatMoney(paidMonth);
  if (paymentsPendingTotal) paymentsPendingTotal.textContent = formatMoney(pendingTotal);
  if (paymentsOverdueTotal) paymentsOverdueTotal.textContent = formatMoney(overdueTotal);
}

function renderPayments() {
  if (!paymentsList) return;

  const searchTerm = normalizeText(paymentSearchInput?.value || "");
  const clientFilter = paymentClientFilter?.value || "todos";
  const statusFilter = paymentStatusFilter?.value || "todos";
  const monthFilter = paymentMonthFilter?.value || "";

  const filteredPayments = paymentsCache.filter((payment) => {
    const textToSearch = normalizeText(`
      ${payment.title || ""}
      ${payment.clientName || ""}
      ${payment.type || ""}
      ${payment.method || ""}
      ${payment.notes || ""}
    `);

    const matchesSearch = !searchTerm || textToSearch.includes(searchTerm);
    const matchesClient = clientFilter === "todos" || payment.clientId === clientFilter;
    const matchesMonth = !monthFilter || payment.referenceMonth === monthFilter;

    let matchesStatus = true;

    if (statusFilter === "vencido") {
      matchesStatus = isPaymentOverdue(payment);
    } else if (statusFilter !== "todos") {
      matchesStatus = payment.status === statusFilter;
    }

    return matchesSearch && matchesClient && matchesStatus && matchesMonth;
  });

  updateStats();

  if (!filteredPayments.length) {
    paymentsList.innerHTML = `
      <div class="admin-empty">
        Nenhum pagamento encontrado por enquanto.
      </div>
    `;
    return;
  }

  paymentsList.innerHTML = filteredPayments.map((payment) => {
    const status = payment.status || "pendente";
    const overdue = isPaymentOverdue(payment);
    const visualStatusClass = overdue ? "status-payment-vencido" : `status-payment-${status}`;
    const visualStatusLabel = overdue ? "Vencido" : (statusLabels[status] || "Pendente");

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
            ${escapeHTML(payment.clientName || "Cliente não informado")} • ${formatMoney(payment.amount || 0)}
          </p>

          <div class="admin-list-meta">
            <span>Referência: ${formatMonthLabel(payment.referenceMonth)}</span>
            <span>Vencimento: ${formatDateFromInput(payment.dueDate)}</span>
            ${payment.paidDate ? `<span>Pago em: ${formatDateFromInput(payment.paidDate)}</span>` : ""}
            ${payment.method ? `<span>Forma: ${escapeHTML(payment.method)}</span>` : ""}
          </div>

          ${payment.notes ? `
            <p class="admin-list-message">${escapeHTML(payment.notes)}</p>
          ` : ""}
        </div>

        <div class="admin-list-actions">
          <select class="admin-small-select" data-payment-status-select>
            <option value="pendente" ${status === "pendente" ? "selected" : ""}>Pendente</option>
            <option value="pago" ${status === "pago" ? "selected" : ""}>Pago</option>
            <option value="atrasado" ${status === "atrasado" ? "selected" : ""}>Atrasado</option>
            <option value="cancelado" ${status === "cancelado" ? "selected" : ""}>Cancelado</option>
          </select>

          ${payment.clientId ? `
            <a class="admin-mini-button" href="/admin/cliente.html?id=${encodeURIComponent(payment.clientId)}">
              Ver cliente
            </a>
          ` : ""}

          <button type="button" class="admin-mini-button success" data-mark-payment-paid>
            Marcar pago
          </button>

          <button type="button" class="admin-mini-button danger" data-delete-payment>
            Excluir
          </button>
        </div>
      </article>
    `;
  }).join("");
}

async function createPayment(event) {
  event.preventDefault();

  const user = auth.currentUser;

  if (!user) {
    showPaymentMessage("Sua sessão expirou. Faça login novamente.", "error");
    return;
  }

  const selectedClient = getSelectedClientData();
  const title = getInputValue("paymentTitle");
  const type = getInputValue("paymentType") || "Mensalidade";
  const referenceMonth = getInputValue("paymentReferenceMonth") || getCurrentMonth();
  const amount = parseMoney(getInputValue("paymentAmount"));
  const dueDate = getInputValue("paymentDueDate");
  const status = getInputValue("paymentStatus") || "pendente";
  const paidDate = getInputValue("paymentPaidDate");
  const method = getInputValue("paymentMethod");
  const notes = getInputValue("paymentNotes");

  if (!selectedClient) {
    showPaymentMessage("Selecione um cliente para vincular o pagamento.", "error");
    return;
  }

  if (!title) {
    showPaymentMessage("Informe a descrição do pagamento.", "error");
    return;
  }

  if (!amount || amount <= 0) {
    showPaymentMessage("Informe um valor válido para o pagamento.", "error");
    return;
  }

  if (!dueDate) {
    showPaymentMessage("Informe a data de vencimento.", "error");
    return;
  }

  if (status === "pago" && !paidDate) {
    showPaymentMessage("Se o pagamento está pago, informe a data de pagamento.", "error");
    return;
  }

  try {
    setSaving(true);
    showPaymentMessage("");

    await addDoc(paymentsCollectionRef, {
      clientId: selectedClient.id,
      clientName: selectedClient.name,
      title,
      type,
      referenceMonth,
      amount,
      dueDate,
      status,
      paidDate,
      method,
      notes,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: user.email,
      updatedBy: user.email
    });

    resetPaymentForm();
    showPaymentMessage("Pagamento cadastrado com sucesso.", "success");
  } catch (error) {
    console.error("Erro ao cadastrar pagamento:", error);
    showPaymentMessage("Não foi possível cadastrar o pagamento. Confira as regras do Firestore.", "error");
  } finally {
    setSaving(false);
  }
}

async function updatePaymentStatus(paymentId, newStatus) {
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

async function markPaymentAsPaid(paymentId) {
  const confirmed = confirm("Marcar este pagamento como pago com a data de hoje?");

  if (!confirmed) return;

  await updatePaymentStatus(paymentId, "pago");
}

async function deletePayment(paymentId) {
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
  }, (error) => {
    console.error("Erro ao carregar clientes:", error);

    if (paymentClient) {
      paymentClient.innerHTML = `<option value="">Erro ao carregar clientes</option>`;
      paymentClient.disabled = true;
    }
  });
}

function startPaymentsListener() {
  if (!paymentsList || unsubscribePayments) return;

  const paymentsQuery = query(
    paymentsCollectionRef,
    orderBy("dueDate", "desc")
  );

  unsubscribePayments = onSnapshot(paymentsQuery, (snapshot) => {
    paymentsCache = snapshot.docs.map((docItem) => ({
      id: docItem.id,
      ...docItem.data()
    }));

    renderPayments();
  }, (error) => {
    console.error("Erro ao carregar pagamentos:", error);

    paymentsList.innerHTML = `
      <div class="admin-empty">
        Não foi possível carregar os pagamentos. Confira o login e as regras do Firestore.
      </div>
    `;
  });
}

if (paymentForm) {
  paymentForm.addEventListener("submit", createPayment);
}

if (togglePaymentFormButton && paymentFormPanel) {
  togglePaymentFormButton.addEventListener("click", () => {
    paymentFormPanel.classList.toggle("is-hidden");
  });
}

if (clearPaymentFormButton) {
  clearPaymentFormButton.addEventListener("click", resetPaymentForm);
}

if (paymentSearchInput) {
  paymentSearchInput.addEventListener("input", renderPayments);
}

if (paymentClientFilter) {
  paymentClientFilter.addEventListener("change", renderPayments);
}

if (paymentStatusFilter) {
  paymentStatusFilter.addEventListener("change", renderPayments);
}

if (paymentMonthFilter) {
  paymentMonthFilter.addEventListener("change", renderPayments);
}

if (paymentClient) {
  paymentClient.addEventListener("change", () => {
    const selectedOption = paymentClient.selectedOptions[0];

    if (!selectedOption) return;

    const monthlyValue = Number(selectedOption.dataset.monthly || 0);
    const amountInput = document.getElementById("paymentAmount");
    const typeInput = document.getElementById("paymentType");

    if (monthlyValue && amountInput && !amountInput.value) {
      amountInput.value = monthlyValue.toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
    }

    if (typeInput && !typeInput.value) {
      typeInput.value = "Mensalidade";
    }
  });
}

if (paymentsList) {
  paymentsList.addEventListener("change", (event) => {
    const statusSelect = event.target.closest("[data-payment-status-select]");

    if (!statusSelect) return;

    const card = event.target.closest("[data-payment-id]");
    const paymentId = card?.dataset.paymentId;

    if (!paymentId) return;

    updatePaymentStatus(paymentId, statusSelect.value);
  });

  paymentsList.addEventListener("click", (event) => {
    const markPaidButton = event.target.closest("[data-mark-payment-paid]");

    if (markPaidButton) {
      const card = event.target.closest("[data-payment-id]");
      const paymentId = card?.dataset.paymentId;

      if (!paymentId) return;

      markPaymentAsPaid(paymentId);
      return;
    }

    const deleteButton = event.target.closest("[data-delete-payment]");

    if (!deleteButton) return;

    const card = event.target.closest("[data-payment-id]");
    const paymentId = card?.dataset.paymentId;

    if (!paymentId) return;

    deletePayment(paymentId);
  });
}

onAuthStateChanged(auth, (user) => {
  if (!user) return;

  if (paymentReferenceMonth) {
    paymentReferenceMonth.value = getCurrentMonth();
  }

  if (paymentMonthFilter) {
    paymentMonthFilter.value = getCurrentMonth();
  }

  startClientsListener();
  startPaymentsListener();
});