import numpy as np
from PIL import Image

SRC = r'C:\Users\PaulBerry\OneDrive - Berry Business Informatics\Documents\PBTable\PBTable Logo.png'
OUT = r'C:\Users\PaulBerry\OneDrive - Berry Business Informatics\Documents\PBTable\pbtable-logo.png'

img = Image.open(SRC).convert('RGBA')
arr = np.asarray(img).astype(np.float32)
rgb = arr[:, :, :3]
orig_a = arr[:, :, 3]

bg = np.array([23, 37, 65], dtype=np.float32)
dist = np.sqrt(((rgb - bg) ** 2).sum(axis=2))

thresh, feather = 82.0, 38.0
new_a = np.clip((dist - thresh) / feather, 0, 1) * 255.0
alpha = np.minimum(orig_a, new_a)

mask = alpha > 40
col = mask.sum(axis=0)
present = col > max(6, col.max() * 0.02)

# split columns into contiguous runs; keep the run with the most opaque pixels (the paddle)
runs = []
i, N = 0, len(present)
while i < N:
    if present[i]:
        j = i
        while j < N and present[j]:
            j += 1
        runs.append((i, j))
        i = j
    else:
        i += 1
x0, x1 = max(runs, key=lambda r: int(col[r[0]:r[1]].sum()))

# wipe everything outside the paddle's column band (removes the stray sparkle)
alpha[:, :x0] = 0
alpha[:, x1:] = 0
arr[:, :, 3] = alpha

sub = (alpha > 40)
rowp = sub.sum(axis=1)
rows = np.where(rowp > max(6, rowp.max() * 0.02))[0]
y0, y1 = rows.min(), rows.max() + 1

pad = 14
x0, x1 = max(x0 - pad, 0), min(x1 + pad, img.size[0])
y0, y1 = max(y0 - pad, 0), min(y1 + pad, img.size[1])

out = Image.fromarray(arr.astype(np.uint8), 'RGBA').crop((x0, y0, x1, y1))

target_h = 240
w, h = out.size
out = out.resize((round(w * target_h / h), target_h), Image.LANCZOS)
out.save(OUT)
print('cropbox', (int(x0), int(y0), int(x1), int(y1)), 'final', out.size)
