'use strict';

let providerBookings = [];
let providerProfile = null;
let pendingFiles = [];

function mapStatusToUi(status) {
  if (status === 'accepted') return 'accepted';
  if (status === 'completed') return 'completed';
  if (status === 'rejected') return 'rejected';
  return 'pending';
}

function uiStatusLabel(status) {
  if (status === 'accepted') return 'Accepted';
  if (status === 'completed') return 'Completed';
  if (status === 'rejected') return 'Rejected';
  return 'Pending';
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

function updateProviderProfileUI(user) {
  const avatar = document.querySelector('.provider-card-avatar');
  const nameEl = document.querySelector('.provider-card-name');
  const specialtyEl = document.querySelector('.provider-card-specialty');

  if (avatar) {
    avatar.textContent = (user.name || 'P')
      .split(' ')
      .map((x) => x[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }
  if (nameEl) nameEl.textContent = user.name || 'Provider';
  if (specialtyEl) {
    const service = providerProfile && providerProfile.serviceType ? providerProfile.serviceType : 'Provider profile';
    specialtyEl.textContent = service;
  }
}

function initEditProviderProfile(user) {
  const btn = document.getElementById('editProviderProfileBtn');
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

    const currentService = (providerProfile && providerProfile.serviceType) || '';
    const currentDescription = (providerProfile && providerProfile.description) || '';
    const currentPrice = (providerProfile && providerProfile.pricePerHour) || 0;
    const currentLocation = (providerProfile && providerProfile.location) || '';

    const serviceType = (window.prompt('Service type:', currentService) || '').trim();
    if (!serviceType) {
      window.showToast('Service type cannot be empty', 'warning');
      return;
    }
    const description = (window.prompt('Description:', currentDescription) || '').trim();
    if (!description) {
      window.showToast('Description cannot be empty', 'warning');
      return;
    }
    const priceRaw = window.prompt('Price per hour:', String(currentPrice));
    if (priceRaw === null) return;
    const pricePerHour = Number(priceRaw);
    if (!Number.isFinite(pricePerHour) || pricePerHour <= 0) {
      window.showToast('Invalid price per hour', 'warning');
      return;
    }
    const location = (window.prompt('Location:', currentLocation) || '').trim();
    if (!location) {
      window.showToast('Location cannot be empty', 'warning');
      return;
    }

    try {
      const result = await window.ApiClient.request('/auth/profile', {
        method: 'PUT',
        body: {
          name,
          email,
          providerProfile: { serviceType, description, pricePerHour, location }
        }
      });

      const updatedUser = result && result.data && result.data.user ? result.data.user : null;
      const updatedProvider = result && result.data && result.data.provider ? result.data.provider : null;
      if (updatedUser) {
        window.AuthState.setUser(updatedUser);
        user.name = updatedUser.name;
        user.email = updatedUser.email;
      }
      if (updatedProvider) providerProfile = updatedProvider;

      updateProviderProfileUI(user);
      updateProviderStats();
      window.showToast('Profile updated', 'success');
    } catch (error) {
      window.showToast(error.message || 'Failed to update profile', 'error');
    }
  });
}

function updateProviderStats() {
  const totalJobs = providerBookings.length;
  const pendingJobs = providerBookings.filter((b) => b.status === 'pending').length;
  const completedJobs = providerBookings.filter((b) => b.status === 'completed').length;
  const totalEarnings = providerBookings
    .filter((b) => b.status === 'completed')
    .reduce((sum, b) => sum + Number((b.provider && b.provider.pricePerHour) || 0), 0);

  const avgRating = providerProfile ? Number(providerProfile.rating || 0) : 0;

  const providerCardStats = document.querySelectorAll('.provider-card-stat .val');
  if (providerCardStats[0]) providerCardStats[0].textContent = avgRating ? String(avgRating.toFixed(1)) : '0.0';
  if (providerCardStats[1]) providerCardStats[1].textContent = String(totalJobs);
  if (providerCardStats[2]) providerCardStats[2].textContent = `₹${Math.round(totalEarnings / 1000)}K`;

  const bannerAmount = document.querySelector('.earnings-amount');
  if (bannerAmount) bannerAmount.textContent = `₹${formatINR(totalEarnings)}`;

  const statCards = document.querySelectorAll('.provider-stats-grid .stat-card .stat-card-value');
  if (statCards[0]) statCards[0].textContent = String(totalJobs);
  if (statCards[1]) statCards[1].textContent = String(pendingJobs);
  if (statCards[2]) statCards[2].textContent = avgRating ? String(avgRating.toFixed(1)) : '0.0';
  if (statCards[3]) statCards[3].textContent = `${Math.round(totalEarnings / 1000)}K`;

  const earningsChange = document.querySelector('.earnings-change');
  if (earningsChange) {
    earningsChange.textContent = completedJobs
      ? `${completedJobs} completed jobs`
      : 'No completed jobs yet';
  }
}

function renderBookings(filter = 'all') {
  const list = document.getElementById('bookingManagementList');
  if (!list) return;

  const normalizedFilter = filter === 'confirmed' ? 'accepted' : filter;
  const rows = providerBookings.filter((b) => normalizedFilter === 'all' || mapStatusToUi(b.status) === normalizedFilter);

  if (!rows.length) {
    list.innerHTML = `
      <div class="booking-management-item">
        <div class="avatar">📭</div>
        <div class="booking-client-info">
          <div class="booking-client-name">No bookings</div>
          <div class="booking-service-meta"><span>No items in this filter</span></div>
        </div>
      </div>
    `;
    return;
  }

  list.innerHTML = rows.map((b) => {
    const userName = (b.user && b.user.name) || 'Customer';
    const customerUserId = (b.user && b.user._id) ? b.user._id : '';
    const service = (b.provider && b.provider.serviceType) || 'Service';
    const formattedDateTime = formatBookingDateTime(b.date);
    const date = formattedDateTime.date;
    const time = formattedDateTime.time;
    const amount = (b.provider && b.provider.pricePerHour) || 0;
    const initials = userName.split(' ').map((x) => x[0]).join('').slice(0, 2).toUpperCase();
    const uiStatus = mapStatusToUi(b.status);

    return `
      <div class="booking-management-item">
        <div class="avatar">${initials}</div>
        <div class="booking-client-info">
          <div class="booking-client-name">${userName}</div>
          <div class="booking-service-meta">
            <span>${service}</span>
            <span>${date} • ${time}</span>
            <span>₹${amount}</span>
          </div>
        </div>
        <select class="status-dropdown" data-id="${b._id}">
          <option value="pending" ${uiStatus === 'pending' ? 'selected' : ''}>Pending</option>
          <option value="accepted" ${uiStatus === 'accepted' ? 'selected' : ''}>Accepted</option>
          <option value="completed" ${uiStatus === 'completed' ? 'selected' : ''}>Completed</option>
          <option value="rejected" ${uiStatus === 'rejected' ? 'selected' : ''}>Rejected</option>
        </select>
        <a href="chat.html${customerUserId ? `?partnerId=${customerUserId}` : ''}" class="btn btn-sm btn-outline">Chat</a>
        ${
          (uiStatus === 'completed' || uiStatus === 'rejected')
            ? `<button class="btn btn-sm btn-outline delete-booking-btn" data-id="${b._id}" type="button">Delete</button>`
            : ''
        }
      </div>
    `;
  }).join('');

  list.querySelectorAll('.status-dropdown').forEach((dropdown) => {
    dropdown.addEventListener('change', async () => {
      try {
        await window.ApiClient.request(`/bookings/${dropdown.dataset.id}/status`, {
          method: 'PUT',
          body: { status: dropdown.value }
        });

        const item = providerBookings.find((x) => x._id === dropdown.dataset.id);
        if (item) item.status = dropdown.value;
        window.showToast(`Booking marked ${uiStatusLabel(dropdown.value)}`, 'success');
        updateProviderStats();
      } catch (error) {
        window.showToast(error.message || 'Failed to update status', 'error');
      }
    });
  });

  list.querySelectorAll('.delete-booking-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const ok = window.confirm('Delete this booking? This will also remove chat history linked to it.');
      if (!ok) return;
      try {
        await window.ApiClient.request(`/bookings/${btn.dataset.id}`, { method: 'DELETE' });
        window.showToast('Booking deleted', 'success');
        await loadProviderBookings();
      } catch (error) {
        window.showToast(error.message || 'Failed to delete booking', 'error');
      }
    });
  });
}

