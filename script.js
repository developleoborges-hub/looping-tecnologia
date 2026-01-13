// ===== SCROLL ANIMATION =====
const sections = document.querySelectorAll("section");

window.addEventListener("scroll", () => {
  sections.forEach(sec => {
    const top = window.scrollY;
    const offset = sec.offsetTop - 400;
    const height = sec.offsetHeight;
    if (top >= offset && top < offset + height) {
      sec.classList.add("show");
    }
  });
});

// ===== MENU SCROLL TO =====
document.querySelectorAll('.nav a').forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    const target = document.querySelector(link.getAttribute('href'));
    target.scrollIntoView({ behavior: 'smooth' });
  });
});

// ===== MENU MOBILE =====
const menuToggle = document.getElementById("menu-toggle");
const navMenu = document.getElementById("nav-menu");

menuToggle.addEventListener("click", () => {
  navMenu.classList.toggle("show");
  menuToggle.classList.toggle("active");
});

// Animação do botão hambúrguer
menuToggle.addEventListener("click", () => {
  const spans = menuToggle.querySelectorAll("span");
  spans[0].classList.toggle("rotate1");
  spans[1].classList.toggle("hide");
  spans[2].classList.toggle("rotate2");
});

// ===== HEADER TRANSPARÊNCIA DINÂMICA =====
const header = document.querySelector(".header");

window.addEventListener("scroll", () => {
  if (window.scrollY > 50) {
    header.classList.add("scrolled");
  } else {
    header.classList.remove("scrolled");
  }
});

// ===== FORMULÁRIO DE CONTATO =====
document.getElementById("contatoForm").addEventListener("submit", function (e) {
  e.preventDefault();

  const nome = document.getElementById("nome").value;
  const telefone = document.getElementById("telefone").value;
  const ramo = document.getElementById("ramo").value;
  const plano = document.getElementById("plano").value;

  const assunto = `Novo contato de ${nome}`;
  const corpo = `
Nome: ${nome}
Telefone: ${telefone}
Ramo de negócio: ${ramo}
Plano desejado: ${plano}
`;

  const mailtoLink = `mailto:contato@loopingtecnologia.com.br?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`;
  window.location.href = mailtoLink;
});

// ===== FORMULÁRIO DE CONTATO COM MENSAGEM DE SUCESSO =====
const form = document.getElementById("contatoForm");
const mensagemStatus = document.getElementById("mensagemStatus");

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  // cria objeto com os dados do formulário
  const formData = new FormData(form);

  try {
    const response = await fetch(form.action, {
      method: "POST",
      body: formData,
      headers: {
        Accept: "application/json",
      },
    });

    if (response.ok) {
      // mensagem de sucesso
      mensagemStatus.textContent = "✅ Mensagem enviada com sucesso! Entraremos em contato em breve.";
      mensagemStatus.className = "mensagem-status sucesso";
      mensagemStatus.style.opacity = "1";

      // limpa formulário
      form.reset();

      // esconde a mensagem após alguns segundos
      setTimeout(() => {
        mensagemStatus.style.opacity = "0";
      }, 5000);
    } else {
      throw new Error("Erro no envio");
    }
  } catch (error) {
    mensagemStatus.textContent = "❌ Ocorreu um erro ao enviar. Tente novamente mais tarde.";
    mensagemStatus.className = "mensagem-status erro";
    mensagemStatus.style.opacity = "1";
  }
});
