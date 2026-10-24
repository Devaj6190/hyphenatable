# Turns simple_diagrams.json (connector shorthand: "label", "from"/"to") into payroll-simple.excalidraw.
# Architecture on top, pay-run flow below it.
import json, random

random.seed(3)
src = json.load(open("simple_diagrams.json", encoding="utf-8"))
out, by_id = [], {}
DEF = dict(angle=0, strokeColor="#1e1e1e", backgroundColor="transparent", fillStyle="solid", strokeWidth=2,
           strokeStyle="solid", roughness=1, opacity=100, groupIds=[], frameId=None, roundness=None,
           version=1, isDeleted=False, boundElements=[], updated=1, link=None, locked=False)


def add(e):
    full = {**DEF, **e, "seed": random.randint(1, 2**31), "versionNonce": random.randint(1, 2**31)}
    full["boundElements"] = list(full["boundElements"])
    out.append(full); by_id[full["id"]] = full
    return full


def text(id, s, size, x=0, y=0, container=None, color="#1e1e1e"):
    lines = s.split("\n")
    w, h = max(len(l) for l in lines) * size * 0.56, len(lines) * size * 1.25
    if container:
        c = by_id[container]
        if c["type"] == "arrow":
            p = c["points"]; mx, my = (p[0][0] + p[-1][0]) / 2, (p[0][1] + p[-1][1]) / 2
            x, y = c["x"] + mx - w / 2, c["y"] + my - h / 2
        else:
            x, y = c["x"] + (c["width"] - w) / 2, c["y"] + (c["height"] - h) / 2
        c["boundElements"].append(dict(id=id, type="text"))
    add(dict(id=id, type="text", x=x, y=y, width=w, height=h, text=s, originalText=s, fontSize=size,
             fontFamily=5, textAlign="center" if container else "left",
             verticalAlign="middle" if container else "top", containerId=container, lineHeight=1.25,
             autoResize=True, strokeColor=color))


for part, dy in (("arch", 0), ("flow", 900)):
    for e in src[part]:
        e = {k: v for k, v in e.items()}
        e["y"] += dy
        label, frm, to = e.pop("label", None), e.pop("from", None), e.pop("to", None)
        if e["type"] == "text":
            text(e["id"], e["text"], e["fontSize"], e["x"], e["y"], color=e.get("strokeColor", "#1e1e1e"))
            continue
        if e["type"] == "arrow":
            xs, ys = [p[0] for p in e["points"]], [p[1] for p in e["points"]]
            e.update(width=max(xs) - min(xs), height=max(ys) - min(ys), endArrowhead="arrow", startArrowhead=None,
                     lastCommittedPoint=None, elbowed=False,
                     startBinding=dict(elementId=frm, focus=0, gap=4), endBinding=dict(elementId=to, focus=0, gap=4))
            by_id[frm]["boundElements"].append(dict(id=e["id"], type="arrow"))
            by_id[to]["boundElements"].append(dict(id=e["id"], type="arrow"))
        add(e)
        if label:
            text(e["id"] + "_t", label["text"], label["fontSize"], container=e["id"])

json.dump(dict(type="excalidraw", version=2, source="https://excalidraw.com", elements=out,
               appState=dict(viewBackgroundColor="#ffffff"), files={}),
          open("payroll-simple.excalidraw", "w", encoding="utf-8"), indent=1)
ids = {e["id"] for e in out}
assert all(b["id"] in ids for e in out for b in e["boundElements"]), "dangling binding"
print(len(out), "elements")