function renderWorks(works = []) {
  const grid = document.getElementById('portfolioManageGrid');
  if (!grid) return;

  if (!works.length) {
    grid.innerHTML = `
      <div class="portfolio-manage-item" style="grid-column:1/-1;aspect-ratio:auto;padding:16px;font-size:0.9rem">
        No posted work yet.
      </div>
    `;
    return;
  }

  grid.innerHTML = works.map((work) => {
    const firstMedia = (work.media || [])[0] || null;
    const hasVideo = (work.media || []).some((m) => String(m.type || '').startsWith('video/'));
    const icon = hasVideo ? '&#127909;' : '&#128247;';
    const mediaCount = (work.media || []).length;
    let preview = icon;

    if (firstMedia && firstMedia.url) {
      const mediaUrl = firstMedia.url.startsWith('http')
        ? firstMedia.url
        : `${window.ApiClient.getBaseUrl().replace(/\/api$/, '')}${firstMedia.url}`;

      preview = String(firstMedia.type || '').startsWith('video/')
        ? `<video src="${mediaUrl}" muted playsinline style="width:100%;height:100%;object-fit:cover"></video>`
        : `<img src="${mediaUrl}" alt="Work media" style="width:100%;height:100%;object-fit:cover">`;
    }

    return `
      <div class="portfolio-manage-item" title="${work.caption || ''}">
        ${preview}
        <span style="position:absolute;left:8px;right:8px;bottom:8px;font-size:0.62rem;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:rgba(255,255,255,0.9);padding:2px 6px;border-radius:999px;">
          ${work.caption || ''} (${mediaCount})
        </span>
      </div>
    `;
  }).join('');
}

