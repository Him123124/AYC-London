# AYC London Boutique website

Hijabs and abayas, 114 High Rd, Leyton. Built with Python (Flask), HTML, CSS and JavaScript.

## See it right now (no install)
Open `dist/index.html` in your browser. This is the static copy: everything works, but the bag and contact form finish on WhatsApp because there is no server.

## Run the full site (orders and messages saved)
```
pip install -r requirements.txt
python app.py
```
Open http://127.0.0.1:5000

To see saved orders and messages, set a password before starting, then go to `/admin`:
- Mac/Linux: `ADMIN_PASSWORD=choose-a-password SECRET_KEY=any-long-random-text python app.py`
- Windows (PowerShell): `$env:ADMIN_PASSWORD="choose-a-password"; $env:SECRET_KEY="any-long-random-text"; python app.py`

Without `ADMIN_PASSWORD` the admin pages are switched off.

## Put it online
- **Flask hosting** (PythonAnywhere, Render, Railway, Fly): upload the folder, run `gunicorn app:app` (a `Procfile` is included) and set `SECRET_KEY` and `ADMIN_PASSWORD`. Set `DATABASE_PATH` to a persistent disk so orders survive restarts.
- **Any normal web host**: run `python freeze.py` and upload the `dist/` folder. WhatsApp handles orders and messages.

## Change the content (no code needed)
| File | What it controls |
| --- | --- |
| `data/products.json` | Products, prices, sizes, colours, descriptions, photos |
| `data/site.json` | Address, phone, WhatsApp number, Instagram, opening hours, colours on the wall, reviews, order note |
| `static/img/` | Photos (WebP, about 40 to 120 KB each) |

**Important:** the prices, sizes and product descriptions are placeholders. Replace them with your real ones before launch. After editing, restart the app (or run `python freeze.py` again).

To show opening hours on the Visit page, fill `"hours"` in `data/site.json`, for example `{"Monday to Saturday": "10am to 6pm", "Sunday": "Closed"}`.

To add a product: copy a block in `products.json`, give it a new `id`, put its photo in `static/img/`, and use colour keys from `site.json`.

## Files
```
app.py            Flask server, order and message API, admin
freeze.py         builds the static copy in dist/
templates/        HTML pages (Jinja)
static/css/       styles.css
static/js/        app.js (bag, quick view, checkout), home.js (colour wall), shop.js (filters), visit.js
data/             products.json, site.json
```

## What is built in
- Colour wall on the home page that tints the page and links to matching products
- Shop with type, colour, search and sort filters, and shareable links such as `/shop?colour=olive`
- Product quick view with colour, size and quantity, then a bag that is kept between visits
- Reserve flow: collect in store, kerbside pickup or delivery, saved to a database, with a WhatsApp confirmation
- Visit page with map, directions, call and WhatsApp buttons, and a contact form
- Admin page for orders (status updates) and messages
- Search engine data (LocalBusiness markup, sitemap, robots), keyboard and screen reader support, mobile layout, reduced motion support
