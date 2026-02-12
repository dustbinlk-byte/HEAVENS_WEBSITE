# Project: Cosmetic Beauty Shop POS System (Wholesale & Retail)

## 1. Project Overview
A lightweight, browser-based Point of Sale (POS) system designed for a cosmetic business that handles both retail and wholesale operations. The system will manage in-house manufactured products and vendor-supplied items.

---

## 2. Business Requirements (Functional)

### A. Inventory Management
* **Product Categorization:** Ability to label items as "In-house" or "Vendor-supplied."
* **Dual Pricing:** Every product must have a **Retail Price** and a **Wholesale Price**.
* **Stock Tracking:** * Auto-deduct stock on sales.
    * Low stock alerts (visual indicators).
* **Vendor Management:** Record vendor details for items bought externally.

### B. Sales & Billing (POS Interface)
* **Customer Selection:** Toggle between "Retail Customer" and "Wholesale Customer."
* **Cart System:** Add items via search or barcode (optional).
* **Discounts:** Ability to apply a percentage or fixed amount discount per bill.
* **Profit Margin Calculation:** Automatically calculate the margin based on Cost Price vs. Selling Price (Retail/Wholesale).
* **Receipt Generation:** Generate a printable thermal receipt (PDF or Browser Print).

### C. Reporting
* **Daily/Monthly Sales Summary:** Total revenue and total profit.
* **Top Selling Products:** Insight into which cosmetics move fastest.
* **Inventory Valuation:** Total value of stock currently in the shop.

---

## 3. Technical Requirements (The Tech Stack)

* **Frontend:** HTML5, Tailwind CSS (via CDN or CLI) for a modern UI.
* **Logic:** Vanilla JavaScript (ES6+).
* **Database:** **Dexie.js** (A wrapper for IndexedDB) to store all data locally in the browser. 
    * *Why?* It works offline, handles large data, and doesn't require a paid server.
* **Export/Import:** Ability to export the database as a JSON file (for backups).

---

## 4. Database Schema (Dexie.js Structure)

The system should have the following tables:
1.  **products:** `++id, name, category, type (in-house/vendor), costPrice, retailPrice, wholesalePrice, stockQty, minStockLevel`
2.  **sales:** `++id, timestamp, customerType, totalAmount, discount, profit, items(array)`
3.  **vendors:** `++id, name, contact, productCategories`

---

## 5. UI/UX Modules to Build

1.  **Dashboard:** Quick stats (Today's Sales, Low Stock items).
2.  **POS Screen:** * Left side: Product search and grid.
    * Right side: Cart, Total, Wholesale/Retail toggle, and 'Checkout' button.
3.  **Inventory Page:** A table to add, edit, or delete products.
4.  **Reports Page:** Date-range filters for sales history.

---

## 6. Critical Logic Instructions for Developers

1.  **Price Logic:** When "Wholesale" is selected in the POS, the unit price must automatically switch from `retailPrice` to `wholesalePrice`.
2.  **Margin Protection:** Ensure the system warns if a discount makes the selling price lower than the `costPrice`.
3.  **Persistence:** Since data is stored in the browser, implement a **"Backup Data"** button prominently to prevent data loss if the browser cache is cleared.
4.  **Responsive Design:** The POS should be usable on both a Desktop (for the counter) and a Tablet.

---

## 7. Future Scalability
* Ability to sync with a cloud database (Firebase/Supabase) if more branches are opened.
* Barcode scanner integration (HID mode).