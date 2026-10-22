// EcoCart AI - sync.js
// Runs on every page. On the EcoCart website (where you logged in) the key "ecocart_user"
// exists in localStorage; we copy the user id into the extension so "Add to bag" can also
// add the product to your website cart. On every other site the key does not exist.
(function () {
  try {
    const raw = localStorage.getItem("ecocart_user");
    if (!raw) return;
    const u = JSON.parse(raw);
    if (u && u.user_id) {
      chrome.storage.local.set({ ecoUser: { user_id: u.user_id, full_name: u.full_name || "" } });
    }
  } catch (e) { /* storage blocked on this page - ignore */ }
})();