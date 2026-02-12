// Initialize Dexie Database
const db = new Dexie('CosmeticPOSDB');

// Define Schema
db.version(1).stores({
    products: '++id, name, category, type, costPrice, retailPrice, wholesalePrice, stockQty, minStockLevel',
    sales: '++id, timestamp, customerType, totalAmount, discount, profit, *items', // *items for array indexing if needed, or just keep it simple
    vendors: '++id, name, contact, productCategories'
});

// Seed data if empty (Optional, for demo)
db.on('populate', () => {
    db.products.bulkAdd([
        { name: "Aloe Vera Gel", category: "Skincare", type: "In-house", costPrice: 200, retailPrice: 450, wholesalePrice: 350, stockQty: 50, minStockLevel: 10 },
        { name: "Matte Lipstick (Red)", category: "Makeup", type: "Vendor-supplied", costPrice: 500, retailPrice: 1200, wholesalePrice: 900, stockQty: 20, minStockLevel: 5 },
        { name: "Face Wash (Neem)", category: "Skincare", type: "Vendor-supplied", costPrice: 150, retailPrice: 350, wholesalePrice: 280, stockQty: 100, minStockLevel: 15 }
    ]);
    db.vendors.add({ name: "NatureSecrets Suppliers", contact: "077-1234567", productCategories: "Skincare" });
});

window.db = db; // Expose to window for app.js
