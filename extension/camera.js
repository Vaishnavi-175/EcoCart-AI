// EcoCart AI camera page. The popup cannot show Chrome's camera permission prompt,
// so the live camera runs here (a normal extension tab) and the photo is handed back
// to the popup through chrome.storage.local ("pendingPhoto").
const v = document.getElementById("v");
const shot = document.getElementById("shot");
const cap = document.getElementById("cap");
const again = document.getElementById("again");
const use = document.getElementById("use");
const msg = document.getElementById("msg");
let stream = null, dataUrl = null;

function say(t, cls) { msg.textContent = t; msg.className = cls || ""; }

async function start() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 960 } },
      audio: false
    });
    v.srcObject = stream;
    cap.disabled = false;
    say("");
  } catch (e) {
    const name = e && e.name;
    if (name === "NotAllowedError") say("Camera permission was blocked. Click the camera icon in the address bar, choose Allow, then reload this tab.", "err");
    else if (name === "NotFoundError" || name === "OverconstrainedError") say("No camera was found on this computer. Close this tab and use Upload instead.", "err");
    else if (name === "NotReadableError") say("Another app is using the camera. Close it and reload this tab.", "err");
    else say("Could not open the camera: " + (e && e.message ? e.message : e), "err");
  }
}

function stop() { if (stream) stream.getTracks().forEach((t) => t.stop()); stream = null; }

cap.addEventListener("click", () => {
  const c = document.createElement("canvas");
  const w = v.videoWidth || 1280, h = v.videoHeight || 960;
  const scale = Math.min(1, 1000 / Math.max(w, h)); // keep it light for the server
  c.width = Math.round(w * scale); c.height = Math.round(h * scale);
  c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
  dataUrl = c.toDataURL("image/jpeg", 0.85);
  shot.src = dataUrl;
  shot.classList.remove("hide"); v.classList.add("hide");
  cap.classList.add("hide"); again.classList.remove("hide"); use.classList.remove("hide");
});

again.addEventListener("click", () => {
  dataUrl = null;
  shot.classList.add("hide"); v.classList.remove("hide");
  cap.classList.remove("hide"); again.classList.add("hide"); use.classList.add("hide");
});

use.addEventListener("click", async () => {
  if (!dataUrl) return;
  use.disabled = true;
  try {
    await chrome.storage.local.set({ pendingPhoto: dataUrl });
    stop();
    let opened = false;
    try { await chrome.action.openPopup(); opened = true; } catch (e) { /* not allowed from a tab in some Chrome versions */ }
    if (opened) { window.close(); return; }
    say("✓ Photo saved. Close this tab and click the EcoCart AI icon in the toolbar – the Camera tab will analyse it.", "ok");
    setTimeout(() => window.close(), 2500);
  } catch (e) {
    say("Could not save the photo: " + e.message, "err");
    use.disabled = false;
  }
});

window.addEventListener("beforeunload", stop);
start();