function renderProviderReviews(reviews) {
  const list = document.getElementById('providerReviewsList');
  if (!list) return;

  if (!reviews.length) {
    list.innerHTML = `
      <div class="booking-management-item">
        <div class="avatar">⭐</div>
        <div class="booking-client-info">
          <div class="booking-client-name">No reviews yet</div>
          <div class="booking-service-meta"><span>Reviews from customers will appear here.</span></div>
        </div>
      </div>
    `;
    return;
  }

  list.innerHTML = reviews.map((r) => {
    const userName = (r.user && r.user.name) || 'Customer';
    const initials = userName.split(' ').map((x) => x[0]).join('').slice(0, 2).toUpperCase();
    const stars = '★'.repeat(Number(r.rating || 0)) + '☆'.repeat(5 - Number(r.rating || 0));
    const dateObj = new Date(r.createdAt);
    const date = Number.isNaN(dateObj.getTime()) ? '' : dateObj.toLocaleDateString();

    return `
      <div class="booking-management-item">
        <div class="avatar">${initials}</div>
        <div class="booking-client-info">
          <div class="booking-client-name">${userName}</div>
          <div class="booking-service-meta">
            <span style="color:var(--warning);font-weight:700">${stars}</span>
            <span>${date}</span>
          </div>
          <div style="font-size:0.86rem;color:var(--text-body);line-height:1.6;margin-top:4px">${r.comment || ''}</div>
        </div>
      </div>
    `;
  }).join('');
}

async function loadProviderBookings() {
  const result = await window.ApiClient.request('/bookings/my');
  providerBookings = result && result.data ? result.data : [];
  renderBookings('all');
  updateProviderStats();
}

async function loadProviderProfile() {
  const result = await window.ApiClient.request('/providers/me');
  providerProfile = result && result.data ? result.data : null;
}

async function loadWorks() {
  const result = await window.ApiClient.request('/providers/works/my');
  renderWorks(result && result.data ? result.data : []);
}

async function loadProviderReviews() {
  if (!providerProfile || !providerProfile._id) return;
  const result = await window.ApiClient.request(`/reviews/${providerProfile._id}`);
  renderProviderReviews(result && result.data ? result.data : []);
}

