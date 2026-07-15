/**
 * Retell Website Chat Widget — shared injector for all pages.
 * Pattern matches hillcountryhvacrepair.com (official retell-widget-v2 embed).
 * Docs: https://docs.retellai.com/deploy/chat-widget
 *
 * Public keys are domain-restricted in the Retell dashboard.
 * Ensure austintxhvacrepair.com (and www) are on the allowlist for this public key.
 */
(function () {
  if (document.getElementById("retell-widget")) return;

  var s = document.createElement("script");
  s.id = "retell-widget";
  s.src = "https://dashboard.retellai.com/retell-widget-v2.js";
  s.type = "module";
  s.setAttribute("data-public-key", "public_key_63669e34a0a616e92b6f7");
  s.setAttribute("data-agent-id", "agent_85f1f490766e654610bb3aa60e");
  s.setAttribute("data-bot-name", "Austin HVAC Assistant");
  s.setAttribute("data-title", "Chat with Austin Tx HVAC");
  s.setAttribute("data-fab-text", "Chat with us");
  s.setAttribute(
    "data-popup-message",
    "Hi! Need AC or heating help in Greater Austin? Type a message anytime."
  );
  s.setAttribute("data-show-ai-popup", "true");
  s.setAttribute("data-show-ai-popup-time", "4");
  s.setAttribute("data-auto-open", "false");
  s.setAttribute("data-theme-color", "#1a3a52");
  s.setAttribute("data-component-color", "#f59e0b");
  document.head.appendChild(s);
})();
