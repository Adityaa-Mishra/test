# MyHomeMistri 🏠

A home services marketplace connecting users with verified service providers.

## Project Structure

```
myhomemistri/
├── backend/          ← Node.js + Express + MongoDB API
│   ├── server.js
│   ├── config/       ← DB connection
│   ├── controllers/  ← Route logic
│   ├── middleware/   ← Auth, upload middleware
│   ├── models/       ← Mongoose schemas
│   ├── routes/       ← API routes
│   ├── uploads/      ← Uploaded files (provider works, chat attachments)
│   ├── .env          ← Environment variables
│   └── package.json
└── frontend/         ← Redesigned HTML/CSS/JS frontend
    ├── index.html
    ├── login.html
    ├── register.html
    ├── providers.html
    ├── provider-details.html
    ├── provider-dashboard.html
    ├── user-dashboard.html
    ├── chat.html
    ├── css/          ← All stylesheets
    └── js/           ← All JavaScript files
```

## Running the Backend

```bash
cd backend
npm install
npm start
# Server runs on http://localhost:5000
```

## Running the Frontend

Open any HTML file directly in a browser, or use a local server:
```bash
cd frontend
npx serve .
# or use VS Code Live Server extension
```

## Environment Variables (backend/.env)

| Variable | Description |
|---|---|
| `PORT` | Server port (default 5000) |
| `MONGO_URI` | MongoDB Atlas connection string |
| `SESSION_SECRET` | Express session secret |
| `FRONTEND_URLS` | Comma-separated allowed frontend origins |
| `NODE_ENV` | `development` or `production` |
