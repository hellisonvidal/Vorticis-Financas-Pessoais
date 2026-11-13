"""Gera o ícone do Finanças Pessoais (família Vorticis) e todas as variações usadas pelo app.

Variação do ícone do Vorticis Monitor (bloco arredondado em degradê + vórtice em faixas
que afinam para o centro), nas cores do Finanças Pessoais: bloco índigo→violeta e vórtice
branco/lilás centralizado, sem selo.

Uso (na raiz do projeto):  python3 -I assets/icone/gerar_icone.py   (requer Pillow)
Saídas: assets/icon.png, icon-only.png, icon-256.png, icon.ico, splash.png, splash-dark.png
        www/icons/icon-192.png, icon-512.png, maskable-512.png
"""
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

RAIZ = Path(__file__).resolve().parents[2]
SS = 4                                          # superamostragem (antisserrilhado)
TOPO, BASE = (49, 46, 129), (124, 58, 237)      # degradê do bloco: índigo-900 → violeta-600
LILAS, BRANCO = (196, 181, 253), (255, 255, 255)


def degrade(t: int) -> Image.Image:
    g = Image.new("RGBA", (t, t))
    px = g.load()
    for y in range(t):
        for x in range(t):
            k = (x + y) / (2 * t)
            px[x, y] = tuple(round(TOPO[i] + (BASE[i] - TOPO[i]) * k) for i in range(3)) + (255,)
    # brilho suave no canto superior esquerdo
    luz = Image.new("L", (t, t), 0)
    ImageDraw.Draw(luz).ellipse((-t * 0.35, -t * 0.45, t * 0.75, t * 0.55), fill=46)
    g.alpha_composite(Image.merge("RGBA", (*[Image.new("L", (t, t), 255)] * 3, luz.filter(ImageFilter.GaussianBlur(t * 0.12)))))
    return g


def bloco(t: int, arredondado: bool) -> Image.Image:
    g = degrade(t)
    if not arredondado:
        return g
    mask = Image.new("L", (t, t), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, t - 1, t - 1), radius=round(t * 0.22), fill=255)
    out = Image.new("RGBA", (t, t), (0, 0, 0, 0))
    out.paste(g, (0, 0), mask)
    return out


def vortice(t: int) -> Image.Image:
    """Vórtice de 6 braços em faixas contínuas que afinam para o centro (mesma construção do Vorticis Monitor)."""
    img = Image.new("RGBA", (t, t), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx, cy = t * 0.5, t * 0.5
    bracos, n = 6, 160
    for b in range(bracos):
        fase = 2 * math.pi * b / bracos + 0.35
        esq, dir_ = [], []
        for i in range(n):
            s = i / (n - 1)
            r = t * (0.04 + 0.36 * s)
            ang = fase + 1.55 * math.pi * s
            x, y = cx + r * math.cos(ang), cy + r * math.sin(ang)
            dr, da = t * 0.36, 1.55 * math.pi
            tx = dr * math.cos(ang) - r * da * math.sin(ang)
            ty = dr * math.sin(ang) + r * da * math.cos(ang)
            norma = math.hypot(tx, ty)
            nx, ny = -ty / norma, tx / norma
            meia = t * (0.004 + 0.034 * math.sin(math.pi * min(1, s * 1.15)) ** 0.8)
            esq.append((x + nx * meia, y + ny * meia))
            dir_.append((x - nx * meia, y - ny * meia))
        cor = BRANCO if b % 2 == 0 else LILAS
        d.polygon(esq + dir_[::-1], fill=cor + (255,))
    d.ellipse((cx - t * 0.05, cy - t * 0.05, cx + t * 0.05, cy + t * 0.05), fill=BRANCO + (255,))
    return img


def desenho(t: int) -> Image.Image:
    """Vórtice com sombra, sobre fundo transparente."""
    img = Image.new("RGBA", (t, t), (0, 0, 0, 0))
    v = vortice(t)
    sombra = Image.new("RGBA", (t, t), (0, 0, 0, 0))
    sombra.putalpha(v.getchannel("A").point(lambda a: a // 3))
    img.alpha_composite(sombra.filter(ImageFilter.GaussianBlur(t * 0.01)), (round(t * 0.008), round(t * 0.012)))
    img.alpha_composite(v)
    return img


def icone(lado: int, arredondado=True, escala=1.0) -> Image.Image:
    """arredondado=False + escala<1: versão sangrada para ícones adaptativos/maskable (desenho na área segura)."""
    t = lado * SS
    img = bloco(t, arredondado)
    d = desenho(t)
    if escala != 1.0:
        k = round(t * escala)
        d = d.resize((k, k), Image.LANCZOS)
        img.alpha_composite(d, ((t - k) // 2, (t - k) // 2))
    else:
        img.alpha_composite(d)
    return img.resize((lado, lado), Image.LANCZOS)


def splash(fundo, lado=2732, icone_lado=640) -> Image.Image:
    s = Image.new("RGBA", (lado, lado), fundo + (255,))
    ic = icone(icone_lado)
    s.alpha_composite(ic, ((lado - icone_lado) // 2, (lado - icone_lado) // 2))
    return s


if __name__ == "__main__":
    a, w = RAIZ / "assets", RAIZ / "www" / "icons"
    principal = icone(1024)
    principal.save(a / "icon.png")
    principal.resize((256, 256), Image.LANCZOS).save(a / "icon-256.png")
    principal.save(a / "icon.ico", sizes=[(16, 16), (20, 20), (24, 24), (32, 32), (40, 40), (48, 48), (64, 64), (128, 128), (256, 256)])
    icone(1024, arredondado=False, escala=0.70).save(a / "icon-only.png")      # Android (ícone adaptativo)
    splash((79, 70, 229)).save(a / "splash.png")
    splash((10, 14, 26)).save(a / "splash-dark.png")
    principal.resize((512, 512), Image.LANCZOS).save(w / "icon-512.png")
    principal.resize((192, 192), Image.LANCZOS).save(w / "icon-192.png")
    icone(512, arredondado=False, escala=0.78).save(w / "maskable-512.png")   # PWA (área segura de 80%)
    print("ícones gerados")
