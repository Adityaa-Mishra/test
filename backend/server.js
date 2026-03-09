const express = require('express');
const cors = require('cors');
const session = require('express-session');
const dotenv = require('dotenv');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const path = require('path');

const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const providerRoutes = require('./routes/providerRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const chatRoutes = require('./routes/chatRoutes');

dotenv.config();

const app = express();

const PORT = Number(process.env.PORT || 5000);
const FRONTEND_URLS = (process.env.FRONTEND_URLS || process.env.FRONTEND_URL || 'http://localhost:3000')
  .split(',')
  .map((x) => x.trim())
  .filter(Boolean);
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

if (IS_PRODUCTION) {
  // Required when running behind Render/NGINX so secure session cookies are set correctly.
  app.set('trust proxy', 1);
}

app.use(
  cors({
    origin(origin, callback) {
      // Allow non-browser clients / curl / Postman (no origin header)
      if (!origin) return callback(null, true);

      // Some local setups (file://) send "null" origin
      if (origin === 'null') return callback(null, true);

      if (FRONTEND_URLS.includes(origin)) return callback(null, true);
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use(
  session({
    name: 'sid',
    secret: process.env.SESSION_SECRET || 'fallback_session_secret',
    resave: false,
    saveUninitialized: false,
    proxy: IS_PRODUCTION,
    cookie: {
      httpOnly: true,
      // For development, allow cookies on cross-origin requests
      sameSite: 'none',
      secure: false,
      domain: 'localhost',
      maxAge: 1000 * 60 * 60 * 24
    }
  })
);

app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      status: 'ok',
      dbReadyState: mongoose.connection.readyState
    }
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/providers', providerRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/chat', chatRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found.'
  });
});

app.use((error, req, res, next) => {
  const statusCode = error.statusCode || 500;
  return res.status(statusCode).json({
    success: false,
    message: error.message || 'Internal Server Error'
  });
});

function getRegisteredRoutes(expressApp) {
  const routes = [];

  expressApp._router.stack.forEach((layer) => {
    if (layer.route && layer.route.path) {
      const methods = Object.keys(layer.route.methods).map((m) => m.toUpperCase());
      methods.forEach((method) => routes.push(`${method} ${layer.route.path}`));
    }

    if (layer.name === 'router' && layer.handle && layer.handle.stack) {
      const rawBase = layer.regexp && layer.regexp.source ? layer.regexp.source : '';
      const baseMatch = rawBase.match(/\\\/api\\\/[a-z]+/i);
      const basePath = baseMatch ? baseMatch[0].replace(/\\\//g, '/') : '';

      layer.handle.stack.forEach((nestedLayer) => {
        if (nestedLayer.route && nestedLayer.route.path) {
          const methods = Object.keys(nestedLayer.route.methods).map((m) => m.toUpperCase());
          methods.forEach((method) => routes.push(`${method} ${basePath}${nestedLayer.route.path}`));
        }
      });
    }
  });

  return routes;
}

function createHttpClient(baseUrl) {
  let cookie = '';

  async function request(path, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };
    if (cookie) headers.Cookie = cookie;

    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      cookie = setCookie.split(';')[0];
    }

    let json = null;
    try {
      json = await response.json();
    } catch (e) {
      json = null;
    }

    return { response, json };
  }

  return {
    request,
    resetCookie() {
      cookie = '';
    }
  };
}

