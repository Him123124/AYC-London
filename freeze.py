"""Export a static copy of the site into ./dist (open dist/index.html, or upload the folder to any web host).

    python freeze.py

The static copy has no server, so the bag and contact form finish on WhatsApp instead of saving to the database.
Use the Flask app (app.py) when you want orders and messages saved and shown in /admin.
"""
import re
import shutil
from pathlib import Path

import app as site_app

OUT = Path(__file__).parent / "dist"
PAGES = {"/": "index.html", "/shop": "shop.html", "/visit": "visit.html"}


def fix_links(html: str) -> str:
    html = html.replace('"/static/', '"static/')
    html = html.replace('href="/"', 'href="index.html"')
    html = re.sub(r'href="/shop', 'href="shop.html', html)
    html = re.sub(r'href="/visit', 'href="visit.html', html)
    return html


def main():
    site_app.STATIC_MODE = True
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir()
    shutil.copytree(Path(__file__).parent / "static", OUT / "static")
    client = site_app.app.test_client()
    for url, name in PAGES.items():
        res = client.get(url)
        assert res.status_code == 200, (url, res.status_code)
        (OUT / name).write_text(fix_links(res.get_data(as_text=True)), encoding="utf-8")
        print("wrote", OUT / name)


if __name__ == "__main__":
    main()
