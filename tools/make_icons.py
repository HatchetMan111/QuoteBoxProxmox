"""Erzeugt die PWA-Icons (PNG) fuer QuoteBox - einmalig, keine Runtime-Abhaengigkeit."""
from PIL import Image, ImageDraw, ImageFont

GOLD = (176, 141, 87, 255)      # #b08d57
PANEL = (30, 27, 23, 255)       # #1e1b17
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"

def render(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (20, 18, 15, 255))  # #14120f
    d = ImageDraw.Draw(img)
    # abgerundete Panel-Flaeche
    pad = int(size * 0.06)
    radius = int(size * 0.14)
    d.rounded_rectangle([pad, pad, size - pad, size - pad], radius=radius, fill=PANEL)
    # feine goldene Innenlinie
    inset = int(size * 0.11)
    d.rounded_rectangle(
        [inset, inset, size - inset, size - inset],
        radius=int(radius * 0.8),
        outline=GOLD,
        width=max(1, int(size * 0.012)),
    )
    # Anfuehrungszeichen als Zitat-Symbol
    try:
        font = ImageFont.truetype(FONT, int(size * 0.52))
        d.text((size / 2, size / 2 - size * 0.04), "\u201C", font=font, fill=GOLD, anchor="mm")
    except OSError:
        # Fallback: zwei goldene Punkte
        r = size * 0.08
        for cx in (size * 0.38, size * 0.62):
            d.ellipse([cx - r, size * 0.42 - r, cx + r, size * 0.42 + r], fill=GOLD)
    return img

for out, size in [
    ("app/static/pwa-icon-512.png", 512),
    ("app/static/pwa-icon-192.png", 192),
    ("app/static/apple-touch-icon.png", 180),
]:
    render(size).save(out, "PNG")
    print("geschrieben:", out, size)
