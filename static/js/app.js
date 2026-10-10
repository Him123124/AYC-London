/* AYC London Boutique: shared behaviour (bag, quick view, checkout, lightbox, menu). */
(function () {
  "use strict";

  const D = window.AYC;
  const products = new Map(D.products.map((p) => [p.id, p]));
  const colours = new Map(D.colours.map((c) => [c.key, c]));
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const money = (n) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(n);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const colourName = (k) => (colours.get(k) ? colours.get(k).name : k);
  const waLink = (text) => `https://wa.me/${D.whatsapp}?text=${encodeURIComponent(text)}`;
  const imgUrl = (file) => D.imgBase + file;

  /* ---------- toast ---------- */
  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
  }

  /* ---------- roving radio group (arrow keys) ---------- */
  function radioGroup(container, onChange) {
    const items = () => $$('[role="radio"]', container);
    function select(el, focus) {
      items().forEach((b) => {
        const on = b === el;
        b.setAttribute("aria-checked", on ? "true" : "false");
        b.tabIndex = on ? 0 : -1;
      });
      if (focus) el.focus();
      onChange && onChange(el);
    }
    container.addEventListener("click", (e) => {
      const b = e.target.closest('[role="radio"]');
      if (b && container.contains(b)) select(b, false);
    });
    container.addEventListener("keydown", (e) => {
      const list = items();
      const i = list.indexOf(document.activeElement);
      if (i < 0) return;
      let n = null;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") n = list[(i + 1) % list.length];
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") n = list[(i - 1 + list.length) % list.length];
      if (n) { e.preventDefault(); select(n, true); }
    });
    const checked = items().find((b) => b.getAttribute("aria-checked") === "true") || items()[0];
    if (checked) items().forEach((b) => (b.tabIndex = b === checked ? 0 : -1));
    return { select, items };
  }

  /* ---------- bag (kept in localStorage, wrapped in try/catch) ---------- */
  const KEY = "ayc-bag-v1";
  let bag = [];
  try { bag = JSON.parse(localStorage.getItem(KEY) || "[]").filter((l) => products.has(l.id)); } catch (_) { bag = []; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(bag)); } catch (_) { /* private mode */ } };
  const count = () => bag.reduce((n, l) => n + l.qty, 0);
  const subtotal = () => bag.reduce((s, l) => s + products.get(l.id).price * l.qty, 0);

  function refreshCount() {
    $$("[data-bag-count]").forEach((el) => { el.textContent = count(); el.dataset.n = count(); });
  }

  function addToBag(id, colour, size, qty) {
    const hit = bag.find((l) => l.id === id && l.colour === colour && l.size === size);
    if (hit) hit.qty = Math.min(20, hit.qty + qty);
    else bag.push({ id, colour, size, qty });
    save(); refreshCount();
  }

  /* ---------- dialogs ---------- */
  function wireDialog(dlg) {
    dlg.addEventListener("click", (e) => {
      if (e.target === dlg || e.target.closest("[data-close]")) dlg.close();
    });
  }
  ["pview", "bag", "lightbox"].forEach((id) => wireDialog($("#" + id)));

  /* ---------- product quick view ---------- */
  const pv = {
    dlg: $("#pview"), img: $("#pv-img"), name: $("#pv-name"), price: $("#pv-price"), desc: $("#pv-desc"),
    colourBox: $("#pv-colours"), sizeBox: $("#pv-sizes"), qty: $("#pv-qty"), add: $("#pv-add"), ask: $("#pv-ask"),
    colourName: $("#pv-colour-name"),
    state: { id: null, colour: "", size: "", qty: 1 },
  };
  let colourGroup, sizeGroup;

  function openProduct(id) {
    const p = products.get(id);
    if (!p) return;
    const s = pv.state;
    s.id = id; s.qty = 1;
    s.colour = p.colours[0] || "";
    s.size = p.sizes.length ? p.sizes[0] : "";

    pv.img.src = imgUrl(p.image);
    pv.img.alt = p.alt;
    pv.name.textContent = p.name;
    pv.price.textContent = (p.category === "hijab" ? "From " : "") + money(p.price);
    pv.desc.textContent = p.description;
    pv.qty.textContent = "1";

    const swBox = $(".swatches", pv.colourBox);
    swBox.innerHTML = p.colours.map((k, i) =>
      `<button type="button" class="sw" role="radio" aria-checked="${i === 0}" aria-label="${esc(colourName(k))}" data-key="${esc(k)}" title="${esc(colourName(k))}" style="--c:${colours.get(k) ? colours.get(k).hex : "#999"}"></button>`).join("");
    pv.colourBox.hidden = !p.colours.length;
    pv.colourName.textContent = colourName(s.colour);
    colourGroup = radioGroup(swBox, (el) => { s.colour = el.dataset.key; pv.colourName.textContent = colourName(s.colour); });

    const pillBox = $(".pills", pv.sizeBox);
    pillBox.innerHTML = p.sizes.map((z, i) =>
      `<button type="button" class="pill" role="radio" aria-checked="${i === 0}" data-size="${esc(z)}">${esc(z)}</button>`).join("");
    pv.sizeBox.hidden = !p.sizes.length;
    sizeGroup = radioGroup(pillBox, (el) => { s.size = el.dataset.size; });

    pv.add.disabled = !p.in_stock;
    pv.add.textContent = p.in_stock ? "Add to bag" : "Sold out";
    pv.ask.href = waLink(`Hello AYC London, I'd like to ask about the ${p.name}.`);
    pv.dlg.showModal();
  }

  pv.dlg.addEventListener("click", (e) => {
    const q = e.target.closest("[data-qty]");
    if (q) {
      pv.state.qty = Math.max(1, Math.min(20, pv.state.qty + Number(q.dataset.qty)));
      pv.qty.textContent = pv.state.qty;
    }
  });
  pv.add.addEventListener("click", () => {
    const s = pv.state;
    addToBag(s.id, s.colour, s.size, s.qty);
    pv.dlg.close();
    toast(`Added to your bag: ${products.get(s.id).name}`);
  });

  document.addEventListener("click", (e) => {
    const v = e.target.closest("[data-view]");
    if (v) openProduct(v.dataset.view);
    const o = e.target.closest("[data-open-bag]");
    if (o) openBag();
    const lb = e.target.closest("[data-lightbox]");
    if (lb) {
      $("#lb-img").src = imgUrl(lb.dataset.lightbox);
      $("#lb-img").alt = lb.dataset.cap || "";
      $("#lb-cap").textContent = lb.dataset.cap || "";
      $("#lightbox").showModal();
    }
  });

  /* ---------- bag drawer ---------- */
  const bagDlg = $("#bag");
  const bagBody = $("#bag-body");
  let view = "bag";

  function openBag() { view = "bag"; renderBag(); if (!bagDlg.open) bagDlg.showModal(); }

  function renderBag() {
    if (view === "details") return renderDetails();
    if (!bag.length) {
      const shopHref = ($('.nav a[href*="shop"]') || { getAttribute: () => "/shop" }).getAttribute("href");
      bagBody.innerHTML = `<div class="bag-empty"><p>Your bag is empty.</p><a class="btn" href="${esc(shopHref)}">Browse the shop</a></div>`;
      return;
    }
    bagBody.innerHTML = bag.map((l, i) => {
      const p = products.get(l.id);
      const sub = [l.colour ? colourName(l.colour) : "", l.size ? "Size " + l.size : ""].filter(Boolean).join(", ");
      return `<div class="line-item">
        <img src="${imgUrl(p.image)}" alt="" width="72" height="90">
        <div>
          <p class="line-name">${esc(p.name)}</p>
          <p class="line-sub">${esc(sub)}</p>
          <div class="line-row">
            <div class="qty qty-sm" role="group" aria-label="Quantity for ${esc(p.name)}">
              <button type="button" data-line="${i}" data-d="-1" aria-label="Fewer">&minus;</button>
              <output>${l.qty}</output>
              <button type="button" data-line="${i}" data-d="1" aria-label="More">+</button>
            </div>
            <span>${money(p.price * l.qty)}</span>
          </div>
          <button type="button" class="linklike" data-remove="${i}">Remove</button>
        </div>
      </div>`;
    }).join("") + `
      <div class="subtotal"><span>Subtotal</span><span>${money(subtotal())}</span></div>
      <p class="note">${esc(D.orderNote)}</p>
      <button class="btn" type="button" id="to-details" style="width:100%">Reserve my order</button>`;
  }

  bagBody.addEventListener("click", (e) => {
    const d = e.target.closest("[data-d]");
    if (d) {
      const l = bag[Number(d.dataset.line)];
      l.qty = Math.max(1, Math.min(20, l.qty + Number(d.dataset.d)));
      save(); refreshCount(); renderBag();
      const again = $(`[data-line="${d.dataset.line}"][data-d="${d.dataset.d}"]`, bagBody);
      if (again) again.focus();
      return;
    }
    const r = e.target.closest("[data-remove]");
    if (r) { bag.splice(Number(r.dataset.remove), 1); save(); refreshCount(); renderBag(); return; }
    if (e.target.closest("#to-details")) { view = "details"; renderBag(); bagBody.scrollTop = 0; }
    if (e.target.closest("#back-to-bag")) { view = "bag"; renderBag(); }
  });

  function renderDetails() {
    bagBody.innerHTML = `
      <button class="linklike back" type="button" id="back-to-bag">&larr; Back to bag</button>
      <form class="form" id="order-form" novalidate>
        <div class="hp" aria-hidden="true"><label>Website <input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>
        <div class="field"><label for="o-name">Your name</label><input id="o-name" name="name" autocomplete="name" required><p class="err" data-err="name"></p></div>
        <div class="field"><label for="o-phone">Phone number</label><input id="o-phone" name="phone" type="tel" autocomplete="tel" required><p class="err" data-err="phone"></p></div>
        <div class="field"><label for="o-email">Email <span class="hint">(optional)</span></label><input id="o-email" name="email" type="email" autocomplete="email"><p class="err" data-err="email"></p></div>
        <div class="field">
          <fieldset><legend>How do you want your order?</legend>
            <div class="radio-list">
              <label class="radio"><input type="radio" name="method" value="pickup" checked><span><strong>Collect in store</strong><span>114 High Rd, Leyton</span></span></label>
              <label class="radio"><input type="radio" name="method" value="kerbside"><span><strong>Kerbside pickup</strong><span>We bring it out to your car</span></span></label>
              <label class="radio"><input type="radio" name="method" value="delivery"><span><strong>Delivery</strong><span>We confirm the cost with you first</span></span></label>
            </div>
          </fieldset>
          <p class="err" data-err="method"></p>
        </div>
        <div class="field" id="addr-field" hidden><label for="o-addr">Delivery address and postcode</label><textarea id="o-addr" name="address" rows="3" autocomplete="street-address"></textarea><p class="err" data-err="address"></p></div>
        <div class="field"><label for="o-notes">Notes <span class="hint">(optional)</span></label><textarea id="o-notes" name="notes" rows="2"></textarea></div>
        <div class="subtotal"><span>Subtotal</span><span>${money(subtotal())}</span></div>
        <p class="note">${esc(D.orderNote)}</p>
        <button class="btn" type="submit" id="o-submit">Send my reservation</button>
        <p class="form-status" id="o-status" role="status" aria-live="polite"></p>
      </form>`;
    const form = $("#order-form");
    form.addEventListener("change", () => {
      $("#addr-field").hidden = form.method.value !== "delivery";
    });
    form.addEventListener("submit", submitOrder);
  }

  function showErrors(form, errors) {
    $$("[data-err]", form).forEach((el) => {
      const msg = errors[el.dataset.err] || "";
      el.textContent = msg;
      const input = form.elements[el.dataset.err];
      if (input && input.setAttribute) input.setAttribute("aria-invalid", msg ? "true" : "false");
    });
    const first = $("[aria-invalid='true']", form);
    if (first) first.focus();
  }

  function fallbackMessage(payload, ref) {
    const lines = [`Hello AYC London, my order ${ref}:`];
    payload.items.forEach((i) => {
      const p = products.get(i.id);
      lines.push(`- ${i.qty} x ${p.name}${i.colour ? " (" + colourName(i.colour) + ")" : ""}${i.size ? ", size " + i.size : ""}`);
    });
    lines.push(`Total ${money(subtotal())}. Name: ${payload.name}. Method: ${payload.method}.`);
    return lines.join("\n");
  }

  async function submitOrder(e) {
    e.preventDefault();
    const form = e.target;
    const status = $("#o-status");
    const btn = $("#o-submit");
    const fd = new FormData(form);
    const payload = {
      name: fd.get("name"), phone: fd.get("phone"), email: fd.get("email"), method: fd.get("method"),
      address: fd.get("address"), notes: fd.get("notes"), website: fd.get("website"),
      items: bag.map((l) => ({ id: l.id, colour: l.colour, size: l.size, qty: l.qty })),
    };
    const errors = {};
    if (String(payload.name).trim().length < 2) errors.name = "Enter your name.";
    if (String(payload.phone).replace(/\D/g, "").length < 9) errors.phone = "Enter a phone number we can reach you on.";
    if (payload.method === "delivery" && String(payload.address).trim().length < 8) errors.address = "Enter your delivery address and postcode.";
    if (Object.keys(errors).length) { showErrors(form, errors); return; }
    showErrors(form, {});

    btn.disabled = true; status.className = "form-status"; status.textContent = "Sending...";
    let result = null;
    if (!D.staticMode) {
      try {
        const res = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        if (res.status === 400) { const j = await res.json(); showErrors(form, j.errors || {}); btn.disabled = false; status.textContent = ""; return; }
        if (res.ok) result = await res.json();
        else if (res.status === 429) { status.className = "form-status bad"; status.textContent = "Too many requests. Please wait a few minutes or call us."; btn.disabled = false; return; }
      } catch (_) { result = null; }
    }
    if (!result) {
      // No server (static preview) or it was unreachable: finish the order on WhatsApp instead.
      const ref = "AYC-" + Math.random().toString(36).slice(2, 7).toUpperCase();
      result = { ref, total: subtotal(), whatsapp: waLink(fallbackMessage(payload, ref)), viaWhatsApp: true };
    }
    bag = []; save(); refreshCount();
    renderDone(result);
  }

  function renderDone(r) {
    bagBody.innerHTML = `<div class="done-box">
      <h3>${r.viaWhatsApp ? "One more step" : "Order reserved"}</h3>
      <p class="ref">${esc(r.ref)}</p>
      <p>${r.viaWhatsApp
        ? "Send your order to us on WhatsApp to finish. Your bag is saved in the message."
        : "Thank you. We will message or call you to confirm stock and the total."}</p>
      <p class="small muted" style="margin:.75rem 0 1.25rem">Total ${money(r.total)}. ${esc(D.orderNote)}</p>
      <div class="stack">
        <a class="btn" href="${esc(r.whatsapp)}" target="_blank" rel="noopener">${r.viaWhatsApp ? "Send on WhatsApp" : "Also message us on WhatsApp"}</a>
        <button class="btn btn-line" type="button" data-close>Keep browsing</button>
      </div></div>`;
  }

  /* ---------- mobile menu ---------- */
  const menuBtn = $(".menu-btn");
  const nav = $("#nav");
  menuBtn.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    menuBtn.setAttribute("aria-expanded", String(open));
  });

  refreshCount();
  window.AYCApp = { openProduct, openBag, toast, money, esc, colourName, waLink, products, colours, radioGroup, $, $$ };
})();
