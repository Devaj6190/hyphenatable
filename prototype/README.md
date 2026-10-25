# RollPay UI prototype

A static, clickable prototype of the owner's payroll screens, kept here as a design reference. It is not the dashboard: the product UI lives in `apps/web`.

**All data is synthetic.** The company, people, hours, rates and pay amounts are made up and hard-coded in `app.js`. The page makes no API calls and holds no secrets. The top bar says `synthetic · prototype` so nobody reads the numbers as real.

## Run it

No build step. From the repo root:

```bash
npx serve -l tcp://127.0.0.1:3001 prototype
```

Then open http://localhost:3001. Pages: `#home`, `#company`, `#workbook`, `#audit`, `#manager`.

## Source

Moved from `varnikayadavpsu/rollpay-ui@a48be3c`. Changes since then: Biome formatting and lint fixes (decorative SVGs marked `aria-hidden`, `biome-ignore` notes on the five `!important`s, `forEach` callbacks that no longer return a value) and the `synthetic · prototype` chip. Nothing else changed.
