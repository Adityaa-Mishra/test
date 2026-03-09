'use strict';

let bookings = [];
let reviews = [];
let reviewedProviderIds = new Set();
let activeReviewProviderId = null;

function statusBadge(status) {
  if (status === 'completed') return '<span class="badge badge-success">Completed</span>';
  if (status === 'accepted') return '<span class="badge badge-info">Accepted</span>';
  if (status === 'pending') return '<span class="badge badge-warning">Pending</span>';
  if (status === 'rejected') return '<span class="badge badge-danger">Rejected</span>';
  return '<span class="badge badge-danger">Cancelled</span>';
}

function serviceIcon(serviceType) {
  const key = String(serviceType || '').toLowerCase();
  if (key.includes('plumb')) return '🔧';
  if (key.includes('paint')) return '🎨';
  if (key.includes('ac')) return '❄️';
  if (key.includes('carpent')) return '🪚';
  return '⚡';
}

function animateValue(el, target) {
  if (!el) return;
  const end = Number(target || 0);
  const steps = 24;
  let frame = 0;
  const tick = () => {
    frame += 1;
    el.textContent = String(Math.round((end * frame) / steps));
    if (frame < steps) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function formatINR(value) {
  return new Intl.NumberFormat('en-IN').format(Number(value || 0));
}

function formatBookingDateTime(rawDate) {
  const dateObj = new Date(rawDate);
  if (Number.isNaN(dateObj.getTime())) {
    return { date: rawDate || '', time: '' };
  }

  const date = dateObj.toLocaleDateString();
  const isDateOnlyMidnightUtc = typeof rawDate === 'string' && /T00:00:00(?:\.000)?Z$/.test(rawDate);
  if (isDateOnlyMidnightUtc) {
    return { date, time: 'To be confirmed' };
  }

  const time = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return { date, time };
}

function updateProfileUI(user) {
  const nameEl = document.querySelector('.profile-summary-name');
  const emailEl = document.querySelector('.profile-summary-email');
  const avatarEl = document.querySelector('.profile-summary-avatar');
  if (nameEl) nameEl.textContent = user.name || 'User';
  if (emailEl) emailEl.textContent = user.email || '';
  if (avatarEl) {
    avatarEl.textContent = (user.name || 'U')
      .split(' ')
      .map((x) => x[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }
}

function initEditUserProfile(user) {
  const btn = document.getElementById('editUserProfileBtn');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    const nextName = window.prompt('Update your name:', user.name || '');
    if (nextName === null) return;
    const name = nextName.trim();
    if (!name) {
      window.showToast('Name cannot be empty', 'warning');
      return;
    }

    const nextEmail = window.prompt('Update your email:', user.email || '');
    if (nextEmail === null) return;
    const email = nextEmail.trim();
    if (!email) {
      window.showToast('Email cannot be empty', 'warning');
      return;
    }

    try {
      const result = await window.ApiClient.request('/auth/profile', {
        method: 'PUT',
        body: { name, email }
      });
      const updated = result && result.data && result.data.user ? result.data.user : null;
      if (updated) {
        window.AuthState.setUser(updated);
        user.name = updated.name;
        user.email = updated.email;
      }
      updateProfileUI(user);
      window.showToast('Profile updated', 'success');
    } catch (error) {
      window.showToast(error.message || 'Failed to update profile', 'error');
    }
  });
}

function updateDashboardStats() {
  const totalBookings = bookings.length;
  const pending = bookings.filter((b) => b.status === 'pending').length;
  const completed = bookings.filter((b) => b.status === 'completed').length;
  const spent = bookings.reduce((sum, b) => sum + Number((b.provider && b.provider.pricePerHour) || 0), 0);

  const sidebarVals = document.querySelectorAll('.profile-summary-stat .stat-val');
  if (sidebarVals[0]) animateValue(sidebarVals[0], totalBookings);
  if (sidebarVals[1]) animateValue(sidebarVals[1], 0);
  if (sidebarVals[2]) animateValue(sidebarVals[2], reviews.length);

  const navBadge = document.querySelector('.dashboard-nav .nav-badge');
  if (navBadge) navBadge.textContent = String(totalBookings);

  const statCards = document.querySelectorAll('.stats-grid .stat-card .stat-card-value');
  if (statCards[0]) statCards[0].textContent = String(totalBookings);
  if (statCards[1]) statCards[1].textContent = String(pending);
  if (statCards[2]) statCards[2].textContent = String(completed);
  if (statCards[3]) statCards[3].textContent = formatINR(spent);
}

function renderBookings() {
  const list = document.getElementById('bookingsList');
  if (!list) return;

  if (!bookings.length) {
    list.innerHTML = `
      <article class="booking-item-card">
        <div class="booking-service-icon">📭</div>
        <div class="booking-item-info">
          <h4>No bookings yet</h4>
          <div class="booking-item-meta"><span>Book a provider to see activity here.</span></div>
        </div>
        <div class="booking-item-actions">
          <a class="btn btn-sm btn-primary" href="providers.html">Find Providers</a>
        </div>
      </article>
    `;
    return;
  }

  list.innerHTML = bookings.map((b) => {
    const providerName = (b.provider && b.provider.user && b.provider.user.name) || 'Provider';
    const providerUserId = (b.provider && b.provider.user && b.provider.user._id) ? b.provider.user._id : '';
    const service = (b.provider && b.provider.serviceType) || 'Service';
    const location = (b.provider && b.provider.location) || 'City';
    const providerId = b.provider && b.provider._id ? b.provider._id : '';
    const formattedDateTime = formatBookingDateTime(b.date);
    const date = formattedDateTime.date;
    const time = formattedDateTime.time;
    const amount = (b.provider && b.provider.pricePerHour) || 0;
    const icon = serviceIcon(service);
    const alreadyReviewed = providerId && reviewedProviderIds.has(providerId.toString());

    return `
      <article class="booking-item-card">
        <div class="booking-service-icon">${icon}</div>
        <div class="booking-item-info">
          <h4>${service}</h4>
          <div class="booking-item-meta">
            <span>👤 ${providerName}</span>
            <span>📅 ${date}</span>
            <span>🕒 ${time}</span>
            <span>📍 ${location}</span>
          </div>
        </div>
        <div class="booking-item-actions">
          <div class="booking-item-amount">₹${amount}</div>
          ${statusBadge(b.status)}
          <div class="booking-actions-row">
            <a class="btn btn-sm btn-outline" href="chat.html${providerUserId ? `?partnerId=${providerUserId}` : ''}">Chat</a>
            ${
              b.status === 'completed'
                ? (
                  alreadyReviewed
                    ? '<span class="badge badge-success">Reviewed</span>'
                    : `<button class="btn btn-sm btn-primary review-btn" data-provider-id="${providerId}" type="button">Review</button>`
                )
                : `<a class="btn btn-sm btn-primary" href="provider-details.html?id=${providerId}">View</a>`
            }
            ${
              (b.status === 'completed' || b.status === 'rejected')
                ? `<button class="btn btn-sm btn-outline delete-booking-btn" data-booking-id="${b._id}" type="button">Delete</button>`
                : ''
            }
          </div>
        </div>
      </article>
    `;
  }).join('');
}

function renderMyReviews() {
  const list = document.getElementById('myReviewsList');
  if (!list) return;

  if (!reviews.length) {
    list.innerHTML = `
      <article class="booking-item-card">
        <div class="booking-service-icon">⭐</div>
        <div class="booking-item-info">
          <h4>No reviews yet</h4>
          <div class="booking-item-meta"><span>Complete a booking and submit your first review.</span></div>
        </div>
      </article>
    `;
    return;
  }

  list.innerHTML = reviews.map((r) => {
    const providerName = (r.provider && r.provider.user && r.provider.user.name) || 'Provider';
    const providerService = (r.provider && r.provider.serviceType) || 'Service';
    const createdAt = new Date(r.createdAt);
    const createdText = Number.isNaN(createdAt.getTime()) ? '' : createdAt.toLocaleDateString();
    const stars = '★'.repeat(Number(r.rating || 0)) + '☆'.repeat(5 - Number(r.rating || 0));

    return `
      <article class="booking-item-card">
        <div class="booking-service-icon">⭐</div>
        <div class="booking-item-info">
          <h4>${providerName} • ${providerService}</h4>
          <div class="booking-item-meta">
            <span class="review-stars">${stars}</span>
            <span>📅 ${createdText}</span>
          </div>
          <p style="margin-top:8px;color:var(--text-body);font-size:0.9rem;line-height:1.6">${r.comment || ''}</p>
        </div>
        <div class="booking-item-actions">
          <button class="btn btn-sm btn-outline review-delete-btn delete-review-btn" data-review-id="${r._id}" type="button">Delete</button>
        </div>
      </article>
    `;
  }).join('');
}

async function loadBookings() {
  const result = await window.ApiClient.request('/bookings/my');
  bookings = result && result.data ? result.data : [];
}

async function loadReviews() {
  const result = await window.ApiClient.request('/reviews/my');
  reviews = result && result.data ? result.data : [];
  reviewedProviderIds = new Set(
    reviews
      .map((r) => (r.provider && r.provider._id ? r.provider._id.toString() : ''))
      .filter(Boolean)
  );
}

(function initReviewModal() {
  const overlay = document.getElementById('reviewModalOverlay');
  const close = document.getElementById('reviewModalClose');
  const form = document.getElementById('reviewForm');
  const stars = document.querySelectorAll('.star-btn');
  let rating = 0;

  const paintStars = (value) => {
    stars.forEach((s, i) => s.classList.toggle('active', i < value));
  };

  document.addEventListener('click', (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.classList.contains('review-btn')) {
      activeReviewProviderId = target.dataset.providerId || null;
      overlay?.classList.add('active');
    }
  });

  close?.addEventListener('click', () => overlay?.classList.remove('active'));
  overlay?.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.remove('active');
  });

  stars.forEach((star, i) => {
    star.addEventListener('click', () => {
      rating = i + 1;
      paintStars(rating);
    });
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!activeReviewProviderId) {
      window.showToast('Provider info missing', 'error');
      return;
    }
    if (!rating) {
      window.showToast('Select a rating first', 'warning');
      return;
    }

    const reviewText = document.getElementById('reviewText')?.value.trim() || '';
    if (!reviewText) {
      window.showToast('Please write review comment', 'warning');
      return;
    }

    try {
      await window.ApiClient.request('/reviews', {
        method: 'POST',
        body: {
          provider: activeReviewProviderId,
          rating,
          comment: reviewText
        }
      });
      window.showToast('Review submitted', 'success');
      overlay?.classList.remove('active');
      form.reset();
      rating = 0;
      paintStars(0);
      activeReviewProviderId = null;

      await loadReviews();
      renderMyReviews();
      updateDashboardStats();
      renderBookings();
    } catch (error) {
      window.showToast(error.message || 'Review failed', 'error');
    }
  });
})();

