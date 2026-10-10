/* Visit page: contact form. */
(function () {
  "use strict";
  const { $, $$, waLink } = window.AYCApp;
  const form = $("#contact-form");
  const status = $("#contact-status");

  function showErrors(errors) {
    $$("[data-err]", form).forEach((el) => {
      const msg = errors[el.dataset.err] || "";
      el.textContent = msg;
      const input = form.elements[el.dataset.err];
      if (input) input.setAttribute("aria-invalid", msg ? "true" : "false");
    });
    const first = $("[aria-invalid='true']", form);
    if (first) first.focus();
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const errors = {};
    if (data.name.trim().length < 2) errors.name = "Enter your name.";
    if (data.contact.trim().length < 5) errors.contact = "Enter a phone number or email so we can reply.";
    if (data.message.trim().length < 5) errors.message = "Write a short message.";
    showErrors(errors);
    if (Object.keys(errors).length) return;

    status.className = "form-status"; status.textContent = "Sending...";
    const btn = $("button[type=submit]", form); btn.disabled = true;
    try {
      if (window.AYC.staticMode) throw new Error("static");
      const res = await fetch("/api/contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (res.status === 400) { showErrors((await res.json()).errors || {}); status.textContent = ""; btn.disabled = false; return; }
      if (!res.ok) throw new Error("server");
      form.reset();
      status.className = "form-status ok";
      status.textContent = "Message sent. We will reply as soon as we can.";
    } catch (_) {
      status.className = "form-status bad";
      status.innerHTML = "";
      const a = document.createElement("a");
      a.href = waLink(`Hello AYC London, it's ${data.name}. ${data.message}`);
      a.target = "_blank"; a.rel = "noopener";
      a.textContent = "Send it on WhatsApp instead";
      status.append("We could not send that from this page. ", a, ".");
    }
    btn.disabled = false;
  });
})();
