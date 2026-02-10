# dSyncShop

Part of the dSync library family. dSyncShop provides a complete shop system on top of dSyncPay, handling products, categories, orders and automatic post-purchase actions. It creates and manages its own database tables and registers all routes automatically.

------

## Setup

```js
import dSyncShop from '@hackthedev/dsync-shop';
import dSyncSql from "@hackthedev/dsync-sql"
import dSyncPay from '@hackthedev/dsync-pay';

import express from "express";

const app = express();
const payments = new dSyncPay({...})
const db = new dSyncSql({...})

const shop = new dSyncShop({
    app,
    express,
    payments,   // dSyncPay instance
    db,         // dsync-sql instance
    basePath: '/shop',   // optional, default: '/shop'

    isAdmin: async (req) => {
        // return true or false
        return req.headers['x-api-key'] === 'your-secret';
    },

    enrichMetadata: async (req) => {
        // return an object that gets merged into payment metadata
        // return null to reject the request (401)
        const userId = req.headers['x-user-id'];
        const token = req.headers['x-token'];
        if (!userId || !token) return null;
        return { userId, token };
    },

    productActions: {
        'give_role': {
            label: 'Give Role',
            params: [
                { key: 'role', label: 'Role ID', type: 'text' }
            ],
            handler: async (metadata, product, params) => {
                // metadata contains everything from enrichMetadata + product_id
                // params contains the action_params set on the product
                await giveRole(metadata.userId, params.role);
            }
        }
    }
});
```

------

## Options

| option         | type           | required | description                                           |
| -------------- | -------------- | -------- | ----------------------------------------------------- |
| app            | object         | yes      | express app instance                                  |
| express        | object         | yes      | express module                                        |
| payments       | object         | yes      | dSyncPay instance                                     |
| db             | object         | yes      | dsync-sql instance                                    |
| basePath       | string         | no       | route prefix, default: '/shop'                        |
| isAdmin        | async function | yes      | called before admin routes, return true/false         |
| enrichMetadata | async function | no       | called before payment creation, return object or null |
| productActions | object         | no       | action definitions, see product actions section       |

------

## enrichMetadata

Called on every `POST /shop/payment/create` request. Use it to attach user data to the payment metadata server-side. The returned object gets merged into the metadata that dSyncPay carries through the payment flow and delivers to your callbacks.

Return `null` to abort the request with a 401.

```js
enrichMetadata: async (req) => {
    const userId = req.headers['x-user-id'];
    const token = req.headers['x-token'];
    if (!userId || !token) return null;

    const valid = await verifyToken(userId, token);
    if (!valid) return null;

    return { userId, token };
}
```

The client sends the headers:

```js
fetch('/shop/payment/create', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'x-user-id': '12345',
        'x-token': 'your-token'
    },
    body: JSON.stringify({ product_id: 1, payment_method: 'paypal' })
});
```

------

## Product Actions

Product actions let you define reusable logic that runs automatically after a successful purchase. Each action has a label, a list of params and a handler function.

```js
productActions: {
    'give_role': {
        label: 'Give Role',
        params: [
            { key: 'role', label: 'Role ID', type: 'text' }
        ],
        handler: async (metadata, product, params) => {
            await giveRole(metadata.userId, params.role);
        }
    },
    'remove_role': {
        label: 'Remove Role',
        params: [
            { key: 'role', label: 'Role ID', type: 'text' }
        ],
        handler: async (metadata, product, params) => {
            await removeRole(metadata.userId, params.role);
        }
    },
    'give_coins': {
        label: 'Give Coins',
        params: [
            { key: 'amount', label: 'Amount', type: 'number' }
        ],
        handler: async (metadata, product, params) => {
            await addCoins(metadata.userId, params.amount);
        }
    }
}
```

### Param types

| type   | description   |
| ------ | ------------- |
| text   | text input    |
| number | numeric input |

### Shorthand

If an action needs no params, you can pass a plain function instead of an object:

```js
productActions: {
    'do_something': async (metadata, product, params) => {
        // ...
    }
}
```

### Setting action params on a product

When creating or updating a product you set which action it uses and what params to pass:

```js
POST /shop/product/create
{
    "name": "Premium Role",
    "price": 9.99,
    "action": "give_role",
    "action_params": { "role": "123456789" }
}
```

------

## Routes

### Products

| method | route                         | auth   | description                    |
| ------ | ----------------------------- | ------ | ------------------------------ |
| GET    | /shop/products/list           | public | list all active products       |
| GET    | /shop/products/list/:category | public | list products by category name |
| GET    | /shop/product/:id             | public | get single product             |
| POST   | /shop/product/create          | admin  | create product                 |
| POST   | /shop/product/update/:id      | admin  | update product                 |
| DELETE | /shop/product/delete/:id      | admin  | delete product                 |

### Categories

| method | route                     | auth   | description         |
| ------ | ------------------------- | ------ | ------------------- |
| GET    | /shop/categories/list     | public | list all categories |
| POST   | /shop/category/create     | admin  | create category     |
| POST   | /shop/category/update/:id | admin  | update category     |
| DELETE | /shop/category/delete/:id | admin  | delete category     |

### Actions

| method | route              | auth  | description                             |
| ------ | ------------------ | ----- | --------------------------------------- |
| GET    | /shop/actions/list | admin | list all registered actions with params |

### Payments

| method | route                | auth           | description                                       |
| ------ | -------------------- | -------------- | ------------------------------------------------- |
| POST   | /shop/payment/create | enrichMetadata | create a paypal or coinbase payment for a product |

------

## Product Create / Update Body

```js
{
    name: 'Premium Role',         // required
    price: 9.99,                  // required
    description: '...',           // optional
    category_id: 1,               // optional
    image_url: 'https://...',     // optional
    stock: 0,                     // optional, default: 0
    active: 1,                    // optional, default: 1
    action: 'give_role',          // optional, must match a registered productAction key
    action_params: { role: '...' } // optional, object, stored as json
}
```

------

## Payment Create Body

```js
POST /shop/payment/create

{
    product_id: 1,
    payment_method: 'paypal'  // or 'crypto'
}
```

Response for paypal:

```js
{
    error: null,
    approvalUrl: 'https://paypal.com/...',
    orderId: '...'
}
```

Response for crypto:

```js
{
    error: null,
    hostedUrl: 'https://commerce.coinbase.com/...',
    chargeCode: '...'
}
```

------

## Database Tables

dSyncShop automatically creates and manages the following tables via `checkAndCreateTable`:

| table       | description                                   |
| ----------- | --------------------------------------------- |
| categories  | product categories with optional parent       |
| products    | products with action and action_params fields |
| orders      | completed, failed and cancelled orders        |
| order_items | line items per order                          |

------

## isAdmin

Called before every admin route. If not provided, all admin routes are public. Return `true` to allow, `false` to respond with 403.

```js
isAdmin: async (req) => {
    return req.headers['x-api-key'] === 'your-secret'; // or whatever
}
```

You can also use it as a standalone middleware in your own routes:

```js
app.get('/something', shop.adminMiddleware(), (req, res) => {
    res.json({ ok: true });
});
```
