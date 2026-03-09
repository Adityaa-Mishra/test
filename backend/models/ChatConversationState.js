const mongoose = require('mongoose');

const chatConversationStateSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    partner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    hiddenAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

chatConversationStateSchema.index({ user: 1, partner: 1 }, { unique: true });

module.exports = mongoose.model('ChatConversationState', chatConversationStateSchema);
