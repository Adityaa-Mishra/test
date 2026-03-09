const Booking = require('../models/Booking');
const Provider = require('../models/Provider');
const ChatMessage = require('../models/ChatMessage');

async function createBooking(req, res, next) {
  try {
    const { provider: providerId, date } = req.body;
    if (!providerId || !date) {
      return res.status(400).json({
        success: false,
        message: 'provider and date are required.'
      });
    }

    const provider = await Provider.findById(providerId);
    if (!provider || !provider.isApproved) {
      return res.status(404).json({
        success: false,
        message: 'Provider not found.'
      });
    }

    const booking = await Booking.create({
      user: req.user._id,
      provider: provider._id,
      date: new Date(date)
    });

    return res.status(201).json({
      success: true,
      data: booking
    });
  } catch (error) {
    return next(error);
  }
}

async function getMyBookings(req, res, next) {
  try {
    let filter = {};

    if (req.user.role === 'provider') {
      const provider = await Provider.findOne({ user: req.user._id });
      if (!provider) {
        return res.status(200).json({
          success: true,
          data: []
        });
      }
      filter = { provider: provider._id };
    } else {
      filter = { user: req.user._id };
    }

    const bookings = await Booking.find(filter)
      .populate('user', 'name email')
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
      data: bookings
    });
  } catch (error) {
    return next(error);
  }
}

async function updateBookingStatus(req, res, next) {
  try {
    const { status } = req.body;
    if (!['pending', 'accepted', 'rejected', 'completed'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status.'
      });
    }

    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found.'
      });
    }

    const provider = await Provider.findOne({ user: req.user._id });
    if (!provider || provider._id.toString() !== booking.provider.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only assigned provider can update booking status.'
      });
    }

    booking.status = status;
    await booking.save();

    return res.status(200).json({
      success: true,
      data: booking
    });
  } catch (error) {
    return next(error);
  }
}

async function deleteBooking(req, res, next) {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found.'
      });
    }

    if (!['completed', 'rejected'].includes(booking.status)) {
      return res.status(400).json({
        success: false,
        message: 'Only completed or rejected bookings can be deleted.'
      });
    }

    let allowed = false;
    if (req.user.role === 'admin') {
      allowed = true;
    } else if (req.user.role === 'user') {
      allowed = booking.user.toString() === req.user._id.toString();
    } else if (req.user.role === 'provider') {
      const provider = await Provider.findOne({ user: req.user._id }).select('_id');
      allowed = !!provider && provider._id.toString() === booking.provider.toString();
    }

    if (!allowed) {
      return res.status(403).json({
        success: false,
        message: 'You are not allowed to delete this booking.'
      });
    }

    await ChatMessage.deleteMany({ booking: booking._id });
    await booking.deleteOne();

    return res.status(200).json({
      success: true,
      data: { message: 'Booking deleted.' }
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  createBooking,
  getMyBookings,
  updateBookingStatus,
  deleteBooking
};