(function initTabs() {
  const tabs = document.querySelectorAll('.tab-btn');
  if (!tabs.length) return;

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((x) => x.classList.remove('active'));
      tab.classList.add('active');
      renderBookings(tab.dataset.tab || 'all');
    });
  });
})();

(function initAvailabilityToggle() {
  const toggle = document.getElementById('availabilityToggle');
  const switchEl = document.getElementById('availabilitySwitch');
  const textEl = document.getElementById('availabilityText');
  if (!toggle || !switchEl || !textEl) return;

  toggle.addEventListener('click', () => {
    const on = switchEl.classList.toggle('on');
    toggle.classList.toggle('unavailable', !on);
    textEl.textContent = on ? 'Available now' : 'Unavailable';
    window.showToast(on ? 'You are live for bookings' : 'You are marked unavailable', 'info');
  });
})();

(function initPortfolioUpload() {
  const area = document.getElementById('portfolioUploadArea');
  const input = document.getElementById('portfolioFileInput');
  const captionInput = document.getElementById('portfolioCaption');
  const wordCountEl = document.getElementById('captionWordCount');
  const postBtn = document.getElementById('postWorkBtn');
  if (!area || !input || !captionInput || !wordCountEl || !postBtn) return;

  const MAX_WORDS = 50;
  const MAX_SIZE_BYTES = 50 * 1024 * 1024;
  const getWords = (text) => (text.trim() ? text.trim().split(/\s+/) : []);

  const refreshWordCount = () => {
    const words = getWords(captionInput.value);
    if (words.length > MAX_WORDS) captionInput.value = words.slice(0, MAX_WORDS).join(' ');
    wordCountEl.textContent = `${getWords(captionInput.value).length}/${MAX_WORDS}`;
  };

  area.addEventListener('click', () => input.click());
  captionInput.addEventListener('input', refreshWordCount);
  refreshWordCount();

  input.addEventListener('change', () => {
    const files = Array.from(input.files || []);
    if (!files.length) return;

    files.forEach((file) => {
      const validType = file.type.startsWith('image/') || file.type.startsWith('video/');
      if (!validType) {
        window.showToast(`${file.name}: only photo/video allowed`, 'warning');
        return;
      }
      if (file.size > MAX_SIZE_BYTES) {
        window.showToast(`${file.name}: exceeds 50MB limit`, 'warning');
        return;
      }
      pendingFiles.push(file);
    });

    if (pendingFiles.length) {
      window.showToast(`${pendingFiles.length} file(s) selected. Click Post Work.`, 'info');
    }
    input.value = '';
  });

  postBtn.addEventListener('click', async () => {
    const caption = captionInput.value.trim();
    if (!caption) {
      window.showToast('Caption is required', 'warning');
      return;
    }
    if (!pendingFiles.length) {
      window.showToast('Please select at least one file', 'warning');
      return;
    }

    try {
      const formData = new FormData();
      formData.append('caption', caption);
      pendingFiles.forEach((file) => {
        formData.append('media', file, file.name);
      });

      await window.ApiClient.request('/providers/works', {
        method: 'POST',
        body: formData
      });
      window.showToast('Work posted successfully', 'success');
      captionInput.value = '';
      pendingFiles = [];
      refreshWordCount();
      await loadWorks();
    } catch (error) {
      window.showToast(error.message || 'Failed to post work', 'error');
    }
  });
})();

document.addEventListener('DOMContentLoaded', async () => {
  const user = await window.AuthState.refreshUser({ strict: true });
  if (!user) {
    window.location.href = 'login.html';
    return;
  }
  if (user.role !== 'provider') {
    window.location.href = 'user-dashboard.html';
    return;
  }

  try {
    await loadProviderProfile();
    updateProviderProfileUI(user);
    initEditProviderProfile(user);
    await Promise.all([loadProviderBookings(), loadWorks(), loadProviderReviews()]);
  } catch (error) {
    window.showToast(error.message || 'Failed to load provider dashboard', 'error');
  }
});
