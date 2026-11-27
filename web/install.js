"use strict";

const installButton = document.getElementById("installOpen");
const installDialog = document.getElementById("installDialog");
let installPrompt;

if (matchMedia("(display-mode: standalone)").matches || navigator.standalone) installButton.hidden = true;

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  installPrompt = event;
});
window.addEventListener("appinstalled", () => {
  installPrompt = undefined;
  installButton.hidden = true;
});
installButton.addEventListener("click", async () => {
  if (installPrompt) {
    const prompt = installPrompt;
    installPrompt = undefined;
    try {
      await prompt.prompt();
      return;
    } catch {}
  }
  installDialog.showModal();
});
document.getElementById("installClose").onclick = () => installDialog.close();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}
