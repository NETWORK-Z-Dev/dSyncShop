import path from "path";
import { fileURLToPath } from "url";

export default class dSyncShop {
    constructor({
                    app = null,
                    express = null,
                    payments = null,
                    db = null,
                    basePath = '/shop',
                } = {}) {

        if(!app) throw new Error("missing express app instance");
        if(!express) throw new Error("missing express");
        if(!payments) throw new Error("missing payments");
        if(!db) throw new Error("missing db");

        this.app = app;
        this.express = express;
        this.payments = payments;
        this.basePath = basePath;
        this.db = db;

        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);

        const staticDir = path.join(__dirname, "web");

        // payment event handlers
        if (this.payments) {
            const originalOnPaymentCompleted = this.payments.onPaymentCompleted;
            const originalOnPaymentFailed = this.payments.onPaymentFailed;
            const originalOnPaymentCancelled = this.payments.onPaymentCancelled;

            this.payments.onPaymentCompleted = async (data) => {
                console.log('[dSyncShop] payment completed:', data);

                if (originalOnPaymentCompleted) {
                    originalOnPaymentCompleted(data);
                }

                // dann order erstellen
                await this.createOrder({ ...data, status: 'COMPLETED' });
            };

            this.payments.onPaymentFailed = async (data) => {
                console.log('[dSyncShop] payment failed:', data);

                if (originalOnPaymentFailed) {
                    originalOnPaymentFailed(data);
                }

                await this.createOrder({ ...data, status: 'FAILED' });
            };

            this.payments.onPaymentCancelled = async (data) => {
                console.log('[dSyncShop] payment cancelled:', data);

                if (originalOnPaymentCancelled) {
                    originalOnPaymentCancelled(data);
                }

                await this.createOrder({ ...data, status: 'CANCELLED' });
            };
        }

        app.use(
            basePath,
            express.static(staticDir)
        );

