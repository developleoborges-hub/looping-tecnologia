// assets/js/admin-leads.js

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

const leadsCollectionRef = collection(db, "crmLeads");
const clientsCollectionRef = collection(db, "crmClients");

const leadForm = document.getElementById("leadForm");
const leadFormPanel = document.getElementById("leadFormPanel");
const toggleLeadFormButton = document.getElementById("toggleLeadFormButton");
const clearLeadFormButton = document.getElementById("clearLeadFormButton");
const leadFormMessage = document.getElementById("leadFormMessage");
const leadsList = document.getElementById("leadsList");
const leadSearchInput = document.getElementById("leadSearchInput");
const leadStatusFilter = document.getElementById("leadStatusFilter");
const saveLeadButton = document.querySelector("[data-save-lead-button]");

let leadsCache = [];
let unsubscribeLeads = null;

const statusLabels = {
  novo: "Novo",
  em_atendimento: "Em atendimento",
  proposta_enviada: "Proposta enviada",
  aguardando_resposta: "Aguardando resposta",
  fechado: "Fechado",
  perdido: "Perdido"
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

function showLeadMessage(message, type = "info") {
  if (!leadFormMessage) return;

  leadFormMessage.textContent = message;
  leadFormMessage.className = `admin-message ${type}`;
}

function setSaving(isSaving) {
  if (!saveLeadButton) return;

  saveLeadButton.disabled = isSaving;
  saveLeadButton.textContent = isSaving ? "Salvando..." : "Salvar lead";
}

function formatDate(timestamp) {
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

function mapProjectTypeFromInterest(interest) {
  const value = String(interest || "").toLowerCase();

  if (value.includes("erp")) return "ERP";
  if (value.includes("fotógrafos") || value.includes("fotografos")) return "Site + sistema";
  if (value.includes("landing")) return "Landing page";
  if (value.includes("site")) return "Site institucional";
  if (value.includes("sistema")) return "Sistema web";
  if (value.includes("links")) return "Sistema web";

  return "Outro";
}

function buildClientNotesFromLead(lead) {
  const parts = [];

  parts.push("Cliente criado a partir de um lead no CRM da Looping.");

  if (lead.source) {
    parts.push(`Origem do lead: ${lead.source}.`);
  }

  if (lead.interest) {
    parts.push(`Interesse inicial: ${lead.interest}.`);
  }

  if (lead.message) {
    parts.push(`Mensagem/observações do lead: ${lead.message}`);
  }

  return parts.join("\n\n");
}

function resetLeadForm() {
  if (!leadForm) return;

  leadForm.reset();

  const leadStatus = document.getElementById("leadStatus");
  const leadInterest = document.getElementById("leadInterest");
  const leadSource = document.getElementById("leadSource");

  if (leadStatus) leadStatus.value = "novo";
  if (leadInterest) leadInterest.value = "Site institucional";
  if (leadSource) leadSource.value = "WhatsApp";

  showLeadMessage("");
}

function renderLeads() {
  if (!leadsList) return;

  const searchTerm = normalizeText(leadSearchInput?.value || "");
  const statusFilter = leadStatusFilter?.value || "todos";

  const filteredLeads = leadsCache.filter((lead) => {
    const textToSearch = normalizeText(`
      ${lead.name || ""}
      ${lead.company || ""}
      ${lead.email || ""}
      ${lead.phone || ""}
      ${lead.interest || ""}
      ${lead.source || ""}
      ${lead.message || ""}
    `);

    const matchesSearch = !searchTerm || textToSearch.includes(searchTerm);
    const matchesStatus = statusFilter === "todos" || lead.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  if (!filteredLeads.length) {
    leadsList.innerHTML = `
      <div class="admin-empty">
        Nenhum lead encontrado por enquanto.
      </div>
    `;
    return;
  }

  leadsList.innerHTML = filteredLeads.map((lead) => {
    const whatsappLink = getWhatsAppLink(lead.phone);
    const status = lead.status || "novo";
    const isConverted = Boolean(lead.convertedToClient);

    return `
      <article class="admin-list-card" data-lead-id="${lead.id}">
        <div class="admin-list-main">
          <div class="admin-list-title-row">
            <h3>${escapeHTML(lead.name || "Lead sem nome")}</h3>

            <span class="admin-status-badge status-${status}">
              ${escapeHTML(statusLabels[status] || "Novo")}
            </span>

            ${isConverted ? `
              <span class="admin-status-badge status-convertido">
                Convertido em cliente
              </span>
            ` : ""}
          </div>

          <p class="admin-list-subtitle">
            ${escapeHTML(lead.company || "Sem empresa informada")} • ${escapeHTML(lead.interest || "Interesse não informado")}
          </p>

          <div class="admin-list-meta">
            ${lead.email ? `<span>${escapeHTML(lead.email)}</span>` : ""}
            ${lead.phone ? `<span>${escapeHTML(lead.phone)}</span>` : ""}
            ${lead.source ? `<span>Origem: ${escapeHTML(lead.source)}</span>` : ""}
            <span>Criado em: ${formatDate(lead.createdAt)}</span>
          </div>

          ${lead.message ? `<p class="admin-list-message">${escapeHTML(lead.message)}</p>` : ""}
        </div>

        <div class="admin-list-actions">
          <select class="admin-small-select" data-lead-status-select>
            <option value="novo" ${status === "novo" ? "selected" : ""}>Novo</option>
            <option value="em_atendimento" ${status === "em_atendimento" ? "selected" : ""}>Em atendimento</option>
            <option value="proposta_enviada" ${status === "proposta_enviada" ? "selected" : ""}>Proposta enviada</option>
            <option value="aguardando_resposta" ${status === "aguardando_resposta" ? "selected" : ""}>Aguardando resposta</option>
            <option value="fechado" ${status === "fechado" ? "selected" : ""}>Fechado</option>
            <option value="perdido" ${status === "perdido" ? "selected" : ""}>Perdido</option>
          </select>

          ${!isConverted ? `
            <button type="button" class="admin-mini-button success" data-convert-lead>
              Converter em cliente
            </button>
          ` : `
            <button type="button" class="admin-mini-button is-disabled" disabled>
              Cliente criado
            </button>
          `}

          ${whatsappLink ? `
            <a class="admin-mini-button" href="${whatsappLink}" target="_blank" rel="noopener">
              WhatsApp
            </a>
          ` : ""}

          <button type="button" class="admin-mini-button danger" data-delete-lead>
            Excluir
          </button>
        </div>
      </article>
    `;
  }).join("");
}

async function createLead(event) {
  event.preventDefault();

  const user = auth.currentUser;

  if (!user) {
    showLeadMessage("Sua sessão expirou. Faça login novamente.", "error");
    return;
  }

  const name = getInputValue("leadName");
  const company = getInputValue("leadCompany");
  const email = getInputValue("leadEmail");
  const phone = getInputValue("leadPhone");
  const interest = getInputValue("leadInterest");
  const source = getInputValue("leadSource");
  const status = getInputValue("leadStatus") || "novo";
  const message = getInputValue("leadMessage");

  if (!name) {
    showLeadMessage("Informe pelo menos o nome do contato.", "error");
    return;
  }

  try {
    setSaving(true);
    showLeadMessage("");

    await addDoc(leadsCollectionRef, {
      name,
      company,
      email,
      phone,
      interest,
      source,
      status,
      message,
      convertedToClient: false,
      convertedClientId: "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: user.email,
      updatedBy: user.email
    });

    resetLeadForm();
    showLeadMessage("Lead cadastrado com sucesso.", "success");
  } catch (error) {
    console.error("Erro ao cadastrar lead:", error);
    showLeadMessage("Não foi possível cadastrar o lead. Confira as regras do Firestore.", "error");
  } finally {
    setSaving(false);
  }
}

async function updateLeadStatus(leadId, newStatus) {
  const user = auth.currentUser;

  if (!user) {
    alert("Sua sessão expirou. Faça login novamente.");
    return;
  }

  try {
    const leadRef = doc(db, "crmLeads", leadId);

    await updateDoc(leadRef, {
      status: newStatus,
      updatedAt: serverTimestamp(),
      updatedBy: user.email
    });
  } catch (error) {
    console.error("Erro ao atualizar status:", error);
    alert("Não foi possível atualizar o status do lead.");
  }
}

async function convertLeadToClient(leadId) {
  const user = auth.currentUser;

  if (!user) {
    alert("Sua sessão expirou. Faça login novamente.");
    return;
  }

  const lead = leadsCache.find((item) => item.id === leadId);

  if (!lead) {
    alert("Lead não encontrado na lista atual.");
    return;
  }

  if (lead.convertedToClient) {
    alert("Este lead já foi convertido em cliente.");
    return;
  }

  const clientName = lead.company || lead.name || "Cliente sem nome";
  const contactName = lead.company ? lead.name : "";

  const confirmed = confirm(
    `Converter "${clientName}" em cliente?\n\nO cliente será criado como "Em implantação".`
  );

  if (!confirmed) return;

  try {
    const clientDocRef = await addDoc(clientsCollectionRef, {
      name: clientName,
      contact: contactName,
      email: lead.email || "",
      phone: lead.phone || "",
      projectName: lead.interest || "",
      projectType: mapProjectTypeFromInterest(lead.interest),
      status: "implantacao",
      monthlyValue: 0,
      dueDay: "",
      startDate: "",
      projectUrl: "",
      notes: buildClientNotesFromLead(lead),
      sourceLeadId: lead.id,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: user.email,
      updatedBy: user.email
    });

    const leadRef = doc(db, "crmLeads", leadId);

    await updateDoc(leadRef, {
      status: "fechado",
      convertedToClient: true,
      convertedClientId: clientDocRef.id,
      convertedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedBy: user.email
    });

    alert("Lead convertido em cliente com sucesso.");
  } catch (error) {
    console.error("Erro ao converter lead em cliente:", error);
    alert("Não foi possível converter este lead em cliente.");
  }
}

async function deleteLead(leadId) {
  const lead = leadsCache.find((item) => item.id === leadId);

  const message = lead?.convertedToClient
    ? "Este lead já foi convertido em cliente. Deseja excluir apenas o registro do lead? O cliente criado não será apagado."
    : "Tem certeza que deseja excluir este lead?";

  const confirmed = confirm(message);

  if (!confirmed) return;

  try {
    const leadRef = doc(db, "crmLeads", leadId);
    await deleteDoc(leadRef);
  } catch (error) {
    console.error("Erro ao excluir lead:", error);
    alert("Não foi possível excluir este lead.");
  }
}

function startLeadsListener() {
  if (!leadsList || unsubscribeLeads) return;

  const leadsQuery = query(
    leadsCollectionRef,
    orderBy("createdAt", "desc")
  );

  unsubscribeLeads = onSnapshot(leadsQuery, (snapshot) => {
    leadsCache = snapshot.docs.map((docItem) => ({
      id: docItem.id,
      ...docItem.data()
    }));

    renderLeads();
  }, (error) => {
    console.error("Erro ao carregar leads:", error);

    leadsList.innerHTML = `
      <div class="admin-empty">
        Não foi possível carregar os leads. Confira o login e as regras do Firestore.
      </div>
    `;
  });
}

if (leadForm) {
  leadForm.addEventListener("submit", createLead);
}

if (toggleLeadFormButton && leadFormPanel) {
  toggleLeadFormButton.addEventListener("click", () => {
    leadFormPanel.classList.toggle("is-hidden");
  });
}

if (clearLeadFormButton) {
  clearLeadFormButton.addEventListener("click", resetLeadForm);
}

if (leadSearchInput) {
  leadSearchInput.addEventListener("input", renderLeads);
}

if (leadStatusFilter) {
  leadStatusFilter.addEventListener("change", renderLeads);
}

if (leadsList) {
  leadsList.addEventListener("change", (event) => {
    const statusSelect = event.target.closest("[data-lead-status-select]");

    if (!statusSelect) return;

    const card = event.target.closest("[data-lead-id]");
    const leadId = card?.dataset.leadId;

    if (!leadId) return;

    updateLeadStatus(leadId, statusSelect.value);
  });

  leadsList.addEventListener("click", (event) => {
    const convertButton = event.target.closest("[data-convert-lead]");

    if (convertButton) {
      const card = event.target.closest("[data-lead-id]");
      const leadId = card?.dataset.leadId;

      if (!leadId) return;

      convertLeadToClient(leadId);
      return;
    }

    const deleteButton = event.target.closest("[data-delete-lead]");

    if (!deleteButton) return;

    const card = event.target.closest("[data-lead-id]");
    const leadId = card?.dataset.leadId;

    if (!leadId) return;

    deleteLead(leadId);
  });
}

onAuthStateChanged(auth, (user) => {
  if (!user) return;
  startLeadsListener();
});