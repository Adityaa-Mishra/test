const Provider = require('../models/Provider');
const ProviderWork = require('../models/ProviderWork');
const Booking = require('../models/Booking');
const Review = require('../models/Review');

async function getProviders(req, res, next) {
  try {
    const { serviceType, location } = req.query;
    const filter = { isApproved: true };

    if (serviceType) {
      filter.serviceType = { $regex: new RegExp(serviceType, 'i') };
    }

    if (location) {
      filter.location = { $regex: new RegExp(location, 'i') };
    }

    const providers = await Provider.find(filter).populate('user', 'name email');
    return res.status(200).json({
      success: true,
      data: providers
    });
  } catch (error) {
    return next(error);
  }
}

async function getProviderById(req, res, next) {
  try {
    const provider = await Provider.findById(req.params.id).populate('user', 'name email');
    if (!provider) {
      return res.status(404).json({
        success: false,
        message: 'Provider not found.'
      });
    }

    if (!provider.isApproved) {
      return res.status(404).json({
        success: false,
        message: 'Provider not found.'
      });
    }

    const [reviewsCount, totalBookings, completedBookings] = await Promise.all([
      Review.countDocuments({ provider: provider._id }),
      Booking.countDocuments({ provider: provider._id }),
      Booking.countDocuments({ provider: provider._id, status: 'completed' })
    ]);

    const onTimeRate = totalBookings > 0 ? Math.round((completedBookings / totalBookings) * 100) : 0;
    const payload = provider.toObject();
    payload.stats = {
      reviewsCount,
      jobsDone: completedBookings,
      onTimeRate
    };

    return res.status(200).json({
      success: true,
      data: payload
    });
  } catch (error) {
    return next(error);
  }
}

async function createProvider(req, res, next) {
  try {
    const { serviceType, description, pricePerHour, location } = req.body;
    if (!serviceType || !description || pricePerHour == null || !location) {
      return res.status(400).json({
        success: false,
        message: 'serviceType, description, pricePerHour and location are required.'
      });
    }

    const existing = await Provider.findOne({ user: req.user._id });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'Provider profile already exists for this user.'
      });
    }

    const provider = await Provider.create({
      user: req.user._id,
      serviceType: serviceType.trim(),
      description: description.trim(),
      pricePerHour: Number(pricePerHour),
      location: location.trim()
    });

    return res.status(201).json({
      success: true,
      data: provider
    });
  } catch (error) {
    return next(error);
  }
}

async function updateProvider(req, res, next) {
  try {
    const provider = await Provider.findById(req.params.id);
    if (!provider) {
      return res.status(404).json({
        success: false,
        message: 'Provider not found.'
      });
    }

    const isOwner = provider.user.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';
    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'You can update only your own provider profile.'
      });
    }

    const allowedFields = ['serviceType', 'description', 'pricePerHour', 'location', 'isApproved'];
    for (const key of allowedFields) {
      if (req.body[key] !== undefined) {
        if (key === 'isApproved' && !isAdmin) continue;
        provider[key] = req.body[key];
      }
    }

    await provider.save();

    return res.status(200).json({
      success: true,
      data: provider
    });
  } catch (error) {
    return next(error);
  }
}

async function deleteProvider(req, res, next) {
  try {
    const provider = await Provider.findById(req.params.id);
    if (!provider) {
      return res.status(404).json({
        success: false,
        message: 'Provider not found.'
      });
    }

    const isOwner = provider.user.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';
    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'You can delete only your own provider profile.'
      });
    }

    await provider.deleteOne();

    return res.status(200).json({
      success: true,
      data: { message: 'Provider deleted.' }
    });
  } catch (error) {
    return next(error);
  }
}

async function getMyProviderProfile(req, res, next) {
  try {
    const provider = await Provider.findOne({ user: req.user._id }).populate('user', 'name email role');
    if (!provider) {
      return res.status(404).json({
        success: false,
        message: 'Provider profile not found.'
      });
    }

    return res.status(200).json({
      success: true,
      data: provider
    });
  } catch (error) {
    return next(error);
  }
}

async function createProviderWork(req, res, next) {
  try {
    const { caption } = req.body;
    if (!caption || !String(caption).trim()) {
      return res.status(400).json({
        success: false,
        message: 'caption is required.'
      });
    }

    const words = String(caption).trim().split(/\s+/).filter(Boolean);
    if (words.length > 50) {
      return res.status(400).json({
        success: false,
        message: 'caption must not exceed 50 words.'
      });
    }

    const provider = await Provider.findOne({ user: req.user._id });
    if (!provider) {
      return res.status(404).json({
        success: false,
        message: 'Provider profile not found.'
      });
    }

    let sanitizedMedia = [];

    if (Array.isArray(req.files) && req.files.length) {
      sanitizedMedia = req.files.map((file) => ({
        name: String(file.originalname || file.filename || '').trim(),
        type: String(file.mimetype || '').trim(),
        size: Number(file.size || 0),
        url: `/uploads/provider-works/${file.filename}`
      }));
    } else {
      let mediaPayload = req.body.media;
      if (typeof mediaPayload === 'string') {
        try {
          mediaPayload = JSON.parse(mediaPayload);
        } catch {
          mediaPayload = [];
        }
      }

      if (Array.isArray(mediaPayload)) {
        sanitizedMedia = mediaPayload
          .filter((m) => m && m.name && m.type)
          .map((m) => ({
            name: String(m.name).trim(),
            type: String(m.type).trim(),
            size: Number(m.size || 0),
            url: m.url ? String(m.url).trim() : ''
          }));
      }
    }

    if (!sanitizedMedia.length) {
      return res.status(400).json({
        success: false,
        message: 'At least one media file is required.'
      });
    }

    const work = await ProviderWork.create({
      provider: provider._id,
      caption: String(caption).trim(),
      media: sanitizedMedia
    });

    return res.status(201).json({
      success: true,
      data: work
    });
  } catch (error) {
    return next(error);
  }
}

async function getMyProviderWorks(req, res, next) {
  try {
    const provider = await Provider.findOne({ user: req.user._id });
    if (!provider) {
      return res.status(404).json({
        success: false,
        message: 'Provider profile not found.'
      });
    }

    const works = await ProviderWork.find({ provider: provider._id }).sort({ createdAt: -1 });
    return res.status(200).json({
      success: true,
      data: works
    });
  } catch (error) {
    return next(error);
  }
}

async function getProviderWorksByProviderId(req, res, next) {
  try {
    const provider = await Provider.findById(req.params.id);
    if (!provider || !provider.isApproved) {
      return res.status(404).json({
        success: false,
        message: 'Provider not found.'
      });
    }

    const works = await ProviderWork.find({ provider: provider._id }).sort({ createdAt: -1 });
    return res.status(200).json({
      success: true,
      data: works
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getProviders,
  getProviderById,
  createProvider,
  updateProvider,
  deleteProvider,
  getMyProviderProfile,
  createProviderWork,
  getMyProviderWorks,
  getProviderWorksByProviderId
};
