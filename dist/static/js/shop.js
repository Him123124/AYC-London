/* Shop: filter by type, colour and search text; sort; deep links like /shop?colour=olive */
(function () {
  "use strict";
  const { $, $$, esc, waLink, colourName } = window.AYCApp;
  const grid = $("#grid");
  const cards = $$(".card", grid);
  const status = $("#f-status");
  const empty = $("#empty");
  const state = { type: "all", colour: "all", sort: "featured", q: "" };
  const original = cards.slice();

  const params = new URLSearchParams(location.search);
  if (["abaya", "hijab"].includes(params.get("type"))) state.type = params.get("type");
  if (params.get("colour")) state.colour = params.get("colour");

  function sync(group, attr, value) {
    $$("button", group).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset[attr] === value)));
  }

  function apply() {
    sync($(".seg"), "type", state.type);
    sync($(".f-colours"), "colour", state.colour);
    const q = state.q.trim().toLowerCase();
    let shown = original.filter((c) => {
      if (state.type !== "all" && c.dataset.category !== state.type) return false;
      if (state.colour !== "all" && !c.dataset.colours.split(" ").includes(state.colour)) return false;
      if (q && !(c.dataset.name.includes(q) || c.dataset.colours.includes(q) || c.dataset.category.includes(q))) return false;
      return true;
    });
    const num = (c) => parseFloat(c.dataset.price);
    if (state.sort === "low") shown = shown.slice().sort((a, b) => num(a) - num(b));
    if (state.sort === "high") shown = shown.slice().sort((a, b) => num(b) - num(a));
    if (state.sort === "name") shown = shown.slice().sort((a, b) => a.dataset.name.localeCompare(b.dataset.name));

    cards.forEach((c) => (c.hidden = true));
    shown.forEach((c) => { c.hidden = false; grid.appendChild(c); });
    status.textContent = shown.length ? `${shown.length} ${shown.length === 1 ? "item" : "items"}` : "";
    empty.hidden = shown.length > 0;
    if (!shown.length) {
      const name = state.colour !== "all" ? colourName(state.colour).toLowerCase() : "";
      $("#empty-title").textContent = name ? `Nothing in ${name} online yet` : "Nothing matches that yet";
      $("#empty-text").textContent = name
        ? "We may still have it on the shelves. Message us and we will tell you what's in."
        : "Try another colour or clear the filters.";
      $("#empty-wa").href = waLink(name ? `Hello AYC London, do you have anything in ${name} at the moment?` : "Hello AYC London, I'm looking for something I couldn't find on the website.");
    }
    const url = new URL(location.href);
    ["type", "colour"].forEach((k) => (state[k] !== "all" ? url.searchParams.set(k, state[k]) : url.searchParams.delete(k)));
    history.replaceState(null, "", url);
  }

  $(".seg").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { state.type = b.dataset.type; apply(); } });
  $(".f-colours").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (b) { state.colour = state.colour === b.dataset.colour ? "all" : b.dataset.colour; apply(); }
  });
  $("#sort").addEventListener("change", (e) => { state.sort = e.target.value; apply(); });
  $("#search").addEventListener("input", (e) => { state.q = e.target.value; apply(); });
  $("#clear").addEventListener("click", () => { Object.assign(state, { type: "all", colour: "all", q: "", sort: "featured" }); $("#search").value = ""; $("#sort").value = "featured"; apply(); });

  apply();
})();
