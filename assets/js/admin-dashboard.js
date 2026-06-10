// assets/js/admin-dashboard.js

import { auth, db } from "./firebase-config.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  collection,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const dashboardLeadsNew = document.getElementById("dashboardLeadsNew");
const dashboardClientsActive = document.getElementById("dashboardClientsActive");
const dashboardDemandsOpen = document.getElementById("dashboardDemandsOpen");
const dashboardPaymentsPending = document.getElementById("dashboardPaymentsPending");

const dashboardMonthFilter = document.getElementById("dashboardMonthFilter");

const dashboardExpectedMonth = document.getElementById("dashboardExpectedMonth");
const dashboardPaidMonth = document.getElementById("dashboardPaidMonth");
const dashboardPendingAmount = document.getElementById("dashboardPendingAmount");
const dashboardOverdueAmount = document.getElementById("dashboardOverdueAmount");

const dashboardRecentLeads = document.getElementById("dashboardRecentLeads");
const dashboardPriorityDemands = document.getElementById("dashboardPriorityDemands");
const dashboardUpcomingPayments = document.getElementById("dashboardUpcomingPayments");

let leadsCache = [];
let clientsCache = [];
let demandsCache = [];
let paymentsCache = [];

let listenersStarted = false;

const leadStatusLabels = {
  novo: "Novo",
  em_atendimento: "Em atendimento",
  proposta_enviada: "Proposta enviada",
  aguardando_resposta: "Aguardando resposta",
  fechado: "Fechado",
  perdido: "Perdido"
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

function escapeHTML(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatMoney(value) {
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

function getTimestampMillis(item) {
  if (!item?.createdAt?.toMillis) return 0;
  return item.createdAt.toMillis();
}

function isOpenDemand(demand) {
  return ["pendente", "em_andamento", "pausada"].includes(demand.status || "pendente");
}

function isPaymentOverdue(payment) {
  if (!payment || payment.status !== "pendente") return false;
  if (!payment.dueDate) return false;

  return payment.dueDate < getTodayDateString();
}

function renderStats() {
  const leadsNew = leadsCache.filter((lead) => (lead.status || "novo") === "novo").length;
  const clientsActive = clientsCache.filter((client) => (client.status || "") === "ativo").length;
  const demandsOpen = demandsCache.filter(isOpenDemand).length;

  const paymentsPending = paymentsCache.filter((payment) => {
    return ["pendente", "atrasado"].includes(payment.status || "pendente");
  }).length;

  if (dashboardLeadsNew) dashboardLeadsNew.textContent = leadsNew;
  if (dashboardClientsActive) dashboardClientsActive.textContent = clientsActive;
  if (dashboardDemandsOpen) dashboardDemandsOpen.textContent = demandsOpen;
  if (dashboardPaymentsPending) dashboardPaymentsPending.textContent = paymentsPending;
}

function renderFinancialStats() {
  const selectedMonth = dashboardMonthFilter?.value || getCurrentMonth();

  const paymentsFromMonth = paymentsCache.filter((payment) => {
    return payment.referenceMonth === selectedMonth;
  });

  const expectedMonth = paymentsFromMonth
    .filter((payment) => payment.status !== "cancelado")
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

  const paidMonth = paymentsFromMonth
    .filter((payment) => payment.status === "pago")
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

  const pendingAmount = paymentsCache
    .filter((payment) => ["pendente", "atrasado"].includes(payment.status || "pendente"))
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

  const overdueAmount = paymentsCache
    .filter((payment) => isPaymentOverdue(payment) || payment.status === "atrasado")
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

  if (dashboardExpectedMonth) dashboardExpectedMonth.textContent = formatMoney(expectedMonth);
  if (dashboardPaidMonth) dashboardPaidMonth.textContent = formatMoney(paidMonth);
  if (dashboardPendingAmount) dashboardPendingAmount.textContent = formatMoney(pendingAmount);
  if (dashboardOverdueAmount) dashboardOverdueAmount.textContent = formatMoney(overdueAmount);
}

function renderRecentLeads() {
  if (!dashboardRecentLeads) return;

  const recentLeads = [...leadsCache]
    .sort((a, b) => getTimestampMillis(b) - getTimestampMillis(a))
    .slice(0, 5);

  if (!recentLeads.length) {
    dashboardRecentLeads.innerHTML = `
      <div class="admin-empty">Nenhum lead cadastrado ainda.</div>
    `;
    return;
  }

  dashboardRecentLeads.innerHTML = recentLeads.map((lead) => {
    const status = lead.status || "novo";

    return `
      <a href="/admin/leads.html" class="dashboard-row">
        <div>
          <strong>${escapeHTML(lead.name || "Lead sem nome")}</strong>
          <span>${escapeHTML(lead.company || lead.interest || "Sem empresa informada")}</span>
          <small>Criado em: ${formatTimestamp(lead.createdAt)}</small>
        </div>

        <em class="admin-status-badge status-${escapeHTML(status)}">
          ${escapeHTML(leadStatusLabels[status] || "Novo")}
        </em>
      </a>
    `;
  }).join("");
}

function renderPriorityDemands() {
  if (!dashboardPriorityDemands) return;

  const priorityDemands = [...demandsCache]
    .filter((demand) => {
      const priority = demand.priority || "media";
      return isOpenDemand(demand) && ["alta", "urgente"].includes(priority);
    })
    .sort((a, b) => {
      const weight = {
        urgente: 4,
        alta: 3,
        media: 2,
        baixa: 1
      };

      const priorityA = weight[a.priority || "media"] || 0;
      const priorityB = weight[b.priority || "media"] || 0;

      if (priorityA !== priorityB) return priorityB - priorityA;

      return getTimestampMillis(b) - getTimestampMillis(a);
    })
    .slice(0, 5);

  if (!priorityDemands.length) {
    dashboardPriorityDemands.innerHTML = `
      <div class="admin-empty">Nenhuma demanda alta ou urgente aberta.</div>
    `;
    return;
  }

  dashboardPriorityDemands.innerHTML = priorityDemands.map((demand) => {
    const status = demand.status || "pendente";
    const priority = demand.priority || "media";

    return `
      <a href="/admin/demandas.html" class="dashboard-row">
        <div>
          <strong>${escapeHTML(demand.title || "Demanda sem título")}</strong>
          <span>${escapeHTML(demand.clientName || "Cliente não informado")}</span>
          <small>Status: ${escapeHTML(demandStatusLabels[status] || "Pendente")}</small>
        </div>

        <em class="admin-status-badge priority-${escapeHTML(priority)}">
          ${escapeHTML(priorityLabels[priority] || "Média")}
        </em>
      </a>
    `;
  }).join("");
}

function renderUpcomingPayments() {
  if (!dashboardUpcomingPayments) return;

  const upcomingPayments = [...paymentsCache]
    .filter((payment) => {
      return ["pendente", "atrasado"].includes(payment.status || "pendente");
    })
    .sort((a, b) => {
      const dateA = a.dueDate || "9999-99-99";
      const dateB = b.dueDate || "9999-99-99";

      return dateA.localeCompare(dateB);
    })
    .slice(0, 6);

  if (!upcomingPayments.length) {
    dashboardUpcomingPayments.innerHTML = `
      <div class="admin-empty">Nenhum pagamento pendente no momento.</div>
    `;
    return;
  }

  dashboardUpcomingPayments.innerHTML = upcomingPayments.map((payment) => {
    const overdue = isPaymentOverdue(payment);
    const status = payment.status || "pendente";
    const visualStatusClass = overdue ? "status-payment-vencido" : `status-payment-${status}`;
    const visualStatusLabel = overdue ? "Vencido" : (paymentStatusLabels[status] || "Pendente");

    return `
      <a href="/admin/pagamentos.html" class="dashboard-row dashboard-payment-row">
        <div>
          <strong>${escapeHTML(payment.title || "Pagamento sem descrição")}</strong>
          <span>${escapeHTML(payment.clientName || "Cliente não informado")}</span>
          <small>Vencimento: ${formatDateFromInput(payment.dueDate)}</small>
        </div>

        <div class="dashboard-payment-side">
          <strong>${formatMoney(payment.amount || 0)}</strong>
          <em class="admin-status-badge ${escapeHTML(visualStatusClass)}">
            ${escapeHTML(visualStatusLabel)}
          </em>
        </div>
      </a>
    `;
  }).join("");
}

function renderDashboard() {
  renderStats();
  renderFinancialStats();
  renderRecentLeads();
  renderPriorityDemands();
  renderUpcomingPayments();
}

function startDashboardListeners() {
  if (listenersStarted) return;

  listenersStarted = true;

  onSnapshot(collection(db, "crmLeads"), (snapshot) => {
    leadsCache = snapshot.docs.map((docItem) => ({
      id: docItem.id,
      ...docItem.data()
    }));

    renderDashboard();
  }, (error) => {
    console.error("Erro ao carregar leads no dashboard:", error);
  });

  onSnapshot(collection(db, "crmClients"), (snapshot) => {
    clientsCache = snapshot.docs.map((docItem) => ({
      id: docItem.id,
      ...docItem.data()
    }));

    renderDashboard();
  }, (error) => {
    console.error("Erro ao carregar clientes no dashboard:", error);
  });

  onSnapshot(collection(db, "crmDemands"), (snapshot) => {
    demandsCache = snapshot.docs.map((docItem) => ({
      id: docItem.id,
      ...docItem.data()
    }));

    renderDashboard();
  }, (error) => {
    console.error("Erro ao carregar demandas no dashboard:", error);
  });

  onSnapshot(collection(db, "crmPayments"), (snapshot) => {
    paymentsCache = snapshot.docs.map((docItem) => ({
      id: docItem.id,
      ...docItem.data()
    }));

    renderDashboard();
  }, (error) => {
    console.error("Erro ao carregar pagamentos no dashboard:", error);
  });
}

if (dashboardMonthFilter) {
  dashboardMonthFilter.value = getCurrentMonth();
  dashboardMonthFilter.addEventListener("change", renderFinancialStats);
}

onAuthStateChanged(auth, (user) => {
  if (!user) return;

  startDashboardListeners();
});