const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Provider = require('../models/Provider');
const User = require('../models/User');
const ChatMessage = require('../models/ChatMessage');
const ChatConversationState = require('../models/ChatConversationState');

function isObjectId(value) {
  return mongoose.Types.ObjectId.isValid(value);
}

async function getAuthorizedBooking(bookingId, user) {
  if (!isObjectId(bookingId)) return null;

  const booking = await Booking.findById(bookingId)
    .populate('user', 'name email role')
    .populate({
      path: 'provider',
      populate: {
        path: 'user',
        select: 'name email role'
      }
    });

  if (!booking) return null;
  if (user.role === 'admin') return booking;

  const bookingUserId = booking.user && booking.user._id ? booking.user._id.toString() : '';
  const providerUserId = booking.provider && booking.provider.user && booking.provider.user._id
    ? booking.provider.user._id.toString()
    : '';

  if (user.role === 'user' && bookingUserId === user._id.toString()) return booking;
  if (user.role === 'provider' && providerUserId === user._id.toString()) return booking;
  return null;
}

async function getConversationContextsForUser(user) {
  let bookings = [];

  if (user.role === 'user') {
    bookings = await Booking.find({ user: user._id })
      .populate({
        path: 'provider',
        populate: {
          path: 'user',
          select: 'name email role'
        }
      })
      .sort({ createdAt: -1 });
  } else if (user.role === 'provider') {
    const provider = await Provider.findOne({ user: user._id }).select('_id');
    if (!provider) return [];

    bookings = await Booking.find({ provider: provider._id })
      .populate('user', 'name email role')
      .sort({ createdAt: -1 });
  } else {
    bookings = await Booking.find({})
      .populate('user', 'name email role')
      .populate({
        path: 'provider',
        populate: {
          path: 'user',
          select: 'name email role'
        }
      })
      .sort({ createdAt: -1 })
      .limit(200);
  }

  const map = new Map();
  bookings.forEach((booking) => {
    let partner = null;

    if (user.role === 'user') {
      partner = booking.provider && booking.provider.user ? booking.provider.user : null;
    } else if (user.role === 'provider') {
      partner = booking.user || null;
    } else {
      partner = booking.user || null;
    }

    if (!partner || !partner._id) return;

    const partnerId = partner._id.toString();
    if (!map.has(partnerId)) {
      map.set(partnerId, {
        partner: {
          _id: partner._id,
          name: partner.name || 'Unknown',
          email: partner.email || ''
        },
        bookingIds: [],
        latestBookingId: booking._id,
        status: booking.status,
        date: booking.date,
        serviceType: booking.provider && booking.provider.serviceType ? booking.provider.serviceType : '',
        location: booking.provider && booking.provider.location ? booking.provider.location : ''
      });
    }

    const ctx = map.get(partnerId);
    ctx.bookingIds.push(booking._id);
  });

  return Array.from(map.values());
}

async function getConversationContextByPartner(user, partnerId) {
  if (!isObjectId(partnerId)) return null;

  if (user.role === 'admin') {
    const partner = await User.findById(partnerId).select('name email');
    if (!partner) return null;
    return {
      partner: { _id: partner._id, name: partner.name, email: partner.email },
      bookingIds: [],
      latestBookingId: null
    };
  }

  if (user.role === 'user') {
    const provider = await Provider.findOne({ user: partnerId }).select('_id serviceType location');
    if (!provider) return null;

    const bookings = await Booking.find({ user: user._id, provider: provider._id }).sort({ createdAt: -1 });
    if (!bookings.length) return null;

    const partnerUser = await User.findById(partnerId).select('name email');
    if (!partnerUser) return null;

    return {
      partner: { _id: partnerUser._id, name: partnerUser.name, email: partnerUser.email },
      bookingIds: bookings.map((b) => b._id),
      latestBookingId: bookings[0]._id,
      serviceType: provider.serviceType || '',
      location: provider.location || ''
    };
  }

  if (user.role === 'provider') {
    const myProvider = await Provider.findOne({ user: user._id }).select('_id');
    if (!myProvider) return null;

    const bookings = await Booking.find({ provider: myProvider._id, user: partnerId }).sort({ createdAt: -1 });
    if (!bookings.length) return null;

    const partnerUser = await User.findById(partnerId).select('name email');
    if (!partnerUser) return null;

    return {
      partner: { _id: partnerUser._id, name: partnerUser.name, email: partnerUser.email },
      bookingIds: bookings.map((b) => b._id),
      latestBookingId: bookings[0]._id,
      serviceType: '',
      location: ''
    };
  }

  return null;
}

