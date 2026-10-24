# Generates payroll-agent.excalidraw: architecture (top) + one pay run flow (bottom).
import json, random, sys

random.seed(7)
els, by_id = [], {}
FONT, LH = 2, 1.15  # Helvetica
COL = dict(sim="#ffec99", real="#b2f2bb", agent="#a5d8ff", llm="#d0bfff", store="#e9ecef",
           people="#ffd8a8", moment="#ffc9c9")


def base(id, type, x, y, w, h, **kw):
    e = dict(id=id, type=type, x=x, y=y, width=w, height=h, angle=0, strokeColor="#1e1e1e",
             backgroundColor="transparent", fillStyle="solid", strokeWidth=2, strokeStyle="solid",
             roughness=1, opacity=100, groupIds=[], frameId=None, roundness=None,
             seed=random.randint(1, 2**31), version=1, versionNonce=random.randint(1, 2**31),
             isDeleted=False, boundElements=[], updated=1, link=None, locked=False)
    e.update(kw)
    els.append(e); by_id[id] = e
    return e


def text(id, x, y, s, size=16, container=None, color="#1e1e1e"):
    lines = s.split("\n")
    w = max(len(l) for l in lines) * size * 0.56
    h = len(lines) * size * LH
    if container:
        c = by_id[container]
        if c["type"] == "arrow":  # Excalidraw rule: odd point count -> middle point, even -> middle segment
            p, n = c["points"], len(c["points"])
            mx, my = p[n // 2] if n % 2 else ((p[n // 2 - 1][0] + p[n // 2][0]) / 2, (p[n // 2 - 1][1] + p[n // 2][1]) / 2)
            x, y = c["x"] + mx - w / 2, c["y"] + my - h / 2
        else:
            x, y = c["x"] + (c["width"] - w) / 2, c["y"] + (c["height"] - h) / 2
        c["boundElements"].append(dict(id=id, type="text"))
    return base(id, "text", x, y, w, h, text=s, originalText=s, fontSize=size, fontFamily=FONT,
                textAlign="center" if container else "left", verticalAlign="middle" if container else "top",
                containerId=container, lineHeight=LH, autoResize=True, strokeColor=color)


def box(id, x, y, w, h, label, fill="agent", size=16, dashed=False):
    base(id, "rectangle", x, y, w, h, backgroundColor=COL[fill], roundness=dict(type=3),
         strokeStyle="dashed" if dashed else "solid")
    text(id + "_t", 0, 0, label, size, container=id)


def zone(id, x, y, w, h, label, color):
    base(id, "rectangle", x, y, w, h, strokeStyle="dashed", strokeWidth=1, strokeColor=color,
         roundness=dict(type=3))
    text(id + "_t", x + 14, y + 10, label, 20, color=color)


def anchor(e, side):  # "l", or "l:0.3" = 30% along that edge
    s, f = (side.split(":") + ["0.5"])[:2]
    f = float(f)
    x, y, w, h = e["x"], e["y"], e["width"], e["height"]
    return {"l": (x, y + h * f), "r": (x + w, y + h * f), "t": (x + w * f, y), "b": (x + w * f, y + h)}[s]


def arrow(id, a, b, sa="r", sb="l", label=None, dashed=False, color="#1e1e1e", via=None):
    (x1, y1), (x2, y2) = anchor(by_id[a], sa), anchor(by_id[b], sb)
    pts = [[0, 0]] + [[px - x1, py - y1] for px, py in (via or [])] + [[x2 - x1, y2 - y1]]
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    base(id, "arrow", x1, y1, max(xs) - min(xs), max(ys) - min(ys), points=pts,
         lastCommittedPoint=None, startArrowhead=None, endArrowhead="arrow", elbowed=False,
         startBinding=dict(elementId=a, focus=0, gap=4), endBinding=dict(elementId=b, focus=0, gap=4),
         strokeStyle="dashed" if dashed else "solid", strokeColor=color, roundness=None)
    by_id[a]["boundElements"].append(dict(id=id, type="arrow"))
    by_id[b]["boundElements"].append(dict(id=id, type="arrow"))
    if label:
        text(id + "_t", 0, 0, label, 13, container=id)


# ---------------- Architecture ----------------
text("title", 0, -140, "Payroll Input Agent: architecture (Bayview Health, 1,200 staff, biweekly)", 30)
text("legend", 0, -92, "yellow = simulated   green = real sandbox API   blue = deterministic code   "
     "purple = Claude   grey = storage / controls   orange = people + web app", 15, color="#495057")

zone("z_sim", 0, 0, 400, 600, "Simulated company systems", "#e67700")
box("hr", 30, 60, 340, 90, "HR API (Workday-like)\nstatus, rates, org chart,\neffective dates", "sim")
box("time", 30, 180, 340, 90, "Time API (Kronos-like)\npaginated, injectable\npartial-page failure", "sim")
box("ben", 30, 300, 340, 90, "Benefits portal\nHTML only, login\n(no API)", "sim")
box("gen", 30, 440, 340, 120, "Generator + seed\nplanted errors + ANSWER KEY\nscenario injector, +24h clock", "sim")

zone("z_real", 0, 660, 400, 350, "Live sandboxes (real APIs)", "#2b8a3e")
box("nessie", 30, 720, 340, 80, "Capital One Nessie\nbank of record: accounts", "real")
box("crs", 30, 900, 340, 80, "CRS Credit sandbox\nidentity / fraud check\n(high-risk exceptions only)", "real")

zone("z_agent", 480, 0, 980, 1010, "Agent backend: FastAPI + SQLite (one process)", "#1971c2")
box("conn", 520, 60, 400, 100, "Connectors\nhttpx (HR, Time, Nessie)\nPlaywright (Benefits portal)", "agent")
box("snap", 520, 190, 400, 90, "Completeness checker\ncounts vs headcount, pagination,\nas-of, schema, snapshot hash", "agent")
box("join", 520, 310, 400, 70, "Joiner\nemployee x period record, ID map", "agent")
box("rules", 520, 410, 400, 100, "Rules engine (DETERMINISTIC)\nexception = rule, severity, evidence,\ntrusted source + why", "agent")
box("policy", 520, 540, 400, 90, "Policy memory\ncontroller-approved standing rules\nmatch -> auto-resolve (cited)", "store")
box("access", 520, 680, 400, 180, "Access model\nREAD-ONLY on HR / Time / Benefits / Bank\nwrites: staging, outbox, audit only\nfixes happen AT SOURCE -> re-sync\nnever approves, never pays\nPII tokenized before any LLM call", "store", 14, dashed=True)

box("router", 1040, 60, 380, 100, "Router / ask drafter\nowner = rule type + org chart\nClaude Sonnet 5.5; remind, escalate", "llm")
box("parser", 1040, 190, 380, 80, "Reply parser\nfree text -> Decision (Haiku 5.5)\nlow confidence -> ask back", "llm")
box("sod", 1040, 300, 380, 100, "SoD guard (code, not LLM)\napprover != subject, has authority;\npass -> re-sync affected employees", "agent")
box("miner", 1040, 430, 380, 80, "Pattern miner\nsame rule+scope+approver+fix x3\n-> PROPOSE standing policy", "llm")
box("out", 1040, 540, 380, 90, "Output gate (0 open blockers)\nverified input CSV + held lines\n+ exception report + diff", "agent")
box("ask", 1040, 660, 380, 100, "Interrogation: \"why did you...?\"\nClaude Opus 5.5, answers ONLY\nfrom audit log, with citations", "llm")
box("audit", 1040, 790, 380, 120, "AUDIT LOG (append-only,\nhash-chained, verify endpoint)\nsnapshots, hits, asks, replies,\napprovers, policy uses", "store")

zone("z_people", 1540, 0, 400, 1010, "Web app (Vite + React) + people", "#d9480f")
box("inbox", 1570, 60, 340, 210, "Persona inbox\nHRBP, unit manager,\nbenefits admin\n\nbuttons: Fix at source /\nApprove / Hold + free text", "people")
box("ctrl", 1570, 430, 340, 80, "Controller\napproves / rejects policies", "people")
box("pm", 1570, 540, 340, 90, "Payroll manager\nFINAL SIGN-OFF\n(sends file to ADP / Workday)", "people")
box("judge", 1570, 660, 340, 100, "Judges\nrun own scenario (injector)\nask the agent \"why?\"", "people")
box("ui", 1570, 790, 340, 120, "Dashboard + score page\nsync status, exceptions board,\nevidence side by side,\nprecision / recall vs answer key", "people")

arrow("a1", "hr", "conn", "r", "l:0.2", label="REST")
arrow("a2", "time", "conn", "r", "l:0.45", label="REST, paged")
arrow("a3", "ben", "conn", "r", "l:0.7", label="browser")
arrow("a4", "nessie", "conn", "r", "l:0.92", label="account\ncheck", via=[(450, 760), (450, 152)])
arrow("a5", "conn", "snap", "b", "t")
arrow("a6", "snap", "join", "b", "t")
arrow("a7", "join", "rules", "b", "t")
arrow("a8", "rules", "policy", "b", "t")
arrow("a9", "policy", "router", "r", "l:0.75", label="no\nmatch", via=[(965, 585), (965, 135)])
arrow("a11", "router", "crs", "l:0.25", "r", dashed=True, color="#2b8a3e", via=[(1000, 85), (1000, 940)])
arrow("a12", "router", "inbox", "r", "l:0.238", label="ask +\nevidence")
arrow("a13", "inbox", "parser", "l:0.81", "r", label="reply")
arrow("a14", "parser", "sod", "b", "t")
arrow("a15", "sod", "snap", "l", "r", dashed=True)
arrow("a16", "inbox", "hr", "t", "t:0.9", label="'Fix at source' = owner edits the system of record; agent re-syncs to confirm",
      dashed=True, via=[(1740, -30), (336, -30)])
arrow("a18", "miner", "ctrl", "r:0.3", "l:0.3", label="propose")
arrow("a19", "ctrl", "miner", "l:0.75", "r:0.75", label="approve", dashed=True)
arrow("a24", "miner", "policy", "l", "r", dashed=True)
arrow("a10", "policy", "out", "r:0.8", "l", dashed=True)
arrow("a17", "out", "pm", "r", "l", label="verified\nfile")
arrow("a20", "judge", "ask", "l", "r", label="why?")
arrow("a25", "ask", "audit", "b", "t")
arrow("a23", "ui", "audit", "l", "r", label="reads", dashed=True)
arrow("a21", "judge", "gen", "r", "l", label="judges inject their own scenario (any seed) -> re-run", dashed=True,
      via=[(1975, 710), (1975, 1045), (-40, 1045), (-40, 500)])

# ---------------- One pay run ----------------
Y = 1200
text("title2", 0, Y - 80, "One pay run, end to end (T-3 days before pay date)", 30)
steps = [
    ("s1", "1  Trigger\nschedule / Run now", "agent"),
    ("s2", "2  Sync 4 sources\nhashed snapshots", "agent"),
    ("s3", "3  Completeness\nTime: 487 of 512!\nretry -> mark stale", "moment"),
    ("s4", "4  Join\nemployee x period", "agent"),
    ("s5", "5  Validate\ndeterministic rules\n-> exceptions", "agent"),
    ("s6", "6  Policy match?\nyes -> auto-resolve\n(logged)", "store"),
    ("s7", "7  Route to owner\nClaude drafts ask\nCRS check if risky", "llm"),
    ("s8", "8  Owner acts\nfix at source /\napprove / hold", "people"),
    ("s9", "9  Parse + SoD\nre-sync, re-validate\nclose exception", "agent"),
    ("s10", "10  Gate\n0 open blockers ->\nverified CSV + held", "agent"),
    ("s11", "11  Manager signs off\n(agent never pays)", "people"),
    ("s12", "12  Learn\npropose policy ->\ncontroller approves", "llm"),
]
W, H, GAP = 250, 110, 60
for i, (sid, lab, fill) in enumerate(steps):
    row, col = divmod(i, 6)
    x = col * (W + GAP) if row == 0 else (5 - col) * (W + GAP)  # snake layout
    box(sid, x, Y + row * 260, W, H, lab, fill, 15)
for i in range(len(steps) - 1):
    a, b = steps[i][0], steps[i + 1][0]
    if i == 5:
        arrow(f"f{i}", a, b, "b", "t")
    elif i < 5:
        arrow(f"f{i}", a, b, "r", "l")
    else:
        arrow(f"f{i}", a, b, "l", "r")
arrow("loop", "s9", "s7", "t", "r", label="still open -> back to owner", dashed=True,
      via=[(1055, Y + 215), (1830, Y + 215), (1830, Y + 315)])
arrow("deadline", "s7", "s8", "b", "b", label="+24h no reply -> next approver; at cutoff hold the LINE, not the run",
      dashed=True, via=[(1675, Y + 420), (1365, Y + 420)])
arrow("run2", "s12", "s1", "t", "b", label="RUN 2: fewer asks; checks run-1 retro pay was carried", dashed=True,
      color="#1971c2")

box("moment", 0, Y + 500, 900, 160,
    "THE MOMENT (video opens here)\nNurse D. Okafor: terminated Oct 15 in HR, 32h on timesheet Oct 16-20,\n"
    "bank account changed 2 days before termination -> $2,840 to a new account.\n"
    "Agent: HR is system of record for status -> holds ONE line, CRS fraud check,\n"
    "asks HRBP + manager, then defends the hold when a judge asks \"why?\"", "moment", 16)
box("audit2", 960, Y + 500, 900, 160,
    "Every step writes to the hash-chained audit log\n(snapshot hashes, rule hits, asks, replies, approver identity,\n"
    "policy IDs, sign-off). Score page compares exceptions to the answer key:\n"
    "precision, recall, asks run 1 -> run 2, time to verified file.", "store", 16)

doc = dict(type="excalidraw", version=2, source="https://excalidraw.com", elements=els,
           appState=dict(viewBackgroundColor="#ffffff", gridSize=None), files={})
json.dump(doc, open(sys.argv[1], "w", encoding="utf-8"), indent=1)
print(len(els), "elements")
