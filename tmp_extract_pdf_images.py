import hashlib
from pathlib import Path

import pymupdf

src = Path(r"c:\Users\Ibrahim\Documents\Besouhola_Meta_Own_App_Setup_Guide_EN.pdf")
out_dir = Path(r"c:\Users\Ibrahim\Documents\meta_guide_images")
out_dir.mkdir(exist_ok=True)

# Clean previous extracts
for p in out_dir.glob("*.png"):
    p.unlink()

doc = pymupdf.open(src)
unique = {}
for page_index in range(doc.page_count):
    page = doc[page_index]
    for img in page.get_images(full=True):
        xref = img[0]
        pix = pymupdf.Pixmap(doc, xref)
        if pix.n >= 5:
            pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
        if pix.width < 200 or pix.height < 200:
            continue
        data = pix.tobytes("png")
        digest = hashlib.sha1(data).hexdigest()
        if digest not in unique:
            unique[digest] = {
                "xref": xref,
                "w": pix.width,
                "h": pix.height,
                "pages": [page_index + 1],
                "data": data,
            }
        else:
            unique[digest]["pages"].append(page_index + 1)

print("unique images", len(unique))
# Save unique by first-seen page order
ordered = sorted(unique.values(), key=lambda x: (x["pages"][0], -x["w"] * x["h"]))
for i, item in enumerate(ordered, start=1):
    path = out_dir / f"unique_{i:02d}_p{item['pages'][0]}.png"
    path.write_bytes(item["data"])
    print(path.name, item["w"], item["h"], "pages", sorted(set(item["pages"]))[:8], "...")

# Also render full pages that likely contain figure screenshots (pages 2-9 from original text)
for page_index in [1, 2, 4, 5, 6, 8]:  # 0-based: pages 2,3,5,6,7,9
    page = doc[page_index]
    # high-res render
    mat = pymupdf.Matrix(2, 2)
    pix = page.get_pixmap(matrix=mat, alpha=False)
    path = out_dir / f"render_page{page_index+1}.png"
    pix.save(str(path))
    print("render", path.name, pix.width, pix.height)
