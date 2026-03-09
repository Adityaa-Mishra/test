const bcrypt = require('bcrypt');
const User = require('../models/User');
const Provider = require('../models/Provider');

function sanitizeUser(userDoc) {
  return {
    _id: userDoc._id,
    name: userDoc.name,
    email: userDoc.email,
    role: userDoc.role,
    createdAt: userDoc.createdAt
  };
}

function createSession(req, user) {
  return new Promise((resolve, reject) => {
    req.session.userId = user._id.toString();
    req.session.role = user.role;
    req.session.save((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function register(req, res, next) {
  try {
    const { name, email, password, role, providerProfile } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'name, email and password are required.'
      });
    }

    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'Email already exists.'
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const safeRole = role === 'provider' ? 'provider' : 'user';

    if (safeRole === 'provider') {
      const profile = providerProfile || {};
      if (!profile.serviceType || !profile.description || profile.pricePerHour == null || !profile.location) {
        return res.status(400).json({
          success: false,
          message: 'Provider profile is incomplete. serviceType, description, pricePerHour and location are required.'
        });
      }
    }

    const user = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      role: safeRole
    });

    if (safeRole === 'provider') {
      try {
        const profile = providerProfile || {};
        await Provider.create({
          user: user._id,
          serviceType: String(profile.serviceType).trim(),
          description: String(profile.description).trim(),
          pricePerHour: Number(profile.pricePerHour),
          location: String(profile.location).trim()
        });
      } catch (providerError) {
        await User.findByIdAndDelete(user._id);
        return res.status(400).json({
          success: false,
          message: providerError.message || 'Failed to create provider profile.'
        });
      }
    }

    await createSession(req, user);

    return res.status(201).json({
      success: true,
      data: sanitizeUser(user)
    });
  } catch (error) {
    return next(error);
  }
}

async function login(req, res, next) {
  try {
    const { email, password, role } = req.body;
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'email and password are required.'
      });
    }

    if (role && role !== 'user' && role !== 'provider' && role !== 'admin') {
      return res.status(400).json({
        success: false,
        message: 'Invalid role preference.'
      });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials.'
      });
    }

    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials.'
      });
    }

    if (role && user.role !== role) {
      return res.status(401).json({
        success: false,
        message: `No ${role} account found with these credentials.`
      });
    }

    await createSession(req, user);

    return res.status(200).json({
      success: true,
      data: sanitizeUser(user)
    });
  } catch (error) {
    return next(error);
  }
}

async function logout(req, res, next) {
  try {
    if (!req.session) {
      return res.status(200).json({
        success: true,
        data: { message: 'Logged out.' }
      });
    }

    return req.session.destroy((error) => {
      if (error) return next(error);
      res.clearCookie('sid');
      return res.status(200).json({
        success: true,
        data: { message: 'Logged out.' }
      });
    });
  } catch (error) {
    return next(error);
  }
}

async function me(req, res, next) {
  try {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized.'
      });
    }

    const user = await User.findById(req.session.userId).select('-password');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized.'
      });
    }

    return res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    return next(error);
  }
}

async function updateProfile(req, res, next) {
  try {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized.'
      });
    }

    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.'
      });
    }

    const { name, email, providerProfile } = req.body;

    if (name !== undefined) {
      if (!String(name).trim()) {
        return res.status(400).json({
          success: false,
          message: 'name cannot be empty.'
        });
      }
      user.name = String(name).trim();
    }

    if (email !== undefined) {
      const nextEmail = String(email).toLowerCase().trim();
      if (!nextEmail) {
        return res.status(400).json({
          success: false,
          message: 'email cannot be empty.'
        });
      }
      const existing = await User.findOne({ email: nextEmail, _id: { $ne: user._id } });
      if (existing) {
        return res.status(409).json({
          success: false,
          message: 'Email already in use.'
        });
      }
      user.email = nextEmail;
    }

    await user.save();

    let providerData = null;
    if (user.role === 'provider') {
      const provider = await Provider.findOne({ user: user._id });
      if (provider) {
        if (providerProfile && typeof providerProfile === 'object') {
          const { serviceType, description, pricePerHour, location } = providerProfile;
          if (serviceType !== undefined) provider.serviceType = String(serviceType).trim();
          if (description !== undefined) provider.description = String(description).trim();
          if (pricePerHour !== undefined) provider.pricePerHour = Number(pricePerHour);
          if (location !== undefined) provider.location = String(location).trim();
          await provider.save();
        }
        providerData = provider;
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        user: sanitizeUser(user),
        provider: providerData
      }
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  register,
  login,
  logout,
  me,
  updateProfile
};
