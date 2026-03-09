const User = require('../models/User');

async function protect(req, res, next) {
  try {
    const userId = req.session && req.session.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized. Please log in.'
      });
    }

    const user = await User.findById(userId).select('-password');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Session invalid. User not found.'
      });
    }

    req.user = user;
    return next();
  } catch (error) {
    return next(error);
  }
}

function restrictTo(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. You do not have permission.'
      });
    }
    return next();
  };
}

module.exports = { protect, restrictTo };
