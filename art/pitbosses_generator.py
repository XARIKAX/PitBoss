#!/usr/bin/env python3
"""PitBosses v2 — CryptoPunks-style flat rendering. 48x48, black outline, flat bg."""
import os, json, random
from PIL import Image

random.seed(888)
W = H = 48
SCALE = 20
OUT = "pitbosses"
os.makedirs(f"{OUT}/images", exist_ok=True)
os.makedirs(f"{OUT}/metadata", exist_ok=True)

BLACK = (0, 0, 0)

SKINS = {  # base, shade
    "Pale":   ((234,217,181),(219,196,146), 14),
    "Fair":   ((219,186,146),(196,158,113), 16),
    "Tan":    ((199,159,110),(172,132,85) , 16),
    "Olive":  ((174,139,96) ,(146,112,72) , 14),
    "Brown":  ((134,96,62)  ,(108,74,45)  , 16),
    "Dark":   ((92,62,40)   ,(70,45,28)   , 16),
    "Gold":   ((222,182,60) ,(186,146,36) , 1.2),
    "Zombie": ((122,153,104),(96,124,80)  , 1.4),
}
# flat punk-style backgrounds, dark boss palette
BGS = {
    "Smoke Brown":  ((74,58,38),  26),
    "Casino Green": ((44,74,58),  16),
    "Midnight Blue":((48,58,80),  15),
    "Velvet Purple":((66,50,82),  12),
    "Blood Red":    ((88,46,46),  10),
    "Charcoal":     ((56,56,60),  12),
    "Vault Gold":   ((120,96,44), 5),
    "Neon Pit":     ((84,52,110), 4),
}
CLOTHES = [("Green Suit Pink Tie",10),("Black Suit White Tie",13),("Black Suit Black Tie",10),
           ("Black Suit Gold Tie",8),("Purple Suit",9),("Shirt Suspenders",8),
           ("Black Turtleneck",8),("Pinstripe Suit",7),("White Suit",5),
           ("Green Tracksuit",6),("Red Tracksuit",5),("Dealer Vest",6),("Tuxedo",5)]
HAIR = [("Slicked Back",9),("Bald",7),("Buzzcut",8),("Curtains",7),("Green Messy",7),
        ("Red Spiky",6),("Afro",6),("Purple Fedora",7),("Black Fedora",6),("Blue Durag",6),
        ("Backwards Cap",6),("Dealer Visor",5),("Grey Slick",6),("Mohawk",4),
        ("Ponytail",5),("Golden Crown",1.5)]
EYES = [("None",36),("Black Shades",15),("Rim Glasses",12),("Gold Shades",6),
        ("Eye Patch",4),("Purple Gaze",5),("Laser Eyes",1.2)]
MOUTH = [("Neutral",36),("Smirk",20),("Cigarette",15),("Cigar",10),("Frown",8),("Gold Grill",5)]
JEWELRY = [("None",46),("Gold Chain",24),("Gold Earring",12),("Chain + Earring",8),("Diamond Chain",5)]
EXTRA = [("None",86),("Face Scar",6),("Red Nose",4),("Teardrop",3)]

def wpick(d, rnd):
    names = list(d.keys()); weights = [d[n][-1] for n in names]
    return rnd.choices(names, weights=weights, k=1)[0]
def wpick2(pairs, rnd):
    return rnd.choices([p[0] for p in pairs], weights=[p[1] for p in pairs], k=1)[0]

def P(img, x, y, c):
    if 0 <= x < W and 0 <= y < H:
        img.putpixel((x, y), c + (255,))
def R(img, x0, y0, x1, y1, c):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            P(img, x, y, c)
def HL(img, x0, x1, y, c): R(img, x0, y, x1, y, c)
def VL(img, x, y0, y1, c): R(img, x, y0, x, y1, c)

def head_cols(y):
    if y == 9:  return (19, 28)
    if y == 10: return (18, 29)
    if 11 <= y <= 25: return (17, 30)
    if y == 26: return (17, 29)
    if y == 27: return (18, 29)
    if y == 28: return (18, 28)
    if y == 29: return (19, 28)
    return None

