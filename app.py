"""AYC London Boutique: Flask app.

Run:  python app.py            (development, http://127.0.0.1:5000)
Prod: gunicorn app:app

Environment variables:
  SECRET_KEY        random string used to sign admin sessions
  ADMIN_PASSWORD    password for /admin (admin is disabled if this is empty)
  DATABASE_PATH     SQLite file (default: ayc.db next to this file)
"""
import hmac
import json
import os
import re
import secrets
import sqlite3
import time
from collections import defaultdict, deque
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

from flask import (Flask, abort, flash, g, jsonify, redirect, render_template,
                   request, session, url_for, Response)

BASE = Path(__file__).parent
DB_PATH = os.environ.get("DATABASE_PATH", str(BASE / "ayc.db"))

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY") or secrets.token_hex(32)
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    MAX_CONTENT_LENGTH=64 * 1024,
)


# --------------------------------------------------------------------------
# Data
# --------------------------------------------------------------------------
def load_json(name):
    with open(BASE / "data" / name, encoding="utf-8") as f:
        return json.load(f)


def get_site():
    return load_json("site.json")


def get_products():
    return load_json("products.json")["products"]


def product_map():
    return {p["id"]: p for p in get_products()}


def db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ref TEXT UNIQUE NOT NULL,
            created_at TEXT NOT NULL,
            name TEXT NOT NULL,
            phone TEXT NOT NULL,
            email TEXT,
            method TEXT NOT NULL,
            address TEXT,
            notes TEXT,
            items_json TEXT NOT NULL,
            total REAL NOT NULL,
            status TEXT NOT NULL DEFAULT 'new'
        );
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL,
            name TEXT NOT NULL,
            contact TEXT NOT NULL,
            message TEXT NOT NULL,
            handled INTEGER NOT NULL DEFAULT 0
        );
        """
    )
    conn.commit()
    conn.close()


init_db()


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------
_hits = defaultdict(deque)


def rate_limited(key, limit=8, window=600):
    """Very small in-memory limiter. Use a proper one behind several workers."""
    now = time.time()
    q = _hits[key]
    while q and now - q[0] > window:
        q.popleft()
    if len(q) >= limit:
        return True
    q.append(now)
    return False


def clean(value, maxlen):
    return re.sub(r"\s+", " ", str(value or "")).strip()[:maxlen]


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def make_ref():
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "AYC-" + "".join(secrets.choice(alphabet) for _ in range(5))


STATIC_MODE = False  # set to True by freeze.py when exporting the static preview


@app.context_processor
def inject_globals():
    site = get_site()
    return {
        "site": site,
        "year": datetime.now().year,
        "products_json": json.dumps(get_products()).replace("</", "<\\/"),
        "colours_json": json.dumps(site["colours"]).replace("</", "<\\/"),
        "static_mode": STATIC_MODE,
    }


@app.template_filter("money")
def money(value):
    return f"£{value:,.2f}"


# --------------------------------------------------------------------------
# Pages
# --------------------------------------------------------------------------
@app.route("/")
def home():
    products = get_products()
    return render_template("index.html", products=products, featured=products[:4],
                           page="home")


@app.route("/shop")
def shop():
    return render_template("shop.html", products=get_products(), page="shop")


@app.route("/visit")
def visit():
    return render_template("visit.html", page="visit")


@app.route("/robots.txt")
def robots():
    body = f"User-agent: *\nDisallow: /admin\nSitemap: {request.url_root}sitemap.xml\n"
    return Response(body, mimetype="text/plain")


@app.route("/sitemap.xml")
def sitemap():
    urls = [url_for(n, _external=True) for n in ("home", "shop", "visit")]
    xml = ['<?xml version="1.0" encoding="UTF-8"?>',
           '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    xml += [f"<url><loc>{u}</loc></url>" for u in urls]
    xml.append("</urlset>")
    return Response("\n".join(xml), mimetype="application/xml")


@app.errorhandler(404)
def not_found(_e):
    return render_template("404.html", page="404"), 404


# --------------------------------------------------------------------------
# API
# --------------------------------------------------------------------------
@app.get("/api/products")
def api_products():
    return jsonify(get_products())


@app.post("/api/orders")
def api_orders():
    if rate_limited("order:" + (request.remote_addr or "?")):
        return jsonify(error="Too many requests. Please try again in a few minutes."), 429
    data = request.get_json(silent=True) or {}
    if data.get("website"):  # honeypot, real people leave it empty
        return jsonify(ok=True, ref="AYC-00000"), 200

    name = clean(data.get("name"), 80)
    phone = clean(data.get("phone"), 30)
    email = clean(data.get("email"), 120)
    method = clean(data.get("method"), 20)
    address = clean(data.get("address"), 240)
    notes = clean(data.get("notes"), 500)

    errors = {}
    if len(name) < 2:
        errors["name"] = "Enter your name."
    if len(re.sub(r"\D", "", phone)) < 9:
        errors["phone"] = "Enter a phone number we can reach you on."
    if email and not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        errors["email"] = "That email address does not look right."
    if method not in ("pickup", "kerbside", "delivery"):
        errors["method"] = "Choose how you want to get your order."
    if method == "delivery" and len(address) < 8:
        errors["address"] = "Enter your delivery address and postcode."

    products = product_map()
    items, total = [], 0.0
    for raw in (data.get("items") or [])[:30]:
        p = products.get(raw.get("id"))
        if not p or not p.get("in_stock", True):
            continue
        qty = max(1, min(int(raw.get("qty") or 1), 20))
        colour = raw.get("colour") if raw.get("colour") in p["colours"] else (p["colours"][0] if p["colours"] else "")
        size = raw.get("size") if raw.get("size") in p["sizes"] else ""
        line = round(p["price"] * qty, 2)
        total += line
        items.append({"id": p["id"], "name": p["name"], "colour": colour,
                      "size": size, "qty": qty, "line_total": line})
    if not items:
        errors["items"] = "Your bag is empty."
    if errors:
        return jsonify(errors=errors), 400

    conn = db()
    for _ in range(5):
        ref = make_ref()
        try:
            conn.execute(
                "INSERT INTO orders (ref, created_at, name, phone, email, method, address,"
                " notes, items_json, total) VALUES (?,?,?,?,?,?,?,?,?,?)",
                (ref, now_iso(), name, phone, email, method, address, notes,
                 json.dumps(items), round(total, 2)))
            conn.commit()
            break
        except sqlite3.IntegrityError:
            continue
    else:
        return jsonify(error="Could not save your order. Please call us."), 500

    site = get_site()
    lines = [f"Hello AYC London, my order {ref}:"]
    lines += [f"- {i['qty']} x {i['name']}" + (f" ({i['colour']})" if i["colour"] else "")
              + (f", size {i['size']}" if i["size"] else "") for i in items]
    lines.append(f"Total {money(total)}. Name: {name}. Method: {method}.")
    wa = f"https://wa.me/{site['whatsapp_number']}?text={quote(chr(10).join(lines))}"
    return jsonify(ok=True, ref=ref, total=round(total, 2), whatsapp=wa), 201


@app.post("/api/contact")
def api_contact():
    if rate_limited("contact:" + (request.remote_addr or "?")):
        return jsonify(error="Too many messages. Please try again in a few minutes."), 429
    data = request.get_json(silent=True) or {}
    if data.get("website"):
        return jsonify(ok=True), 200
    name = clean(data.get("name"), 80)
    contact = clean(data.get("contact"), 120)
    message = clean(data.get("message"), 1000)
    errors = {}
    if len(name) < 2:
        errors["name"] = "Enter your name."
    if len(contact) < 5:
        errors["contact"] = "Enter a phone number or email so we can reply."
    if len(message) < 5:
        errors["message"] = "Write a short message."
    if errors:
        return jsonify(errors=errors), 400
    conn = db()
    conn.execute("INSERT INTO messages (created_at, name, contact, message) VALUES (?,?,?,?)",
                 (now_iso(), name, contact, message))
    conn.commit()
    return jsonify(ok=True), 201


# --------------------------------------------------------------------------
# Admin (simple password gate, enabled by ADMIN_PASSWORD)
# --------------------------------------------------------------------------
def admin_enabled():
    return bool(os.environ.get("ADMIN_PASSWORD"))


def require_admin():
    if not admin_enabled():
        abort(404)
    if not session.get("admin"):
        return redirect(url_for("admin_login"))
    return None


def csrf_token():
    if "csrf" not in session:
        session["csrf"] = secrets.token_hex(16)
    return session["csrf"]


app.jinja_env.globals["csrf_token"] = csrf_token


@app.route("/admin/login", methods=["GET", "POST"])
def admin_login():
    if not admin_enabled():
        abort(404)
    if request.method == "POST":
        if rate_limited("login:" + (request.remote_addr or "?"), limit=6, window=900):
            flash("Too many attempts. Wait a few minutes.")
        elif hmac.compare_digest(request.form.get("password", ""),
                                 os.environ["ADMIN_PASSWORD"]):
            session["admin"] = True
            return redirect(url_for("admin"))
        else:
            flash("That password is not right.")
    return render_template("admin_login.html", page="admin")


@app.route("/admin")
def admin():
    gate = require_admin()
    if gate:
        return gate
    conn = db()
    orders = [dict(r, items=json.loads(r["items_json"]))
              for r in conn.execute("SELECT * FROM orders ORDER BY id DESC LIMIT 200")]
    messages = conn.execute("SELECT * FROM messages ORDER BY id DESC LIMIT 200").fetchall()
    return render_template("admin.html", orders=orders, messages=messages, page="admin")


@app.post("/admin/orders/<int:order_id>/status")
def admin_order_status(order_id):
    gate = require_admin()
    if gate:
        return gate
    if not hmac.compare_digest(request.form.get("csrf", ""), csrf_token()):
        abort(400)
    status = request.form.get("status")
    if status in ("new", "confirmed", "ready", "completed", "cancelled"):
        conn = db()
        conn.execute("UPDATE orders SET status=? WHERE id=?", (status, order_id))
        conn.commit()
    return redirect(url_for("admin"))


@app.post("/admin/messages/<int:msg_id>/handled")
def admin_message_handled(msg_id):
    gate = require_admin()
    if gate:
        return gate
    if not hmac.compare_digest(request.form.get("csrf", ""), csrf_token()):
        abort(400)
    conn = db()
    conn.execute("UPDATE messages SET handled=1-handled WHERE id=?", (msg_id,))
    conn.commit()
    return redirect(url_for("admin"))


@app.post("/admin/logout")
def admin_logout():
    session.clear()
    return redirect(url_for("home"))


@app.after_request
def security_headers(resp):
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    resp.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
    return resp


if __name__ == "__main__":
    app.run(debug=os.environ.get("FLASK_DEBUG") == "1", port=int(os.environ.get("PORT", 5000)))
