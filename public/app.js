const adminToggle = document.querySelector("[data-admin-toggle]");
const adminPanel = document.querySelector("[data-admin-panel]");

if (adminToggle && adminPanel) {
  adminToggle.addEventListener("click", () => {
    adminPanel.classList.toggle("revealed");
  });
}
