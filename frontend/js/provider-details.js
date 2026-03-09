'use strict';

let providerId = null;
let rate = 600;

function setText(selector, text) {
  const el = document.querySelector(selector);
  if (el) el.textContent = text;
}

function updateSummary() {
  const hoursInput = document.getElementById('bookingHours');
  const hoursEl = document.getElementById('summaryHours');
  const subtotalEl = document.getElementById('summarySubtotal');
  const totalEl = document.getElementById('summaryTotal');
  if (!hoursInput || !hoursEl || !subtotalEl || !totalEl) return;

  const hours = Math.max(1, Number(hoursInput.value || 1));
  const subtotal = rate * hours;
  const total = subtotal;

  hoursEl.textContent = `${hours} hour${hours > 1 ? 's' : ''}`;
  subtotalEl.textContent = `Rs ${subtotal}`;
  totalEl.textContent = `Rs ${total}`;
}

function renderPortfolio(works) {
  const grid = document.querySelector('.portfolio-grid');
  if (!grid) return;

  if (!Array.isArray(works) || !works.length) {
    grid.innerHTML = '<div class="portfolio-item" style="grid-column:1/-1;aspect-ratio:auto;padding:16px;display:flex;align-items:center;justify-content:center">No portfolio posts yet.</div>';
    return;
  }

  const backendBase = window.ApiClient.getBaseUrl().replace(/\/api$/, '');
  grid.innerHTML = works.map((work) => {
    const media = Array.isArray(work.media) ? work.media[0] : null;
    const caption = work && work.caption ? work.caption : '';

    if (!media || !media.url) {
      return `<div class="portfolio-item"><div class="portfolio-item-overlay">${caption || 'View'}</div></div>`;
    }

    const mediaUrl = media.url.startsWith('http') ? media.url : `${backendBase}${media.url}`;
    const mediaHtml = String(media.type || '').startsWith('video/')
      ? `<video src="${mediaUrl}" muted playsinline style="width:100%;height:100%;object-fit:cover"></video>`
      : `<img src="${mediaUrl}" alt="Provider work" style="width:100%;height:100%;object-fit:cover">`;

    return `
      <div class="portfolio-item">
        ${mediaHtml}
        <div class="portfolio-item-overlay">${caption || 'View'}</div>
      </div>
    `;
  }).join('');
}

function renderReviews(reviewData) {
  const reviews = Array.isArray(reviewData) ? reviewData : [];
  const summaryLabel = document.querySelector('.big-rating-label');
  if (summaryLabel) {
    summaryLabel.textContent = reviews.length
      ? `Based on ${reviews.length} review${reviews.length > 1 ? 's' : ''}`
      : 'No reviews yet';
  }

  const breakdown = document.querySelector('.rating-breakdown');
  if (breakdown) {
    const counts = [5, 4, 3, 2, 1].map((star) => reviews.filter((r) => Number(r.rating || 0) === star).length);
    const total = reviews.length || 1;
    breakdown.innerHTML = counts.map((count, i) => {
      const star = 5 - i;
      const width = Math.round((count / total) * 100);
      return `
        <div class="rating-bar-row">
          <span class="rating-bar-label">${star} star</span>
          <div class="rating-bar-track"><div class="rating-bar-fill" style="width:${width}%"></div></div>
          <span class="rating-bar-count">${count}</span>
        </div>
      `;
    }).join('');
  }

  document.querySelectorAll('.review-card').forEach((card) => card.remove());
  const reviewsSummary = document.querySelector('.reviews-summary');
  if (!reviewsSummary || !reviewsSummary.parentElement) return;

  if (!reviews.length) {
    const emptyCard = document.createElement('div');
    emptyCard.className = 'review-card';
    emptyCard.innerHTML = '<p class="review-text">No reviews submitted yet.</p>';
    reviewsSummary.parentElement.appendChild(emptyCard);
    return;
  }

  reviews.slice(0, 20).forEach((review) => {
    const reviewer = review.user && review.user.name ? review.user.name : 'User';
    const dateObj = new Date(review.createdAt);
    const dateText = Number.isNaN(dateObj.getTime()) ? '' : dateObj.toLocaleDateString();
    const initials = reviewer.split(' ').map((x) => x[0]).join('').slice(0, 2).toUpperCase();
    const rating = Number(review.rating || 0);

    const card = document.createElement('div');
    card.className = 'review-card';
    card.innerHTML = `
      <div class="review-header">
        <div class="avatar avatar-sm">${initials}</div>
        <div class="review-author-info"><h4>${reviewer}</h4><div class="review-date">${dateText}</div></div>
        <div class="badge badge-warning">${rating}/5</div>
      </div>
      <p class="review-text">${review.comment || ''}</p>
    `;
    reviewsSummary.parentElement.appendChild(card);
  });
}

