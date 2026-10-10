/* Home: the colour wall in the hero. Picking a colour tints the whole hero. */
(function () {
  "use strict";
  const { $, $$, esc, waLink, products, colours, radioGroup } = window.AYCApp;
  const hero = $("#hero");
  const text = $("#hero-result-text");
  const shop = $("#hero-shop");
  const wall = $(".wall", hero);
  const shopUrl = $('.nav a[href*="shop"]').getAttribute("href");

  // WCAG relative luminance + contrast, used to choose readable text on any colour.
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const hex = (a) => "#" + a.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
  const contrast = (l1, l2) => (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  const INK = lum(42, 39, 36);

  function toneFor(h) {
    let c = rgb(h);
    let l = lum(...c);
    const cInk = contrast(l, INK), cWhite = contrast(l, 1);
    if (cInk >= 4.5 && cInk >= cWhite) return { tint: h, tone: "light" };
    // Mid-tones: darken until white text reads clearly.
    for (let k = 0; k < 12 && contrast(l, 1) < 4.5; k++) { c = c.map((v) => v * 0.92); l = lum(...c); }
    return { tint: hex(c), tone: "dark" };
  }

  function productsFor(key) {
    return Array.from(products.values()).filter((p) => p.colours.includes(key));
  }

  function select(el) {
    const key = el.dataset.key, name = el.dataset.name;
    const t = toneFor(el.dataset.hex);
    hero.style.setProperty("--tint", t.tint);
    hero.dataset.tone = t.tone;
    const list = productsFor(key);
    if (list.length) {
      const hijabs = list.filter((p) => p.category === "hijab").length;
      const abayas = list.filter((p) => p.category === "abaya").length;
      const parts = [];
      if (hijabs) parts.push(hijabs + (hijabs === 1 ? " hijab" : " hijabs"));
      if (abayas) parts.push(abayas + (abayas === 1 ? " abaya" : " abayas"));
      text.textContent = `${name}: ${parts.join(" and ")} online.`;
      shop.textContent = `Shop ${name.toLowerCase()}`;
      shop.href = `${shopUrl}?colour=${encodeURIComponent(key)}`;
      shop.removeAttribute("target"); shop.removeAttribute("rel");
    } else {
      text.textContent = `${name} is a colour we carry but it isn't listed online yet. Message us to ask what's in right now.`;
      shop.textContent = `Ask about ${name.toLowerCase()}`;
      shop.href = waLink(`Hello AYC London, do you have anything in ${name.toLowerCase()} at the moment?`);
      shop.target = "_blank"; shop.rel = "noopener";
    }
  }

  const group = radioGroup(wall, select);
  $$(".roll", wall).forEach((r, i) => r.style.setProperty("--i", i));

  // One orchestrated moment on load: the rolls arrive in sequence, then Sand is chosen.
  wall.classList.add("intro");
  const first = $('.roll[data-key="sand"]', wall) || $(".roll", wall);
  group.select(first, false);
})();