(function initDeleteReviewHandler() {
  document.addEventListener('click', async (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    if (!target.classList.contains('delete-review-btn')) return;

    const reviewId = target.dataset.reviewId;
    if (!reviewId) return;

    const ok = window.confirm('Delete this review?');
    if (!ok) return;

    try {
      await window.ApiClient.request(`/reviews/${reviewId}`, { method: 'DELETE' });
      window.showToast('Review deleted', 'success');
      await loadReviews();
      renderMyReviews();
      updateDashboardStats();
      renderBookings();
    } catch (error) {
      window.showToast(error.message || 'Failed to delete review', 'error');
    }
  });
})();

(function initDeleteBookingHandler() {
  document.addEventListener('click', async (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    if (!target.classList.contains('delete-booking-btn')) return;

    const bookingId = target.dataset.bookingId;
    if (!bookingId) return;

    const ok = window.confirm('Delete this booking? This will also remove chat history linked to it.');
    if (!ok) return;

    try {
      await window.ApiClient.request(`/bookings/${bookingId}`, { method: 'DELETE' });
      window.showToast('Booking deleted', 'success');
      await Promise.all([loadBookings(), loadReviews()]);
      renderBookings();
      renderMyReviews();
      updateDashboardStats();
    } catch (error) {
      window.showToast(error.message || 'Failed to delete booking', 'error');
    }
  });
})();

document.addEventListener('DOMContentLoaded', async () => {
  const user = await window.AuthState.refreshUser({ strict: true });
  if (!user) {
    window.location.href = 'login.html';
    return;
  }
  if (user.role !== 'user') {
    window.location.href = 'provider-dashboard.html';
    return;
  }

  updateProfileUI(user);
  initEditUserProfile(user);

  try {
    await Promise.all([loadBookings(), loadReviews()]);
    renderBookings();
    renderMyReviews();
    updateDashboardStats();
  } catch (error) {
    window.showToast(error.message || 'Failed to load dashboard', 'error');
  }
});
