# Grocery POS

A point of sale and back office for a grocery store or supermarket, built for
Kosovo, Albania and Serbia. It runs in the browser on the till, keeps working
with no internet, and keeps every number (stock, cash, VAT) traceable.

## What's in it

**Till** (1280 × 800 touch screen, works with a USB or Bluetooth scanner)

- Sign in by tapping your name and typing your 4-digit PIN. The first manager starts on PIN 0000 and must change it.
- Open a shift by counting the float note by note. Close it by counting the drawer blind; the Z report shows the difference.
- Sell: an always-ready scan field, `3*` before a scan for quantities, quick keys for loose produce and bakery, name and PLU search.
- Scale labels: EAN-13 codes starting 21–29 carry a PLU and a weight, 20 a PLU and a price (prefixes are settings).
- Weighed goods: the cashier types the weight (no scale driver yet).
- Line and basket discounts with reasons. Above the cashier limit, a supervisor types their PIN on the spot. Price overrides and removed lines need a PIN too, and every one is in the audit log.
- Age check for alcohol and tobacco.
- Park a sale and resume it. Parked sales clear at shift close.
- Pay by cash (quick notes, change), card (confirmed by the cashier; no terminal integration yet) or both.
- Receipt on screen and printed (58 or 80 mm), with VAT letter per line and a VAT table.
- Returns by receipt (partial returns refund exactly what was paid, discounts included, never twice) or without a receipt with a supervisor PIN. Damaged goods go to waste instead of back to stock.
- Cash in and out with a reason and a PIN, X report, devices, reprint, void the sale.

**Back office** (any screen size; supervisors and managers)

Dashboard, receipts, shifts and Z reports, products (margins, price history, quick keys, 18+), CSV import and export (Albanian column names work too), stock levels with write-offs and counts, receiving deliveries (updates costs), suppliers, reports (sales, VAT, categories, products, payments, cashiers, CSV export), staff and roles, audit log, and settings (store, tax and fiscal module, receipt, scale barcodes, backup and restore, sample store).

## Fiscalization

Each country registers receipts with the tax authority differently, so it's a module you pick in Settings (`src/fiscal`):

| Module | How |
| --- | --- |
| Kosovo · ATK | A certified fiscal device signs and numbers each receipt |
| Albania · CIS | The till signs the receipt (NSLF) and the tax service returns the NIVF |
| Serbia · L-PFR / V-PFR | The fiscal processor signs it and returns the PFR number and check link |

A sale is saved first and registered afterwards by a queue that retries until it works, so the till never waits on the tax service and keeps selling offline.

**The three country modules are test adapters.** They build each receipt in the right shape and sign it with a local test key, but send nothing, and receipts print "TEST MODE". A certified connection (device driver, certificate, endpoint) replaces `register` in the chosen module once the launch country is decided.

## Data

Everything is stored on the device in IndexedDB (with a localStorage fallback) and the app shell is cached by a service worker, so it works with no internet at all. There is no server or sync between tills yet: the back office reads the same device's data. Use **Settings → Data and backup** to download a backup every day.

Money is whole cents and prices include VAT (8% A, 18% B, 0% C). Stock only changes through recorded moves (sale, return, delivery, count, damaged, expired), so every stock number has a history.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173  (till at /, back office at /#/office)
npm test           # domain and store tests
npm run build      # static files in dist/, host anywhere
```

To try everything quickly: open the back office, sign in with 0000, then **Settings → Data and backup → Load sample store**. Sample staff PINs: Elira (cashier) 1111, Fatos (cashier) 2222, Arben (supervisor) 5555.

## Not built yet

Card terminal and scale drivers, certified fiscal connections, sync between tills and a central server, customers and loyalty.
