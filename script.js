// =========================================================
// LOOPING TECNOLOGIA — SCRIPT GLOBAL
// Substitua TODO o seu script.js por este arquivo.
// Ele funciona tanto no index.html quanto em loopingparafotografos.html.
// =========================================================

const siteHeader = document.getElementById("siteHeader");
const menuToggle = document.getElementById("menuToggle");
const mainNav = document.getElementById("mainNav");

// Header com efeito ao rolar
function updateHeader() {
  if (!siteHeader) return;

  if (window.scrollY > 24) {
    siteHeader.classList.add("scrolled");
  } else {
    siteHeader.classList.remove("scrolled");
  }
}

window.addEventListener("scroll", updateHeader);
window.addEventListener("load", updateHeader);

// Menu mobile
if (menuToggle && mainNav) {
  menuToggle.addEventListener("click", () => {
    const isOpen = mainNav.classList.toggle("show");
    menuToggle.classList.toggle("active", isOpen);
    menuToggle.setAttribute("aria-expanded", String(isOpen));
  });

  mainNav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      mainNav.classList.remove("show");
      menuToggle.classList.remove("active");
      menuToggle.setAttribute("aria-expanded", "false");
    });
  });
}

// Fecha menu ao clicar fora
window.addEventListener("click", (event) => {
  if (!mainNav || !menuToggle) return;

  const clickedInsideMenu = mainNav.contains(event.target);
  const clickedToggle = menuToggle.contains(event.target);

  if (!clickedInsideMenu && !clickedToggle) {
    mainNav.classList.remove("show");
    menuToggle.classList.remove("active");
    menuToggle.setAttribute("aria-expanded", "false");
  }
});

// Animações de entrada
const revealElements = document.querySelectorAll(".reveal");

if ("IntersectionObserver" in window) {
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.16 }
  );

  revealElements.forEach((element) => revealObserver.observe(element));
} else {
  revealElements.forEach((element) => element.classList.add("visible"));
}

// Scroll suave para âncoras internas, sem quebrar links externos ou páginas .html
const internalLinks = document.querySelectorAll('a[href^="#"]');

internalLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    const href = link.getAttribute("href");

    if (!href || href === "#") return;

    const target = document.querySelector(href);
    if (!target) return;

    event.preventDefault();
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

// Formulário do index.html via FormSubmit
const contatoForm = document.getElementById("contatoForm");
const mensagemStatus = document.getElementById("mensagemStatus");

function setStatus(message, type) {
  if (!mensagemStatus) return;

  mensagemStatus.textContent = message;
  mensagemStatus.className = `form-status show ${type}`;
}

if (contatoForm && mensagemStatus) {
  contatoForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const submitButton = contatoForm.querySelector('button[type="submit"]');
    const originalText = submitButton ? submitButton.textContent : "";

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Enviando...";
    }

    try {
      const formData = new FormData(contatoForm);

      const response = await fetch(contatoForm.action, {
        method: "POST",
        body: formData,
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Falha no envio do formulário.");
      }

      contatoForm.reset();
      setStatus("Mensagem enviada com sucesso. Vou te responder em breve!", "success");
    } catch (error) {
      setStatus("Não consegui enviar por aqui. Me chame pelo WhatsApp no botão verde.", "error");
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = originalText;
      }
    }
  });
}

// Formulário da página Looping para Fotógrafos: abre WhatsApp com texto pronto
const leadForm = document.getElementById("leadForm");

if (leadForm) {
  leadForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const nome = document.getElementById("nomeFoto")?.value.trim();
    const whatsapp = document.getElementById("whatsappFoto")?.value.trim();
    const tipo = document.getElementById("tipoFoto")?.value || "Não informado";
    const modulos = document.getElementById("modulosFoto")?.value || "Não informado";
    const mensagem = document.getElementById("mensagemFoto")?.value.trim();

    const numeroDestino = "5541999722511";

    const texto = `Olá! Vim pela página Looping para Fotógrafos.

Nome: ${nome || "Não informado"}
WhatsApp: ${whatsapp || "Não informado"}
Tipo de fotografia: ${tipo}
Módulos de interesse: ${modulos}

Mensagem:
${mensagem || "Quero entender como montar uma solução personalizada para meu trabalho como fotógrafo."}`;

    const url = `https://wa.me/${numeroDestino}?text=${encodeURIComponent(texto)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  });
}
