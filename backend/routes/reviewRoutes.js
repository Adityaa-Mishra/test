const express = require('express');
const reviewController = require('../controllers/reviewController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/', protect, restrictTo('user'), reviewController.createReview);
router.get('/my', protect, reviewController.getMyReviews);
router.get('/:providerId', reviewController.getReviewsByProvider);
router.delete('/:id', protect, reviewController.deleteReview);

module.exports = router;
