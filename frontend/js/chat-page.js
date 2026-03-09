'use strict';

let currentUser = null;
let conversations = [];
let activeConversationId = null; // partner user id
let activeMessages = [];
let pollTimer = null;
let loadingMessages = false;
let refreshing = false;
let lastConversationSignature = '';
let lastMessagesSignature = '';
let urlPartnerId = '';
let pendingAttachment = null;

function isMobileView() {
  return window.matchMedia('(max-width: 768px)').matches;
}

function syncMobileChatView() {
  const sidebar = document.querySelector('.conversations-sidebar');
  const chatWindow = document.getElementById('chatWindow');
  if (!sidebar || !chatWindow) return;

  if (!isMobileView()) {
    sidebar.classList.remove('hidden');
    chatWindow.classList.add('active');
    return;
  }

  if (activeConversationId) {
    sidebar.classList.add('hidden');
    chatWindow.classList.add('active');
  } else {
    sidebar.classList.remove('hidden');
    chatWindow.classList.remove('active');
  }
}

function formatTime(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function initials(name) {
  return String(name || '?')
    .split(' ')
    .filter(Boolean)
    .map((x) => x[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function buildConversationSignature(list) {
  return list
    .map((c) => `${c.conversationId}|${c.lastMessageAt || ''}|${c.unreadCount || 0}|${c.lastMessage || ''}`)
    .join('::');
}

function buildMessagesSignature(list) {
  return list.map((m) => `${m.id}|${m.readAt || ''}|${m.text || ''}|${m.attachment ? m.attachment.url : ''}`).join('::');
}

function getActiveConversation() {
  return conversations.find((c) => c.conversationId === activeConversationId) || null;
}

async function ensureConversationByPartnerId(partnerId) {
  if (!partnerId) return false;
  if (conversations.some((c) => c.conversationId === partnerId)) return true;

  const bookingsResult = await window.ApiClient.request('/bookings/my');
  const bookings = bookingsResult && bookingsResult.data ? bookingsResult.data : [];
  const booking = bookings.find((b) => {
    if (currentUser && currentUser.role === 'user') {
      const pid = b.provider && b.provider.user && b.provider.user._id ? String(b.provider.user._id) : '';
      return pid === String(partnerId);
    }
    const uid = b.user && b.user._id ? String(b.user._id) : '';
    return uid === String(partnerId);
  });

  if (!booking) return false;

  let partnerName = 'Unknown';
  let subtitle = '';
  if (currentUser && currentUser.role === 'user') {
    partnerName = (booking.provider && booking.provider.user && booking.provider.user.name) || 'Provider';
    subtitle = [booking.provider && booking.provider.serviceType, booking.provider && booking.provider.location]
      .filter(Boolean)
      .join(' - ');
  } else {
    partnerName = (booking.user && booking.user.name) || 'Customer';
    subtitle = [(booking.provider && booking.provider.serviceType) || 'Service'].join(' - ');
  }

  conversations.unshift({
    conversationId: String(partnerId),
    partnerName,
    partnerId: String(partnerId),
    subtitle,
    unreadCount: 0,
    lastMessage: '',
    lastMessageAt: null
  });
  return true;
}

async function resolvePartnerIdFromBooking(bookingId) {
  if (!bookingId) return '';
  const bookingsResult = await window.ApiClient.request('/bookings/my');
  const bookings = bookingsResult && bookingsResult.data ? bookingsResult.data : [];
  const booking = bookings.find((b) => String(b._id) === String(bookingId));
  if (!booking) return '';

  if (currentUser && currentUser.role === 'user') {
    return (booking.provider && booking.provider.user && booking.provider.user._id)
      ? String(booking.provider.user._id)
      : '';
  }
  return (booking.user && booking.user._id) ? String(booking.user._id) : '';
}

async function loadConversations() {
  const result = await window.ApiClient.request('/chat/conversations');
  const rows = result && result.data ? result.data : [];

  conversations = rows.map((row) => ({
    conversationId: row.conversationId || (row.partner && row.partner._id ? String(row.partner._id) : ''),
    partnerName: row.partner && row.partner.name ? row.partner.name : 'Unknown',
    partnerId: row.partner && row.partner._id ? String(row.partner._id) : '',
    subtitle: [row.serviceType, row.location].filter(Boolean).join(' - '),
    unreadCount: Number(row.unreadCount || 0),
    lastMessage: row.lastMessage ? row.lastMessage.text : '',
    lastMessageAt: row.lastMessage ? row.lastMessage.createdAt : null
  })).filter((x) => x.conversationId);

  if (!activeConversationId && conversations.length) {
    activeConversationId = conversations[0].conversationId;
  } else if (activeConversationId && !conversations.some((c) => c.conversationId === activeConversationId)) {
    activeConversationId = conversations[0] ? conversations[0].conversationId : null;
    activeMessages = [];
  }
}

async function loadMessagesForActiveConversation() {
  if (!activeConversationId || loadingMessages) return;
  loadingMessages = true;
  try {
    const result = await window.ApiClient.request(`/chat/messages/${activeConversationId}`);
    const rows = result && result.data ? result.data : [];
    activeMessages = rows.map((m) => ({
      id: String(m._id),
      text: m.text || '',
      createdAt: m.createdAt,
      fromMe: m.sender && String(m.sender._id) === String(currentUser._id),
      readAt: m.readAt || null,
      attachment: m.attachment || null
    }));
  } finally {
    loadingMessages = false;
  }
}

function getPublicFileUrl(pathname) {
  if (!pathname) return '';
  if (/^https?:\/\//i.test(pathname)) return pathname;
  const hostBase = window.ApiClient.getBaseUrl().replace(/\/api$/, '');
  return `${hostBase}${pathname.startsWith('/') ? '' : '/'}${pathname}`;
}

function renderConversationList(filter = '') {
  const list = document.getElementById('conversationsList');
  if (!list) return;

  const needle = String(filter || '').toLowerCase();
  const rows = conversations.filter((c) => c.partnerName.toLowerCase().includes(needle));

  if (!rows.length) {
    list.innerHTML = `
      <div class="conversation-item">
        <div class="conversation-info">
          <div class="conversation-name">No conversations</div>
          <div class="conversation-preview">Book a service to start chatting.</div>
        </div>
      </div>
    `;
    return;
  }

  list.innerHTML = rows.map((c) => `
    <div class="conversation-item ${c.conversationId === activeConversationId ? 'active' : ''}" data-conversation-id="${c.conversationId}">
      <div class="conversation-avatar">
        <div class="avatar">${initials(c.partnerName)}</div>
      </div>
      <div class="conversation-info">
        <div class="conversation-name">${escapeHtml(c.partnerName)}</div>
        <div class="conversation-preview">${escapeHtml(c.lastMessage || c.subtitle || 'No messages yet')}</div>
      </div>
      <div class="conversation-meta">
        <span class="conv-time">${c.lastMessageAt ? formatTime(c.lastMessageAt) : ''}</span>
        ${c.unreadCount ? `<span class="conv-unread-badge">${c.unreadCount}</span>` : ''}
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.conversation-item[data-conversation-id]').forEach((item) => {
    item.addEventListener('click', async () => {
      const nextId = item.dataset.conversationId;
      if (!nextId) return;
      if (nextId === activeConversationId) {
        syncMobileChatView();
        return;
      }
      activeConversationId = nextId;
      await loadMessagesForActiveConversation();
      const active = getActiveConversation();
      if (active) active.unreadCount = 0;
      lastMessagesSignature = buildMessagesSignature(activeMessages);
      renderConversationList(filter);
      renderChatWindow();
      syncMobileChatView();
    });
  });
}

function renderChatWindow() {
  const header = document.getElementById('chatWindowHeader');
  const messagesEl = document.getElementById('chatMessages');
  const empty = document.getElementById('chatWindowEmpty');
  const body = document.getElementById('chatBody');
  const active = getActiveConversation();

  if (!header || !messagesEl || !empty || !body) return;

  if (!active) {
    empty.style.display = 'flex';
    body.style.display = 'none';
    return;
  }

  empty.style.display = 'none';
  body.style.display = 'flex';

  const avatarEl = header.querySelector('.avatar');
  const nameEl = header.querySelector('.chat-header-name');
  const statusEl = header.querySelector('.chat-header-status');
  if (avatarEl) avatarEl.textContent = initials(active.partnerName);
  if (nameEl) nameEl.textContent = active.partnerName;
  if (statusEl) statusEl.textContent = active.subtitle || 'Conversation';

  const actions = header.querySelector('.chat-header-actions');
  if (actions) {
    actions.innerHTML = '<button class="chat-action-btn" id="deleteConversationBtn" type="button" title="Delete conversation">Delete</button>';
    const deleteBtn = document.getElementById('deleteConversationBtn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async () => {
        if (!activeConversationId) return;
        try {
          await window.ApiClient.request(`/chat/conversations/${activeConversationId}`, { method: 'DELETE' });
          conversations = conversations.filter((c) => c.conversationId !== activeConversationId);
          activeConversationId = conversations[0] ? conversations[0].conversationId : null;
          activeMessages = [];
          lastConversationSignature = buildConversationSignature(conversations);
          lastMessagesSignature = '';
          renderConversationList(document.getElementById('conversationSearch')?.value || '');
          if (activeConversationId) {
            await loadMessagesForActiveConversation();
          }
          renderChatWindow();
          window.showToast('Conversation deleted', 'success');
        } catch (error) {
          window.showToast(error.message || 'Failed to delete conversation', 'error');
        }
      });
    }
  }

  if (!activeMessages.length) {
    messagesEl.innerHTML = '<div class="date-separator">No messages yet</div>';
    return;
  }

  messagesEl.innerHTML = `
    <div class="date-separator">Today</div>
    ${activeMessages.map((m) => `
      <div class="message-group ${m.fromMe ? 'sent' : 'received'}">
        <div class="message-bubble">${escapeHtml(m.text)}</div>
        ${
          m.attachment && m.attachment.url
            ? `<a class="chat-attachment-link" href="${escapeHtml(getPublicFileUrl(m.attachment.url))}" target="_blank" rel="noopener noreferrer">Attachment: ${escapeHtml(m.attachment.name || 'Open file')}</a>`
            : ''
        }
        <div class="message-time">${formatTime(m.createdAt)}${m.fromMe ? (m.readAt ? '  Seen' : '  Sent') : ''}</div>
      </div>
    `).join('')}
  `;
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

async function sendMessage() {
  const input = document.getElementById('chatInput');
  if (!input || !activeConversationId) return;

  const text = input.value.trim();
  if (!text && !pendingAttachment) return;

  try {
    const active = getActiveConversation();
    const partnerId = (active && active.partnerId) ? active.partnerId : activeConversationId;
    const body = pendingAttachment
      ? (() => {
        const formData = new FormData();
        formData.append('partnerId', partnerId);
        formData.append('text', text);
        formData.append('attachment', pendingAttachment, pendingAttachment.name);
        return formData;
      })()
      : { text, partnerId };

    await window.ApiClient.request('/chat/messages', { method: 'POST', body });

    input.value = '';
    pendingAttachment = null;
    const attachBtn = document.getElementById('chatAttachBtn');
    if (attachBtn) attachBtn.classList.remove('has-file');
    await refreshChatData(true);
  } catch (error) {
    window.showToast(error.message || 'Failed to send message', 'error');
  }
}

async function refreshChatData(forceRender = false) {
  if (refreshing) return;
  refreshing = true;
  const prevConversationSignature = lastConversationSignature;
  const prevMessagesSignature = lastMessagesSignature;
  const searchValue = document.getElementById('conversationSearch')?.value || '';
  try {
    await loadConversations();

    if (urlPartnerId) {
      if (!conversations.some((c) => c.conversationId === urlPartnerId)) {
        await ensureConversationByPartnerId(urlPartnerId);
      }
      if (conversations.some((c) => c.conversationId === urlPartnerId)) {
        activeConversationId = urlPartnerId;
      }
    }

    const newConversationSignature = buildConversationSignature(conversations);

    await loadMessagesForActiveConversation();
    const newMessagesSignature = buildMessagesSignature(activeMessages);

    const conversationChanged = newConversationSignature !== prevConversationSignature;
    const messagesChanged = newMessagesSignature !== prevMessagesSignature;

    if (forceRender || conversationChanged) {
      renderConversationList(searchValue);
    }

    if (forceRender || conversationChanged || messagesChanged) {
      renderChatWindow();
    }

    lastConversationSignature = newConversationSignature;
    lastMessagesSignature = newMessagesSignature;
  } finally {
    refreshing = false;
  }
}

function initComposer() {
  const input = document.getElementById('chatInput');
  const sendBtn = document.getElementById('chatSendBtn');
  const attachBtn = document.getElementById('chatAttachBtn');
  const attachmentInput = document.getElementById('chatAttachmentInput');
  if (!input || !sendBtn) return;

  // Fix for attachment icon click
  if (attachBtn && attachmentInput) {
    attachBtn.addEventListener('click', () => attachmentInput.click());
  }

  sendBtn.addEventListener('click', sendMessage);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  if (attachBtn && attachmentInput) {
    // Label triggers input automatically
    attachmentInput.addEventListener('change', () => {
      const file = attachmentInput.files && attachmentInput.files[0] ? attachmentInput.files[0] : null;
      pendingAttachment = file || null;
      attachBtn.classList.toggle('has-file', !!pendingAttachment);
      if (pendingAttachment) {
        window.showToast(`Attached: ${pendingAttachment.name}`, 'info');
      }
      attachmentInput.value = '';
    });
  }
}

function initSearch() {
  const search = document.getElementById('conversationSearch');
  if (!search) return;
  search.addEventListener('input', () => {
    renderConversationList(search.value);
  });
}

function initMobileNavigation() {
  const backBtn = document.getElementById('mobileBackBtn');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      activeConversationId = null;
      activeMessages = [];
      renderConversationList(document.getElementById('conversationSearch')?.value || '');
      renderChatWindow();
      syncMobileChatView();
    });
  }

  window.addEventListener('resize', syncMobileChatView);
  syncMobileChatView();
}

document.addEventListener('DOMContentLoaded', async () => {
  // Add class for CSS targeting (hiding footer, fixing height)
  document.body.classList.add('chat-page-body');

  currentUser = await window.AuthState.refreshUser({ strict: true });
  if (!currentUser) {
    window.location.href = 'login.html';
    return;
  }

  initComposer();
  initSearch();
  initMobileNavigation();

  try {
    const query = new URLSearchParams(window.location.search);
    urlPartnerId = query.get('partnerId') || '';
    if (!urlPartnerId) {
      const bookingId = query.get('bookingId') || '';
      if (bookingId) {
        urlPartnerId = await resolvePartnerIdFromBooking(bookingId);
      }
    }

    await refreshChatData(true);
    syncMobileChatView();

    pollTimer = setInterval(() => {
      refreshChatData(false).catch(() => {});
    }, 10000); // Increased to 10s to reduce load/speed up performance
  } catch (error) {
    window.showToast(error.message || 'Failed to load chat', 'error');
  }
});

window.addEventListener('beforeunload', () => {
  if (pollTimer) clearInterval(pollTimer);
});
