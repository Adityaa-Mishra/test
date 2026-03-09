const Review = require('../models/Review');
const Provider = require('../models/Provider');
const Booking = require('../models/Booking');

async function recalculateProviderRating(providerId) {
  const result = await Review.aggregate([
    { $match: { provider: providerId } },
    {
      $group: {
        _id: '$provider',
        avgRating: { $avg: '$rating' }
      }
    }
  ]);

  const avgRating = result.length ? Number(result[0].avgRating.toFixed(2)) : 0;
  await Provider.findByIdAndUpdate(providerId, { rating: avgRating });
  return avgRating;
}

async function createReview(req, res, next) {
  try {
    const { provider: providerId, rating, comment } = req.body;
    if (!providerId || rating == null || !comment) {
      return res.status(400).json({
        success: false,
        message: 'provider, rating and comment are required.'
      });
    }

    const numericRating = Number(rating);
    if (numericRating < 1 || numericRating > 5) {
      return res.status(400).json({
        success: false,
        message: 'rating must be between 1 and 5.'
      });
    }

    const provider = await Provider.findById(providerId);
    if (!provider || !provider.isApproved) {
      return res.status(404).json({
        success: false,
        message: 'Provider not found.'
      });
    }

    const completedBooking = await Booking.findOne({
      user: req.user._id,
      provider: provider._id,
      status: 'completed'
    });

    if (!completedBooking) {
      return res.status(403).json({
        success: false,
        message: 'You can review a provider only after a completed booking.'
      });
    }

    const review = await Review.create({
      user: req.user._id,
      provider: provider._id,
      rating: numericRating,
      comment: comment.trim()
    });

    const updatedRating = await recalculateProviderRating(provider._id);

    return res.status(201).json({
      success: true,
      data: {
        review,
        providerRating: updatedRating
      }
    });
  } catch (error) {
    if (error && error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'You have already reviewed this provider.'
      });
    }
    return next(error);
  }
}

async function getReviewsByProvider(req, res, next) {
  try {
    const { providerId } = req.params;
    const reviews = await Review.find({ provider: providerId })
      .populate('user', 'name')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: reviews
    });
  } catch (error) {
    return next(error);
  }
}

async function getMyReviews(req, res, next) {
  try {
    const reviews = await Review.find({ user: req.user._id })
      .populate({
        path: 'provider',
        populate: {
          path: 'user',
          select: 'name email'
        }
      })
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: reviews
    });
  } catch (error) {
    return next(error);
  }
}

async function deleteReview(req, res, next) {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found.'
      });
    }

    const isOwner = review.user.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';
    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'You can delete only your own review.'
      });
    }

    const providerId = review.provider;
    await review.deleteOne();
    const updatedRating = await recalculateProviderRating(providerId);

    return res.status(200).json({
      success: true,
      data: {
        message: 'Review deleted.',
        providerRating: updatedRating
      }
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  createReview,
  getReviewsByProvider,
  getMyReviews,
  deleteReview,
  recalculateProviderRating
};
