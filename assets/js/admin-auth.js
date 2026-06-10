// assets/js/admin-auth.js

import { auth } from "./firebase-config.js";

import {
  browserLocalPersistence,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

/*
  Coloque aqui os e-mails autorizados a acessar o painel.
  Por enquanto, deixa só o seu.
*/

const ADMIN_EMAILS = [
  "loopingtecnologia@gmail.com"
];

const currentPath = window.location.pathname;

const isLoginPage =
  currentPath.endsWith("/admin/login.html") ||
  currentPath.endsWith("/admin/login") ||
  currentPath.includes("/admin/login.html");

const isAdminArea =
  currentPath.includes("/admin") && !isLoginPage;

function isAllowedAdmin(user) {
  if (!user || !user.email) return false;
  return ADMIN_EMAILS.includes(user.email.toLowerCase());
}

function showMessage(message, type = "info") {
  const messageBox = document.getElementById("adminAuthMessage");

  if (!messageBox) return;

  messageBox.textContent = message;
  messageBox.className = `admin-message ${type}`;
}

function setLoading(isLoading) {
  const button = document.querySelector("[data-login-button]");

  if (!button) return;

  button.disabled = isLoading;
  button.textContent = isLoading ? "Entrando..." : "Entrar no painel";
}

/* =========================
   LOGIN
========================= */

const loginForm = document.getElementById("adminLoginForm");

if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("adminEmail").value.trim().toLowerCase();
    const password = document.getElementById("adminPassword").value;

    if (!email || !password) {
      showMessage("Preencha e-mail e senha para continuar.", "error");
      return;
    }

    if (!ADMIN_EMAILS.includes(email)) {
      showMessage("Este e-mail não está autorizado para acessar o painel.", "error");
      return;
    }

    try {
      setLoading(true);
      showMessage("");

      await setPersistence(auth, browserLocalPersistence);
      await signInWithEmailAndPassword(auth, email, password);

      window.location.href = "/admin/";
    } catch (error) {
      console.error("Erro no login admin:", error);

      let friendlyMessage = "Não foi possível entrar. Confira o e-mail e a senha.";

      if (error.code === "auth/user-not-found") {
        friendlyMessage = "Usuário não encontrado no Firebase Authentication.";
      }

      if (error.code === "auth/wrong-password" || error.code === "auth/invalid-credential") {
        friendlyMessage = "E-mail ou senha inválidos.";
      }

      if (error.code === "auth/too-many-requests") {
        friendlyMessage = "Muitas tentativas. Aguarde um pouco e tente novamente.";
      }

      showMessage(friendlyMessage, "error");
    } finally {
      setLoading(false);
    }
  });
}

/* =========================
   PROTEÇÃO DAS PÁGINAS
========================= */

onAuthStateChanged(auth, async (user) => {
  if (isLoginPage) {
    if (user && isAllowedAdmin(user)) {
      window.location.href = "/admin/";
    }

    return;
  }

  if (isAdminArea) {
    if (!user) {
      window.location.href = "/admin/login.html";
      return;
    }

    if (!isAllowedAdmin(user)) {
      await signOut(auth);
      window.location.href = "/admin/login.html";
      return;
    }

    const userEmailElement = document.getElementById("adminUserEmail");

    if (userEmailElement) {
      userEmailElement.textContent = user.email;
    }
  }
});

/* =========================
   LOGOUT
========================= */

document.querySelectorAll("[data-admin-logout]").forEach((button) => {
  button.addEventListener("click", async () => {
    try {
      await signOut(auth);
      window.location.href = "/admin/login.html";
    } catch (error) {
      console.error("Erro ao sair:", error);
      alert("Não foi possível sair agora. Tente novamente.");
    }
  });
});