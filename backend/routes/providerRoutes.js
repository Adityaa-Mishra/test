const express = require('express');
const providerController = require('../controllers/providerController');
const { protect, restrictTo } = require('../middleware/authMiddleware');
const { uploadProviderWorkMedia } = require('../middleware/uploadMiddleware');

const router = express.Router();

router.get('/', providerController.getProviders);
router.get('/me', protect, restrictTo('provider', 'admin'), providerController.getMyProviderProfile);
router.get('/works/my', protect, restrictTo('provider'), providerController.getMyProviderWorks);
router.get('/:id/works', providerController.getProviderWorksByProviderId);
router.get('/:id', providerController.getProviderById);
router.post('/', protect, restrictTo('provider'), providerController.createProvider);
router.post('/works', protect, restrictTo('provider'), uploadProviderWorkMedia.array('media', 10), providerController.createProviderWork);
router.put('/:id', protect, restrictTo('provider', 'admin'), providerController.updateProvider);
router.delete('/:id', protect, restrictTo('provider', 'admin'), providerController.deleteProvider);

module.exports = router;
