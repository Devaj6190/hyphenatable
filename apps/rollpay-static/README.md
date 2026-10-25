# RollPay static UI prototype

Clickable design prototype of the RollPay dashboard: `index.html`, `styles.css`, `app.js`. No build step, no package.json, no network calls besides Google Fonts. It is not wired to Convex and does not compute pay.

Every person, company, job, hour and dollar amount on these pages is **synthetic** demo data hard-coded in `app.js`. Some names match the Company A fixtures in `data/fixtures/a/`; the rest are invented for the prototype.

## Run on localhost

```
npx serve apps/rollpay-static
```

then open the URL it prints (usually http://localhost:3000).

Pages: `#home`, `#company`, `#workbook`, `#audit`, `#manager`.