def draw_body(img, cname, skin):
    base, shade = skin[0], skin[1]
    # neck
    R(img, 20, 29, 26, 34, base)
    VL(img, 26, 29, 34, shade)
    # torso
    suit = {
        "black": (38,38,42), "green": (36,72,48), "purple": (92,52,140),
        "grey": (120,120,126), "white": (228,226,220), "greent": (34,110,64),
        "redt": (160,42,42), "shirt": (236,234,228),
    }
    kind = "black"
    if cname == "Green Suit Pink Tie": kind = "green"
    elif cname == "Purple Suit": kind = "purple"
    elif cname == "White Suit": kind = "white"
    elif cname == "Green Tracksuit": kind = "greent"
    elif cname == "Red Tracksuit": kind = "redt"
    elif cname == "Shirt Suspenders": kind = "shirt"
    sb = suit[kind]
    rows = [(35, 14, 33), (36, 12, 35), (37, 11, 36), (38, 10, 37)]
    for y, x0, x1 in rows:
        HL(img, x0, x1, y, sb)
    R(img, 9, 39, 38, 47, sb)
    # arms seam
    VL(img, 14, 38, 47, BLACK); VL(img, 33, 38, 47, BLACK)

    if cname == "Black Turtleneck":
        R(img, 18, 30, 28, 34, (26,26,30))
        HL(img, 18, 28, 30, BLACK)
        return
    if cname == "Shirt Suspenders":
        # collar + black suspender straps like key art
        HL(img, 19, 28, 34, (210,208,200))
        for x in (18, 29):
            P(img, x, 35, BLACK)
        for y in range(35, 48):
            P(img, 19, y, BLACK); P(img, 20, y, BLACK)
            P(img, 27, y, BLACK); P(img, 28, y, BLACK)
        return
    if kind in ("greent", "redt"):
        VL(img, 23, 35, 47, (240,240,240)); VL(img, 24, 35, 47, BLACK)
        HL(img, 15, 21, 35, (240,240,240)); HL(img, 26, 32, 35, (240,240,240))
        return
    # shirt V
    shirt = (240,238,232)
    tri = [(35, 20, 27), (36, 20, 27), (37, 21, 26), (38, 21, 26), (39, 22, 25),
           (40, 22, 25), (41, 22, 25), (42, 23, 24), (43, 23, 24)]
    for y, x0, x1 in tri:
        HL(img, x0, x1, y, shirt)
    # lapels: black seam lines
    for i, y in enumerate(range(35, 45)):
        P(img, 19 + i // 2, y, BLACK)
        P(img, 28 - i // 2, y, BLACK)
    # ties
    def tie(c):
        R(img, 23, 34, 24, 35, c)
        R(img, 22, 36, 25, 44, c)
    if cname == "Green Suit Pink Tie":
        tie((228,168,196))
    elif cname in ("Black Suit White Tie", "Tuxedo"):
        tie((235,233,228))
    elif cname == "White Suit":
        tie((30,30,34))
    elif cname in ("Black Suit Black Tie", "Pinstripe Suit"):
        tie((22,22,26))
    elif cname == "Black Suit Gold Tie":
        tie((216,176,54))
    elif cname == "Dealer Vest":
        R(img, 21, 34, 22, 36, BLACK); R(img, 25, 34, 26, 36, BLACK)
        R(img, 23, 35, 24, 35, BLACK)
        for y in range(37, 46):
            P(img, 21, y, (30,30,34)); P(img, 26, y, (30,30,34))
    if cname == "Pinstripe Suit":
        for x in range(11, 38, 3):
            for y in range(36, 48):
                px = img.getpixel((x, y))
                if px[3] and px[:3] == sb:
                    P(img, x, y, (78,78,86))
    if cname == "Tuxedo":
        R(img, 29, 40, 31, 42, (240,238,232))
        P(img, 29, 40, BLACK)

def draw_head(img, skin):
    base, shade = skin[0], skin[1]
    for y in range(9, 30):
        c = head_cols(y)
        if not c: continue
        x0, x1 = c
        HL(img, x0, x1, y, base)
        P(img, x1, y, shade)  # single flat shade column, punk style
    # ears
    VL(img, 16, 18, 21, base); P(img, 16, 19, shade)
    VL(img, 31, 18, 21, shade)
    # chin shade
    HL(img, 20, 26, 29, shade)

def draw_face(img, skin, eyes, mouth, extra):
    base, shade = skin[0], skin[1]
    # brow shading strip (punks do this)
    HL(img, 18, 22, 17, shade); HL(img, 25, 29, 17, shade)
    # eyes: white + black pupil
    if eyes != "Eye Patch":
        pup = BLACK
        if eyes == "Purple Gaze": pup = (150, 60, 210)
        P(img, 19, 18, (240,240,238)); P(img, 20, 18, pup)
        P(img, 26, 18, (240,240,238)); P(img, 27, 18, pup)
    # nose: punk hook
    P(img, 23, 20, shade); P(img, 23, 21, shade)
    P(img, 22, 22, BLACK); P(img, 23, 22, BLACK)
    if extra == "Red Nose":
        R(img, 22, 20, 24, 22, (208, 44, 44))
        P(img, 22, 20, (232, 84, 84))
    # mouth
    if mouth == "Neutral":
        HL(img, 21, 25, 25, BLACK)
    elif mouth == "Smirk":
        HL(img, 21, 25, 25, BLACK); P(img, 26, 24, BLACK)
    elif mouth == "Frown":
        HL(img, 21, 25, 25, BLACK); P(img, 20, 26, BLACK); P(img, 26, 26, BLACK)
    elif mouth == "Gold Grill":
        R(img, 21, 25, 25, 26, (222,182,60))
        HL(img, 21, 25, 24, BLACK)
        for x in (22, 24): P(img, x, 25, (180,140,34))
    elif mouth == "Cigarette":
        HL(img, 21, 25, 25, BLACK)
        HL(img, 13, 20, 25, (244,244,240))
        P(img, 13, 25, (255,120,30))
        P(img, 12, 23, (168,168,168)); P(img, 12, 21, (140,140,140)); P(img, 13, 19, (120,120,120))
    elif mouth == "Cigar":
        HL(img, 21, 25, 25, BLACK)
        R(img, 13, 24, 20, 26, (100,62,34))
        VL(img, 13, 24, 26, (240,110,40))
        P(img, 12, 22, (168,168,168)); P(img, 12, 20, (140,140,140))
    # eyewear
    if eyes == "Black Shades":
        R(img, 17, 17, 22, 19, (10,10,12)); R(img, 25, 17, 30, 19, (10,10,12))
        HL(img, 23, 24, 17, (10,10,12))
        P(img, 16, 17, (10,10,12)); P(img, 31, 17, (10,10,12))
    elif eyes == "Gold Shades":
        R(img, 17, 17, 22, 19, (60,44,10)); R(img, 25, 17, 30, 19, (60,44,10))
        HL(img, 17, 22, 17, (222,182,60)); HL(img, 25, 30, 17, (222,182,60))
        HL(img, 23, 24, 17, (222,182,60))
        P(img, 16, 17, (222,182,60)); P(img, 31, 17, (222,182,60))
    elif eyes == "Rim Glasses":
        for x0 in (17, 25):
            HL(img, x0, x0 + 5, 16, BLACK); HL(img, x0, x0 + 5, 20, BLACK)
            VL(img, x0, 17, 19, BLACK); VL(img, x0 + 5, 17, 19, BLACK)
        HL(img, 23, 24, 17, BLACK)
        P(img, 16, 17, BLACK); P(img, 31, 17, BLACK)
    elif eyes == "Eye Patch":
        P(img, 19, 18, (240,240,238)); P(img, 20, 18, BLACK)
        R(img, 25, 16, 29, 19, (8,8,8))
        HL(img, 17, 24, 15, (8,8,8))
        P(img, 16, 15, (8,8,8)); P(img, 30, 15, (8,8,8)); P(img, 31, 16, (8,8,8))
    elif eyes == "Laser Eyes":
        for ex in (19, 26):
            P(img, ex, 18, (255,60,40)); P(img, ex + 1, 18, (255,150,120))
            P(img, ex, 17, (255,120,90))
    if extra == "Face Scar":
        for i in range(4):
            P(img, 28 - i, 19 + i, (150, 70, 60))
    if extra == "Teardrop":
        P(img, 17, 20, (110, 170, 230)); P(img, 17, 21, (80, 140, 210))

def draw_hair(img, name, skin):
    if name == "Bald": return
    if name in ("Slicked Back", "Grey Slick", "Buzzcut"):
        c = {"Slicked Back": (20,16,12), "Grey Slick": (150,150,156), "Buzzcut": (34,28,22)}[name]
        R(img, 17, 9, 30, 11, c)
        HL(img, 18, 29, 8, c)
        P(img, 16, 12, c); P(img, 31, 12, c)
        if name == "Slicked Back":
            P(img, 16, 13, c); P(img, 31, 13, c)
            for x in range(19, 30, 3): P(img, x, 9, (52,44,34))
        return
    if name == "Curtains":
        c, d = (74,52,30), (52,36,20)
        R(img, 17, 8, 30, 10, c)
        for x in (18, 20, 22, 25, 27, 29):
            P(img, x, 11, c); P(img, x, 12, d)
        VL(img, 16, 10, 14, c); VL(img, 31, 10, 14, c)
        return
    if name == "Green Messy":
        g, gd = (92,190,90), (62,146,64)
        R(img, 16, 6, 31, 10, g)
        # messy clumps like key art
        for x, y in ((14,8),(15,6),(15,11),(13,10),(32,7),(33,9),(32,12),(34,11),(17,5),(21,4),(26,4),(30,5)):
            P(img, x, y, g)
        for x, y in ((15,9),(33,10),(19,5),(28,5),(14,11)):
            P(img, x, y, gd)
        for x in range(17, 31, 3): P(img, x, 8, gd)
        VL(img, 16, 10, 13, g); VL(img, 31, 10, 13, gd)
        return
    if name == "Red Spiky":
        r, rd = (216,110,40), (176,80,26)
        R(img, 17, 8, 30, 10, r)
        for x in (17, 20, 23, 26, 29):
            P(img, x, 7, r); P(img, x + 1, 6, r); P(img, x + 1, 7, rd)
        P(img, 16, 11, r); P(img, 31, 11, rd)
        return
    if name == "Afro":
        a, al = (28,22,18), (56,44,36)
        R(img, 14, 4, 33, 11, a)
        HL(img, 15, 32, 3, a)
        P(img, 13, 6, a); P(img, 34, 6, a); P(img, 13, 9, a); P(img, 34, 9, a)
        for y in range(5, 11, 3):
            for x in range(16, 32, 4): P(img, x, y, al)
        P(img, 14, 12, a); P(img, 33, 12, a)
        return
    if name in ("Purple Fedora", "Black Fedora"):
        hb = (110,58,178) if name == "Purple Fedora" else (30,30,36)
        hd = (80,40,130) if name == "Purple Fedora" else (16,16,20)
        R(img, 17, 3, 30, 8, hb)
        HL(img, 17, 30, 8, hd)  # band
        HL(img, 13, 34, 9, hb); HL(img, 13, 34, 10, hd)
        if name == "Purple Fedora":
            P(img, 20, 4, (140,86,210))
        else:
            P(img, 20, 4, (52,52,60))
        return
    if name == "Blue Durag":
        b, bd = (44,84,200), (30,58,150)
        R(img, 16, 6, 31, 12, b)
        HL(img, 17, 30, 12, bd)
        for x in range(18, 30, 4): P(img, x, 8, bd)
        for y in range(12, 22):
            P(img, 32, y, b if y % 2 else bd)
        P(img, 33, 14, bd)
        return
    if name == "Backwards Cap":
        c, cd = (46,46,52), (28,28,32)
        R(img, 16, 6, 31, 11, c)
        HL(img, 16, 31, 11, cd)
        R(img, 31, 8, 35, 9, c)
        P(img, 31, 7, cd)
        return
    if name == "Dealer Visor":
        g, gd = (30,124,72), (20,88,50)
        HL(img, 15, 32, 14, g); HL(img, 14, 33, 15, g); HL(img, 14, 33, 16, gd)
        HL(img, 16, 31, 13, gd)
        return
    if name == "Mohawk":
        m = (216,110,40)
        R(img, 22, 2, 25, 10, m)
        for y in range(3, 9, 2): P(img, 25, y, (176,80,26))
        return
    if name == "Ponytail":
        c, d = (38,30,20), (24,19,13)
        R(img, 17, 8, 30, 11, c)
        HL(img, 18, 29, 8, c)
        for y in range(10, 20):
            P(img, 32, y, c if y % 2 else d)
        P(img, 16, 12, c); P(img, 31, 12, c)
        return
    if name == "Golden Crown":
        gold, gl = (230,186,54), (250,220,120)
        HL(img, 17, 30, 8, gold); HL(img, 17, 30, 9, (188,146,32))
        for x in (17, 20, 23, 26, 29):
            P(img, x, 6, gold); P(img, x, 7, gold); P(img, x + 1, 7, gold)
        for x in (17, 20, 23, 26, 29): P(img, x, 5, gl)
        P(img, 19, 7, (208,48,68)); P(img, 24, 8, (48,98,208))
        return

def draw_jewelry(img, name):
    gold, gd = (230,186,54), (184,144,32)
    dia = (176, 226, 244)
    def chain(c1, c2):
        pts = [(19,34),(20,35),(21,36),(22,36),(23,37),(24,37),(25,36),(26,36),(27,35),(28,34)]
        for i,(x,y) in enumerate(pts):
            P(img, x, y, c1 if i % 2 == 0 else c2)
        P(img, 23, 38, c1); P(img, 24, 38, c2)
    if name in ("Gold Chain", "Chain + Earring"): chain(gold, gd)
    if name == "Diamond Chain":
        chain(dia, (130,190,214)); P(img, 23, 39, (240,252,255))
    if name in ("Gold Earring", "Chain + Earring"):
        P(img, 32, 21, gold); P(img, 32, 22, gd)

def outline(char):
    """Punk-style: dilate character mask by 1px with black."""
    px = char.load()
    mask = [[px[x, y][3] > 0 for x in range(W)] for y in range(H)]
    out = char.copy(); po = out.load()
    for y in range(H):
        for x in range(W):
            if not mask[y][x]:
                for dx, dy in ((1,0),(-1,0),(0,1),(0,-1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < W and 0 <= ny < H and mask[ny][nx]:
                        po[x, y] = (0, 0, 0, 255)
                        break
    return out

def render(traits):
    char = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    skin = SKINS[traits["Skin"]]
    draw_body(char, traits["Clothing"], skin)
    draw_head(char, skin)
    draw_face(char, skin, traits["Eyes"], traits["Mouth"], traits["Extra"])
    draw_hair(char, traits["Headwear"], skin)
    draw_jewelry(char, traits["Jewelry"])
    char = outline(char)
    bg = Image.new("RGBA", (W, H), BGS[traits["Background"]][0] + (255,))
    bg.alpha_composite(char)
    return bg.convert("RGB").resize((W * SCALE, H * SCALE), Image.NEAREST)

def gen_traits(rnd):
    return {
        "Background": wpick(BGS, rnd), "Skin": wpick(SKINS, rnd),
        "Clothing": wpick2(CLOTHES, rnd), "Headwear": wpick2(HAIR, rnd),
        "Eyes": wpick2(EYES, rnd), "Mouth": wpick2(MOUTH, rnd),
        "Jewelry": wpick2(JEWELRY, rnd), "Extra": wpick2(EXTRA, rnd),
    }

def main():
    rnd = random.Random(8888)
    seen, tokens = set(), []
    while len(tokens) < 888:
        t = gen_traits(rnd)
        key = tuple(t[k] for k in ("Skin","Clothing","Headwear","Eyes","Mouth","Jewelry","Extra","Background"))
        if key in seen: continue
        seen.add(key)
        tokens.append(t)
    counts = {}
    for i, t in enumerate(tokens, 1):
        render(t).save(f"{OUT}/images/{i}.png")
        attrs = [{"trait_type": k, "value": t[k]} for k in
                 ("Background","Skin","Clothing","Headwear","Eyes","Mouth","Jewelry","Extra") if t[k] != "None"]
        json.dump({"name": f"PitBoss #{i}",
                   "description": "888 bosses running the pit. PitBosses genesis collection.",
                   "image": f"ipfs://REPLACE_CID/{i}.png",
                   "attributes": attrs}, open(f"{OUT}/metadata/{i}.json", "w"), indent=2)
        for k in ("Background","Skin","Clothing","Headwear","Eyes","Mouth","Jewelry","Extra"):
            counts.setdefault(k, {}).setdefault(t[k], 0); counts[k][t[k]] += 1
    json.dump(counts, open(f"{OUT}/rarity.json", "w"), indent=2)
    cell = 192
    sheet = Image.new("RGB", (cell * 5, cell * 5), (12, 10, 8))
    for idx in range(25):
        im = Image.open(f"{OUT}/images/{idx+1}.png").resize((cell, cell), Image.NEAREST)
        sheet.paste(im, ((idx % 5) * cell, (idx // 5) * cell))
    sheet.save(f"{OUT}/preview.png")
    print("done", len(tokens))

if __name__ == "__main__":
    main()
