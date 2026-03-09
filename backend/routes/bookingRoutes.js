const express = require('express');
const bookingController = require('../controllers/bookingController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/', protect, restrictTo('user'), bookingController.createBooking);
router.get('/my', protect, bookingController.getMyBookings);
router.put('/:id/status', protect, restrictTo('provider'), bookingController.updateBookingStatus);
router.delete('/:id', protect, bookingController.deleteBooking);

module.exports = router;