        this.registerRoutes();
        this.initDB();
    }

    async createOrder(paymentData) {
        const { metadata, pricing, amount, paymentId, status, provider } = paymentData;

        // amount könnte auch in pricing sein (bei coinbase)
        const finalAmount = amount || (pricing?.local?.amount ? parseFloat(pricing.local.amount) : 0);

        // payment status zu order status mappen
        let orderStatus = 'pending';
        if (status === 'COMPLETED' || status === 'confirmed') {
            orderStatus = 'completed';
        } else if (status === 'failed' || status === 'FAILED') {
            orderStatus = 'failed';
        } else if (status === 'cancelled' || status === 'CANCELLED') {
            orderStatus = 'cancelled';
        }

        // check if metadata has product_id
        if (!metadata || !metadata.product_id) {
            console.error('no product_id in metadata:', paymentData);
            return;
        }

        // order in db speichern
        const result = await this.db.queryDatabase(
            "insert into orders (total_amount, status, payment_method, payment_id) values (?, ?, ?, ?)",
            [finalAmount, orderStatus, provider, paymentId]
        );

        // order_items erstellen
        await this.db.queryDatabase(
            "insert into order_items (order_id, product_id, quantity, price) values (?, ?, ?, ?)",
            [result.insertId, metadata.product_id, 1, finalAmount]
        );

        return result;
    }

    async initDB(){
        const shopTables = [
            {
                name: "categories",
                columns: [
                    {name: "id", type: "int(12) NOT NULL AUTO_INCREMENT PRIMARY KEY"},
                    {name: "name", type: "varchar(255) NOT NULL"},
                    {name: "description", type: "text"},
                    {name: "parent_id", type: "int(12)"},
                    {name: "created_at", type: "bigint NOT NULL DEFAULT (UNIX_TIMESTAMP() * 1000)"}
                ],
                keys: [
                    {name: "UNIQUE KEY", type: "name (name)"},
                    {name: "FOREIGN KEY", type: "(parent_id) REFERENCES categories(id) ON DELETE SET NULL"}
                ]
            },
            {
                name: "products",
                columns: [
                    {name: "id", type: "int(12) NOT NULL AUTO_INCREMENT PRIMARY KEY"},
                    {name: "name", type: "varchar(255) NOT NULL"},
                    {name: "description", type: "text"},
                    {name: "price", type: "decimal(10,2) NOT NULL"},
                    {name: "category_id", type: "int(12)"},
                    {name: "image_url", type: "varchar(512)"},
                    {name: "stock", type: "int(12) NOT NULL DEFAULT 0"},
                    {name: "active", type: "tinyint(1) NOT NULL DEFAULT 1"},
                    {name: "created_at", type: "bigint NOT NULL DEFAULT (UNIX_TIMESTAMP() * 1000)"}
                ],
                keys: [
                    {name: "INDEX", type: "category_id (category_id)"},
                    {name: "INDEX", type: "active (active)"},
                    {name: "FOREIGN KEY", type: "(category_id) REFERENCES categories(id) ON DELETE SET NULL"}
                ]
            },
            {
                name: "orders",
                columns: [
                    {name: "id", type: "int(12) NOT NULL AUTO_INCREMENT PRIMARY KEY"},
                    {name: "customer_email", type: "varchar(255) NOT NULL"},
                    {name: "customer_name", type: "varchar(255)"},
                    {name: "total_amount", type: "decimal(10,2) NOT NULL"},
                    {name: "status", type: "varchar(50) NOT NULL DEFAULT 'pending'"},
                    {name: "payment_method", type: "varchar(50)"},
                    {name: "payment_id", type: "varchar(255)"},
                    {name: "created_at", type: "bigint NOT NULL DEFAULT (UNIX_TIMESTAMP() * 1000)"}
                ],
                keys: [
                    {name: "INDEX", type: "customer_email (customer_email)"},
                    {name: "INDEX", type: "status (status)"},
                    {name: "INDEX", type: "payment_id (payment_id)"}
                ]
            },
            {
                name: "order_items",
                columns: [
                    {name: "id", type: "int(12) NOT NULL AUTO_INCREMENT PRIMARY KEY"},
                    {name: "order_id", type: "int(12) NOT NULL"},
                    {name: "product_id", type: "int(12) NOT NULL"},
                    {name: "quantity", type: "int(12) NOT NULL"},
                    {name: "price", type: "decimal(10,2) NOT NULL"},
                    {name: "created_at", type: "bigint NOT NULL DEFAULT (UNIX_TIMESTAMP() * 1000)"}
                ],
                keys: [
                    {name: "INDEX", type: "order_id (order_id)"},
                    {name: "INDEX", type: "product_id (product_id)"},
                    {name: "FOREIGN KEY", type: "(order_id) REFERENCES orders(id) ON DELETE CASCADE"},
                    {name: "FOREIGN KEY", type: "(product_id) REFERENCES products(id) ON DELETE CASCADE"}
                ]
            }
        ];

        for (const table of shopTables) {
            await this.db.checkAndCreateTable(table);
        }
    }

    registerRoutes(){
        this.createProductRoutes();
        this.createCategoryRoutes();
        this.createPaymentRoute();
    }

    createPaymentRoute() {
        this.app.post(`${this.basePath}/payment/create`, this.express.json(), async (req, res) => {
            try {
                const { product_id, payment_method } = req.body;

                const products = await this.db.queryDatabase(
                    "select * from products where id = ?",
                    [product_id]
                );

                if (products.length === 0) {
                    return res.status(404).json({ error: "product not found" });
                }

                const product = products[0];

                // create payment
                if (payment_method === 'paypal') {
                    const order = await this.payments.paypal.createOrder({
                        title: product.name,
                        price: parseFloat(product.price),
                        metadata: { product_id: product.id }
                    });

                    return res.status(200).json({
                        error: null,
                        approvalUrl: order.approvalUrl,
                        orderId: order.orderId
                    });
                } // coinbase
                else if (payment_method === 'crypto') {
                    const charge = await this.payments.coinbase.createCharge({
                        title: product.name,
                        price: parseFloat(product.price),
                        metadata: { product_id: product.id }
                    });

                    return res.status(200).json({
                        error: null,
                        hostedUrl: charge.hostedUrl,
                        chargeCode: charge.chargeCode
                    });
                }
            } catch (error) {
                return res.status(500).json({ error: error.message });
            }
        });
    }

    createProductRoutes(){
        this.app.get(`${this.basePath}/products/list`, async (req, res) => {
            try {
                const products = await this.db.queryDatabase(
                    "select p.*, c.name as category_name from products p left join categories c on p.category_id = c.id where p.active = ? order by p.created_at desc",
                    [1]
                );
                return res.status(200).json({ error: null, products });
            } catch (error) {
                return res.status(500).json({ error: error.message, products: [] });
            }
        });

        this.app.get(`${this.basePath}/products/list/:category`, async (req, res) => {
            try {
                const { category } = req.params;
                const products = await this.db.queryDatabase(
                    "select p.*, c.name as category_name from products p left join categories c on p.category_id = c.id where p.active = ? and c.name = ? order by p.created_at desc",
                    [1, category]
                );
                return res.status(200).json({ error: null, products });
            } catch (error) {
                return res.status(500).json({ error: error.message, products: [] });
            }
        });

        this.app.get(`${this.basePath}/product/:id`, async (req, res) => {
            try {
                const { id } = req.params;
                const products = await this.db.queryDatabase(
                    "select p.*, c.name as category_name from products p left join categories c on p.category_id = c.id where p.id = ?",
                    [id]
                );

                if (products.length === 0) {
                    return res.status(404).json({ error: "product not found", product: null });
                }

                return res.status(200).json({ error: null, product: products[0] });
            } catch (error) {
                return res.status(500).json({ error: error.message, product: null });
            }
        });

        this.app.post(`${this.basePath}/product/create`, this.express.json(), async (req, res) => {
            try {
                const { name, description, price, category_id, image_url, stock, active } = req.body;

                if (!name || !price) {
                    return res.status(400).json({ error: "name and price are required", product: null });
                }

                const result = await this.db.queryDatabase(
                    "insert into products (name, description, price, category_id, image_url, stock, active) values (?, ?, ?, ?, ?, ?, ?)",
                    [name, description || null, price, category_id || null, image_url || null, stock || 0, active !== undefined ? active : 1]
                );

                const products = await this.db.queryDatabase(
                    "select * from products where id = ?",
                    [result.insertId]
                );

                return res.status(201).json({ error: null, product: products[0] });
            } catch (error) {
                return res.status(500).json({ error: error.message, product: null });
            }
        });

        this.app.post(`${this.basePath}/product/update/:id`, this.express.json(), async (req, res) => {
            try {
                const { id } = req.params;
                const { name, description, price, category_id, image_url, stock, active } = req.body;

                await this.db.queryDatabase(
                    "update products set name = ?, description = ?, price = ?, category_id = ?, image_url = ?, stock = ?, active = ? where id = ?",
                    [name, description, price, category_id, image_url, stock, active, id]
                );

                const products = await this.db.queryDatabase(
                    "select * from products where id = ?",
                    [id]
                );

                if (products.length === 0) {
                    return res.status(404).json({ error: "product not found", product: null });
                }

                return res.status(200).json({ error: null, product: products[0] });
            } catch (error) {
                return res.status(500).json({ error: error.message, product: null });
            }
        });

        this.app.delete(`${this.basePath}/product/delete/:id`, async (req, res) => {
            try {
                const { id } = req.params;

                const products = await this.db.queryDatabase(
                    "select * from products where id = ?",
                    [id]
                );

                if (products.length === 0) {
                    return res.status(404).json({ error: "product not found", success: false });
                }

                await this.db.queryDatabase(
                    "delete from products where id = ?",
                    [id]
                );

                return res.status(200).json({ error: null, success: true });
            } catch (error) {
                return res.status(500).json({ error: error.message, success: false });
            }
        });
    }

    createCategoryRoutes(){
        this.app.get(`${this.basePath}/categories/list`, async (req, res) => {
            try {
                const categories = await this.db.queryDatabase(
                    "select * from categories order by name",
                    []
                );
                return res.status(200).json({ error: null, categories });
            } catch (error) {
                return res.status(500).json({ error: error.message, categories: [] });
            }
        });

        this.app.post(`${this.basePath}/category/create`, this.express.json(), async (req, res) => {
            try {
                const { name, description, parent_id } = req.body;

                if (!name) {
                    return res.status(400).json({ error: "name is required", category: null });
                }

                const result = await this.db.queryDatabase(
                    "insert into categories (name, description, parent_id) values (?, ?, ?)",
                    [name, description || null, parent_id || null]
                );

                const categories = await this.db.queryDatabase(
                    "select * from categories where id = ?",
                    [result.insertId]
                );

                return res.status(201).json({ error: null, category: categories[0] });
            } catch (error) {
                return res.status(500).json({ error: error.message, category: null });
            }
        });

        this.app.post(`${this.basePath}/category/update/:id`, this.express.json(), async (req, res) => {
            try {
                const { id } = req.params;
                const { name, description, parent_id } = req.body;

                await this.db.queryDatabase(
                    "update categories set name = ?, description = ?, parent_id = ? where id = ?",
                    [name, description, parent_id, id]
                );

                const categories = await this.db.queryDatabase(
                    "select * from categories where id = ?",
                    [id]
                );

                if (categories.length === 0) {
                    return res.status(404).json({ error: "category not found", category: null });
                }

                return res.status(200).json({ error: null, category: categories[0] });
            } catch (error) {
                return res.status(500).json({ error: error.message, category: null });
            }
        });

        this.app.delete(`${this.basePath}/category/delete/:id`, async (req, res) => {
            try {
                const { id } = req.params;

                const categories = await this.db.queryDatabase(
                    "select * from categories where id = ?",
                    [id]
                );

                if (categories.length === 0) {
                    return res.status(404).json({ error: "category not found", success: false });
                }

                await this.db.queryDatabase(
                    "delete from categories where id = ?",
                    [id]
                );

                return res.status(200).json({ error: null, success: true });
            } catch (error) {
                return res.status(500).json({ error: error.message, success: false });
            }
        });
    }
}