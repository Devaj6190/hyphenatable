# Specs

Three people write a spec on their own, the specs get compared, the conflicts get resolved, and the result is one final spec.

| File | What it is |
|---|---|
| [varnika.md](varnika.md), [devaj.md](devaj.md), [shannin.md](shannin.md) | Each person's own spec, written from [TEMPLATE.md](TEMPLATE.md) |
| [conflicts.md](conflicts.md) | Every place the specs disagree or only one person covered something. Generated, then filled in by the team |
| [final.md](final.md) | The agreed spec. Generated once nothing in conflicts.md is open |

## Steps

1. **Write.** Fill in your own file without reading the other two. Commit it.
2. **Compare.** Once all three are in, run `/spec-merge` in Claude Code from the repo root. It rewrites `conflicts.md` with three lists:
   - **Conflicts:** two or more people want different things.
   - **Solo items:** only one person mentioned it. Keep or drop?
   - **Agreed:** everyone who covered it says the same thing.
3. **Resolve.** Talk it through and write the **Decision** (and who decided) under each open item in `conflicts.md`. Don't edit the three personal specs to make conflicts go away; they stay as each person wrote them.
4. **Merge.** Run `/spec-merge` again. It keeps your decisions, re-checks for anything new, and writes `final.md` when nothing is open.

If someone changes their spec later, run `/spec-merge` again. Decisions already made stay put, and new disagreements show up as open items.

[../docs/DESIGN.md](../docs/DESIGN.md) is the earlier design draft. It's background for the comparison, not a fourth vote.
