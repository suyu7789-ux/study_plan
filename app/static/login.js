const passwordInput = document.getElementById("password");
const passwordToggle = document.getElementById("passwordToggle");

passwordToggle.addEventListener("click", () => {
  const reveal = passwordInput.type === "password";
  passwordInput.type = reveal ? "text" : "password";
  passwordToggle.title = reveal ? "隐藏密码" : "显示密码";
  passwordToggle.setAttribute("aria-label", passwordToggle.title);
  passwordToggle.innerHTML = `<i data-lucide="${reveal ? "eye-off" : "eye"}"></i>`;
  window.lucide?.createIcons();
  passwordInput.focus();
});

window.lucide?.createIcons();