async function runSelfChecks(baseUrl) {
  const checks = [];
  const markPass = (name) => checks.push({ name, ok: true });
  const markFail = (name, reason) => checks.push({ name, ok: false, reason });

  function assertOrThrow(condition, message) {
    if (!condition) throw new Error(message);
  }

  const userEmail = `selfcheck.user.${Date.now()}@example.com`;
  const providerEmail = `selfcheck.provider.${Date.now()}@example.com`;
  const password = 'Password@123';
  const providerClient = createHttpClient(baseUrl);
  const userClient = createHttpClient(baseUrl);
  const anonClient = createHttpClient(baseUrl);

  try {
    const routeSmokeCases = [
      { method: 'POST', path: '/api/auth/register', body: {} },
      { method: 'POST', path: '/api/auth/login', body: {} },
      { method: 'POST', path: '/api/auth/logout', body: {} },
      { method: 'GET', path: '/api/auth/me' },
      { method: 'GET', path: '/api/providers' },
      { method: 'GET', path: '/api/providers/000000000000000000000000' },
      { method: 'POST', path: '/api/providers', body: {} },
      { method: 'PUT', path: '/api/providers/000000000000000000000000', body: {} },
      { method: 'DELETE', path: '/api/providers/000000000000000000000000' },
      { method: 'POST', path: '/api/bookings', body: {} },
      { method: 'GET', path: '/api/bookings/my' },
      { method: 'PUT', path: '/api/bookings/000000000000000000000000/status', body: {} },
      { method: 'POST', path: '/api/reviews', body: {} },
      { method: 'GET', path: '/api/reviews/000000000000000000000000' },
      { method: 'GET', path: '/api/chat/conversations' },
      { method: 'GET', path: '/api/chat/messages/000000000000000000000000' },
      { method: 'POST', path: '/api/chat/messages', body: {} },
      { method: 'PUT', path: '/api/chat/messages/000000000000000000000000/read', body: {} }
    ];

    for (const testCase of routeSmokeCases) {
      const result = await fetch(`${baseUrl}${testCase.path}`, {
        method: testCase.method,
        headers: { 'Content-Type': 'application/json' },
        body: testCase.body ? JSON.stringify(testCase.body) : undefined
      });
      assertOrThrow(result.status !== 404, `Route missing: ${testCase.method} ${testCase.path}`);
    }

    const registeredRoutes = getRegisteredRoutes(app);
    assertOrThrow(registeredRoutes.length > 0, 'Route table introspection failed.');
    markPass('All routes are registered');
  } catch (error) {
    markFail('All routes are registered', error.message);
  }

  try {
    assertOrThrow(mongoose.connection.readyState === 1, 'Database is not connected.');
    markPass('DB connects successfully');
  } catch (error) {
    markFail('DB connects successfully', error.message);
  }

  try {
    const hash = await bcrypt.hash('hello123', 10);
    const match = await bcrypt.compare('hello123', hash);
    assertOrThrow(match, 'bcrypt compare failed.');
    markPass('Password hashing works');
  } catch (error) {
    markFail('Password hashing works', error.message);
  }

  let providerId = null;
  let bookingId = null;

  try {
    await userClient.request('/api/auth/register', {
      method: 'POST',
      body: {
        name: 'Self Check User',
        email: userEmail,
        password,
        role: 'user'
      }
    });
    userClient.resetCookie();

    const loginResult = await userClient.request('/api/auth/login', {
      method: 'POST',
      body: {
        email: userEmail,
        password
      }
    });
    assertOrThrow(loginResult.response.status === 200, 'User login failed.');

    const meResult = await userClient.request('/api/auth/me');
    assertOrThrow(meResult.response.status === 200, 'Session did not persist after login.');
    markPass('Session persists after login');
  } catch (error) {
    markFail('Session persists after login', error.message);
  }

  try {
    const unauthResult = await anonClient.request('/api/bookings/my');
    assertOrThrow(unauthResult.response.status === 401, 'Protected route allowed unauthorized access.');
    markPass('Protected routes reject unauthorized access');
  } catch (error) {
    markFail('Protected routes reject unauthorized access', error.message);
  }

  try {
    const roleResult = await userClient.request('/api/providers', {
      method: 'POST',
      body: {
        serviceType: 'electrician',
        description: 'Test',
        pricePerHour: 300,
        location: 'Delhi'
      }
    });
    assertOrThrow(roleResult.response.status === 403, 'Role restriction failed for provider-only route.');
    markPass('Role restriction works');
  } catch (error) {
    markFail('Role restriction works', error.message);
  }

  try {
    await providerClient.request('/api/auth/register', {
      method: 'POST',
      body: {
        name: 'Self Check Provider',
        email: providerEmail,
        password,
        role: 'provider'
      }
    });
    providerClient.resetCookie();

    const loginProvider = await providerClient.request('/api/auth/login', {
      method: 'POST',
      body: {
        email: providerEmail,
        password
      }
    });
    assertOrThrow(loginProvider.response.status === 200, 'Provider login failed.');

    const providerCreate = await providerClient.request('/api/providers', {
      method: 'POST',
      body: {
        serviceType: 'electrician',
        description: 'Self-check provider profile',
        pricePerHour: 650,
        location: 'Delhi'
      }
    });

    assertOrThrow(providerCreate.response.status === 201, 'Provider profile creation failed.');
    providerId = providerCreate.json && providerCreate.json.data && providerCreate.json.data._id;
    assertOrThrow(!!providerId, 'Provider ID missing after creation.');

    const userBooking = await userClient.request('/api/bookings', {
      method: 'POST',
      body: {
        provider: providerId,
        date: new Date(Date.now() + 86400000).toISOString()
      }
    });
    assertOrThrow(userBooking.response.status === 201, 'Booking creation failed.');
    bookingId = userBooking.json && userBooking.json.data && userBooking.json.data._id;
    assertOrThrow(!!bookingId, 'Booking ID missing.');

    const setAccepted = await providerClient.request(`/api/bookings/${bookingId}/status`, {
      method: 'PUT',
      body: { status: 'accepted' }
    });
    assertOrThrow(setAccepted.response.status === 200, 'Provider failed to set booking accepted.');

    const setCompleted = await providerClient.request(`/api/bookings/${bookingId}/status`, {
      method: 'PUT',
      body: { status: 'completed' }
    });
    assertOrThrow(setCompleted.response.status === 200, 'Provider failed to set booking completed.');

    const reviewCreate = await userClient.request('/api/reviews', {
      method: 'POST',
      body: {
        provider: providerId,
        rating: 5,
        comment: 'Excellent service.'
      }
    });
    assertOrThrow(reviewCreate.response.status === 201, 'Review creation failed.');

    const providerDetails = await userClient.request(`/api/providers/${providerId}`);
    assertOrThrow(providerDetails.response.status === 200, 'Provider details fetch failed after review.');
    const rating = providerDetails.json && providerDetails.json.data && providerDetails.json.data.rating;
    assertOrThrow(Number(rating) >= 5, 'Provider rating did not update after review.');

    markPass('Provider rating updates after review');
  } catch (error) {
    markFail('Provider rating updates after review', error.message);
  }

  console.log('========== SELF CHECK REPORT ==========');
  checks.forEach((item) => {
    if (item.ok) {
      console.log(`PASS: ${item.name}`);
    } else {
      console.log(`FAIL: ${item.name} -> ${item.reason}`);
    }
  });
  console.log('=======================================');
}

async function startServer() {
  await connectDB();

  const server = app.listen(PORT, async () => {
    console.log(`Server running on http://localhost:${PORT}`);

    if (String(process.env.RUN_SELF_CHECKS).toLowerCase() === 'true') {
      try {
        await runSelfChecks(`http://localhost:${PORT}`);
      } catch (error) {
        console.error('Self-check runner crashed:', error.message);
      }
    }
  });

  return server;
}

startServer().catch((error) => {
  console.error('Failed to start server:', error.message);
  process.exit(1);
});