async function loadProvider() {
  const params = new URLSearchParams(window.location.search);
  providerId = params.get('id');
  if (!providerId) return;

  const result = await window.ApiClient.request(`/providers/${providerId}`);
  const provider = result && result.data ? result.data : null;
  if (!provider) return;

  const userName = provider.user && provider.user.name ? provider.user.name : 'Service Provider';
  const serviceType = provider.serviceType || 'Service';
  const location = provider.location || 'Unknown';
  const rating = Number(provider.rating || 0).toFixed(1);
  const stats = provider.stats || {};
  rate = Number(provider.pricePerHour || 600);

  setText('.profile-name', userName);
  setText('.profile-specialty-tag', `Service: ${serviceType}`);
  setText('.profile-meta-item:nth-child(1)', `Location: ${location}`);
  setText('#statRating', rating);
  setText('#statReviews', String(Number(stats.reviewsCount || 0)));
  setText('#statJobsDone', String(Number(stats.jobsDone || 0)));
  setText('#statOnTime', `${Number(stats.onTimeRate || 0)}%`);
  setText('.big-rating-number', rating);
  setText('.about-text', provider.description || 'No description added yet.');
  setText('#ratePerHour', `Rs ${rate}`);
  const rateEl = document.getElementById('ratePerHour');
  if (rateEl) rateEl.dataset.rate = String(rate);

  const reviews = await window.ApiClient.request(`/reviews/${providerId}`);
  const reviewData = reviews && reviews.data ? reviews.data : [];
  renderReviews(reviewData);

  const worksResult = await window.ApiClient.request(`/providers/${providerId}/works`);
  renderPortfolio(worksResult && worksResult.data ? worksResult.data : []);

  updateSummary();
}

(function initBookingSummary() {
  const dateInput = document.getElementById('bookingDate');
  const hoursInput = document.getElementById('bookingHours');
  if (!hoursInput) return;

  hoursInput.addEventListener('input', updateSummary);
  if (dateInput) dateInput.addEventListener('change', updateSummary);
  updateSummary();
})();

(function initActions() {
  const bookBtn = document.getElementById('bookNowBtn');
  const contactBtn = document.getElementById('contactBtn');

  if (bookBtn) {
    bookBtn.addEventListener('click', async (e) => {
      e.preventDefault();

      const user = await window.AuthState.refreshUser();
      if (!user) {
        window.showToast('Please login to book service', 'warning');
        setTimeout(() => { window.location.href = 'login.html'; }, 400);
        return;
      }
      if (user.role !== 'user') {
        window.showToast('Only customer accounts can book services', 'warning');
        return;
      }
      if (!providerId) {
        window.showToast('Invalid provider', 'error');
        return;
      }

      const dateValue = document.getElementById('bookingDate') ? document.getElementById('bookingDate').value : '';
      if (!dateValue) {
        window.showToast('Please select preferred date', 'warning');
        return;
      }

      try {
        await window.ApiClient.request('/bookings', {
          method: 'POST',
          body: {
            provider: providerId,
            date: new Date(dateValue).toISOString()
          }
        });
        window.showToast('Booking request sent successfully', 'success');
      } catch (error) {
        window.showToast(error.message || 'Booking failed', 'error');
      }
    });
  }

  if (contactBtn) {
    contactBtn.addEventListener('click', () => {
      window.location.href = 'chat.html';
    });
  }
})();

document.addEventListener('DOMContentLoaded', () => {
  loadProvider().catch((error) => {
    window.showToast(error.message || 'Failed to load provider', 'error');
  });
});