async function getConversations(req, res, next) {
  try {
    const contexts = await getConversationContextsForUser(req.user);
    if (!contexts.length) {
      return res.status(200).json({ success: true, data: [] });
    }

    const partnerIds = contexts.map((c) => c.partner._id);
    const hiddenStates = await ChatConversationState.find({
      user: req.user._id,
      partner: { $in: partnerIds }
    });
    const hiddenMap = new Map(hiddenStates.map((s) => [s.partner.toString(), s.hiddenAt]));

    const allBookingIds = contexts.flatMap((c) => c.bookingIds);
    const messages = allBookingIds.length
      ? await ChatMessage.find({ booking: { $in: allBookingIds } })
        .sort({ createdAt: -1 })
        .populate('sender', 'name')
        .populate('receiver', 'name')
      : [];

    const groupedByPartner = new Map();
    messages.forEach((msg) => {
      const senderId = msg.sender && msg.sender._id ? msg.sender._id.toString() : '';
      const receiverId = msg.receiver && msg.receiver._id ? msg.receiver._id.toString() : '';
      const partnerId = senderId === req.user._id.toString() ? receiverId : senderId;
      if (!partnerId) return;
      if (!groupedByPartner.has(partnerId)) groupedByPartner.set(partnerId, []);
      groupedByPartner.get(partnerId).push(msg);
    });

    const data = [];
    contexts.forEach((ctx) => {
      const partnerId = ctx.partner._id.toString();
      const hiddenAt = hiddenMap.get(partnerId) || null;
      const thread = groupedByPartner.get(partnerId) || [];
      const visibleThread = hiddenAt ? thread.filter((m) => new Date(m.createdAt) > new Date(hiddenAt)) : thread;
      const lastMessage = visibleThread[0] || null;

      if (hiddenAt && !lastMessage) {
        return;
      }

      const unreadCount = visibleThread.filter(
        (m) => m.receiver && m.receiver._id && m.receiver._id.toString() === req.user._id.toString() && !m.readAt
      ).length;

      data.push({
        conversationId: partnerId,
        bookingId: ctx.latestBookingId,
        partner: ctx.partner,
        serviceType: ctx.serviceType || '',
        location: ctx.location || '',
        status: ctx.status,
        date: ctx.date,
        unreadCount,
        lastMessage: lastMessage
          ? {
            _id: lastMessage._id,
            text: lastMessage.text,
            attachment: lastMessage.attachment || null,
            createdAt: lastMessage.createdAt,
            sender: lastMessage.sender ? { _id: lastMessage.sender._id, name: lastMessage.sender.name } : null
          }
          : null
      });
    });

    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
}

async function getMessagesByBooking(req, res, next) {
  try {
    const conversationKey = req.params.bookingId;
    let context = await getConversationContextByPartner(req.user, conversationKey);
    let filtered = [];

    if (context && context.bookingIds.length) {
      const hiddenState = await ChatConversationState.findOne({
        user: req.user._id,
        partner: conversationKey
      });
      const hiddenAt = hiddenState && hiddenState.hiddenAt ? new Date(hiddenState.hiddenAt) : null;

      const messages = await ChatMessage.find({ booking: { $in: context.bookingIds } })
        .populate('sender', 'name email')
        .populate('receiver', 'name email')
        .sort({ createdAt: 1 });

      filtered = hiddenAt ? messages.filter((m) => new Date(m.createdAt) > hiddenAt) : messages;
    } else {
      // Backward compatibility: allow conversation key as booking id.
      const booking = await getAuthorizedBooking(conversationKey, req.user);
      if (!booking) {
        return res.status(404).json({
          success: false,
          message: 'Conversation not found.'
        });
      }

      filtered = await ChatMessage.find({ booking: booking._id })
        .populate('sender', 'name email')
        .populate('receiver', 'name email')
        .sort({ createdAt: 1 });
    }

    const unreadIds = filtered
      .filter((m) => m.receiver && m.receiver._id && m.receiver._id.toString() === req.user._id.toString() && !m.readAt)
      .map((m) => m._id);

    if (unreadIds.length) {
      await ChatMessage.updateMany(
        { _id: { $in: unreadIds } },
        { $set: { readAt: new Date() } }
      );
    }

    return res.status(200).json({
      success: true,
      data: filtered
    });
  } catch (error) {
    return next(error);
  }
}

async function sendMessage(req, res, next) {
  try {
    const { bookingId, partnerId, text } = req.body;
    const safeText = String(text || '').trim();
    const file = req.file || null;

    if (!safeText && !file) {
      return res.status(400).json({
        success: false,
        message: 'text or attachment is required.'
      });
    }

    let targetBookingId = null;
    let receiverId = null;

    if (partnerId) {
      const context = await getConversationContextByPartner(req.user, partnerId);
      if (!context || !context.latestBookingId) {
        return res.status(404).json({
          success: false,
          message: 'Conversation not found.'
        });
      }
      targetBookingId = context.latestBookingId;
      receiverId = partnerId;
    } else if (bookingId) {
      const booking = await getAuthorizedBooking(bookingId, req.user);
      if (!booking) {
        return res.status(404).json({
          success: false,
          message: 'Conversation not found.'
        });
      }

      const bookingUserId = booking.user && booking.user._id ? booking.user._id.toString() : '';
      const providerUserId = booking.provider && booking.provider.user && booking.provider.user._id
        ? booking.provider.user._id.toString()
        : '';

      if (req.user._id.toString() === bookingUserId) receiverId = providerUserId;
      else if (req.user._id.toString() === providerUserId) receiverId = bookingUserId;
      else {
        return res.status(403).json({
          success: false,
          message: 'You are not part of this conversation.'
        });
      }

      targetBookingId = booking._id;
    } else {
      return res.status(400).json({
        success: false,
        message: 'partnerId or bookingId is required.'
      });
    }

    const attachment = file
      ? {
        name: String(file.originalname || file.filename || '').trim(),
        type: String(file.mimetype || '').trim(),
        size: Number(file.size || 0),
        url: `/uploads/chat-attachments/${file.filename}`
      }
      : null;

    const messageText = safeText || `Attachment: ${attachment.name}`;

    const message = await ChatMessage.create({
      booking: targetBookingId,
      sender: req.user._id,
      receiver: receiverId,
      text: messageText,
      attachment: attachment || undefined
    });

    const populated = await ChatMessage.findById(message._id)
      .populate('sender', 'name email')
      .populate('receiver', 'name email');

    return res.status(201).json({
      success: true,
      data: populated
    });
  } catch (error) {
    return next(error);
  }
}

async function deleteConversation(req, res, next) {
  try {
    const { partnerId } = req.params;
    const context = await getConversationContextByPartner(req.user, partnerId);
    if (!context) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found.'
      });
    }

    await ChatConversationState.findOneAndUpdate(
      { user: req.user._id, partner: partnerId },
      { $set: { hiddenAt: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.status(200).json({
      success: true,
      data: { message: 'Conversation deleted.' }
    });
  } catch (error) {
    return next(error);
  }
}

async function markMessageRead(req, res, next) {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid message id.'
      });
    }

    const message = await ChatMessage.findById(id);
    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found.'
      });
    }

    if (message.receiver.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only message receiver can mark as read.'
      });
    }

    if (!message.readAt) {
      message.readAt = new Date();
      await message.save();
    }

    return res.status(200).json({
      success: true,
      data: message
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getConversations,
  getMessagesByBooking,
  sendMessage,
  deleteConversation,
  markMessageRead
};
