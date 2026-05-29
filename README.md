# The.Pouches

Curbside pickup shop. Built with Express + PostgreSQL.

## Deploy to Railway

### 1. Push this repo to GitHub

### 2. Create project on Railway
- railway.app → New Project → Deploy from GitHub repo
- Select this repo

### 3. Add a PostgreSQL database
- In your Railway project → New → Database → PostgreSQL
- Railway will automatically set `DATABASE_URL` in your environment

### 4. Set environment variables
In Railway → your service → Variables, add:

| Variable | Value |
|----------|-------|
| `ADMIN_PASSWORD` | your chosen admin password |
| `JWT_SECRET` | any long random string |
| `NODE_ENV` | `production` |

### 5. Deploy
Railway will build and deploy automatically on every git push.

## Local development

```bash
npm install
DATABASE_URL=postgresql://... ADMIN_PASSWORD=admin123 JWT_SECRET=devsecret node server.js
```

## Admin access

- Visit `/admin.html` for the standalone admin dashboard
- Or triple-click the logo on the main shop to log in inline

## File structure

```
server.js        ← Express backend
package.json
index.html       ← Customer shop
admin.html       ← Admin dashboard
css/
  styles.css     ← Shared styles
  admin.css      ← Admin-only styles
js/
  shared.js      ← State, API, utilities
  shop.js        ← Cart, grid, order placement
  admin.js       ← Orders, financials, products, schedule
```
