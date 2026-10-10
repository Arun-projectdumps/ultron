"""Generates public/theme/nocturne/background.svg: a rainy night skyline placeholder.
Rasterize with scripts/make-placeholder-bg.sh (uses macOS qlmanage + sips)."""
import random, sys

random.seed(7)
W, H = 2560, 1440
out = []
a = out.append
a(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">')
a('''<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b0c10"/><stop offset="0.55" stop-color="#1c1e26"/><stop offset="1" stop-color="#2b2a30"/></linearGradient>
<radialGradient id="glow" cx="0.5" cy="1" r="0.8"><stop offset="0" stop-color="#5a3a40" stop-opacity="0.55"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
<radialGradient id="moon" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#e8e8ee" stop-opacity="0.8"/><stop offset="0.25" stop-color="#9a9ba3" stop-opacity="0.25"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
<linearGradient id="fog" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a3a42" stop-opacity="0"/><stop offset="1" stop-color="#3a3a42" stop-opacity="0.65"/></linearGradient>
</defs>''')
a(f'<rect width="{W}" height="{H}" fill="url(#sky)"/>')
a(f'<rect width="{W}" height="{H}" fill="url(#glow)"/>')
a('<circle cx="1880" cy="300" r="260" fill="url(#moon)"/>')

def layer(base_y, hmin, hmax, wmin, wmax, color, win_p, win_color):
    x = -40
    while x < W:
        w = random.randint(wmin, wmax)
        h = random.randint(hmin, hmax)
        y = base_y - h
        a(f'<rect x="{x}" y="{y}" width="{w}" height="{H - y}" fill="{color}"/>')
        if random.random() < 0.25:  # spire / antenna
            sw = max(4, w // 10)
            a(f'<rect x="{x + w//2 - sw//2}" y="{y - h//4}" width="{sw}" height="{h//4}" fill="{color}"/>')
        if random.random() < 0.3:  # stepped top
            a(f'<rect x="{x + w//6}" y="{y - 40}" width="{w*2//3}" height="40" fill="{color}"/>')
        for wy in range(y + 18, H - 40, 26):
            for wx in range(x + 10, x + w - 14, 18):
                if random.random() < win_p:
                    a(f'<rect x="{wx}" y="{wy}" width="7" height="11" fill="{win_color}" opacity="{random.uniform(0.25, 0.9):.2f}"/>')
        x += w + random.randint(0, 30)

layer(1180, 250, 620, 90, 220, '#15161b', 0.05, '#8a8f9c')
a(f'<rect y="500" width="{W}" height="{H-500}" fill="url(#fog)"/>')
layer(1320, 180, 520, 120, 260, '#0d0e12', 0.09, '#c9b9a0')
layer(1440, 120, 320, 160, 320, '#060608', 0.12, '#e0c89a')
a(f'<rect y="900" width="{W}" height="{H-900}" fill="url(#fog)" opacity="0.5"/>')

# Warm city lights: these survive the "keep reds" grayscale, so the placeholder shows the effect.
a('<defs><filter id="bloom" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter></defs>')
for _ in range(14):  # red aircraft beacons on rooftops
    x, y = random.uniform(80, W - 80), random.uniform(560, 1000)
    a(f'<circle cx="{x:.0f}" cy="{y:.0f}" r="14" fill="#ff2a2a" opacity="0.55" filter="url(#bloom)"/><circle cx="{x:.0f}" cy="{y:.0f}" r="3.5" fill="#ff5a4a"/>')
for _ in range(9):  # neon signs: vertical red/orange bars
    x, y = random.uniform(100, W - 100), random.uniform(820, 1160)
    h = random.uniform(70, 180); col = random.choice(['#ff2040', '#ff5a1f', '#ff3020', '#ff7a1a'])
    a(f'<rect x="{x:.0f}" y="{y:.0f}" width="16" height="{h:.0f}" fill="{col}" opacity="0.6" filter="url(#bloom)"/><rect x="{x+4:.0f}" y="{y+4:.0f}" width="8" height="{h-8:.0f}" fill="{col}"/>')
for i in range(26):  # sodium streetlights along the street
    x = 40 + i * 100 + random.uniform(-20, 20)
    a(f'<circle cx="{x:.0f}" cy="1330" r="22" fill="#ff8a2a" opacity="0.35" filter="url(#bloom)"/><circle cx="{x:.0f}" cy="1330" r="4" fill="#ffb15a"/>')
for _ in range(10):  # tail-light streaks
    x, y = random.uniform(0, W - 400), random.uniform(1370, 1420)
    w = random.uniform(150, 420)
    a(f'<rect x="{x:.0f}" y="{y:.0f}" width="{w:.0f}" height="3" rx="1.5" fill="#ff2a2a" opacity="0.75" filter="url(#bloom)"/><rect x="{x:.0f}" y="{y:.0f}" width="{w:.0f}" height="1.5" fill="#ff4a3a"/>')

# rain
a('<g stroke="#c9cbd4" stroke-linecap="round">')
for _ in range(1400):
    x, y = random.uniform(-200, W), random.uniform(-100, H)
    l = random.uniform(30, 90)
    a(f'<line x1="{x:.0f}" y1="{y:.0f}" x2="{x + l*0.18:.0f}" y2="{y + l:.0f}" stroke-width="{random.uniform(0.6, 1.6):.1f}" opacity="{random.uniform(0.05, 0.28):.2f}"/>')
a('</g></svg>')
sys.stdout.write('\n'.join(out))
