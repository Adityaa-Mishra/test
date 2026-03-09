const mongoose = require('mongoose');

const providerWorkSchema = new mongoose.Schema(
  {
    provider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Provider',
      required: true
    },
    caption: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500
    },
    media: [
      {
        name: { type: String, required: true, trim: true },
        type: { type: String, required: true, trim: true },
        size: { type: Number, required: true, min: 0 },
        url: { type: String, trim: true, default: '' }
      }
    ]
  },
  {
    timestamps: true
  }
);

providerWorkSchema.index({ provider: 1, createdAt: -1 });

module.exports = mongoose.model('ProviderWork', providerWorkSchema);
