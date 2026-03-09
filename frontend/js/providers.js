'use strict';

const specialtyLabel = {
  electrician: 'Electrician',
  plumber: 'Plumber',
  painter: 'Painter',
  carpenter: 'Carpenter',
  cleaner: 'Cleaner',
  ac: 'AC Technician',
  pest: 'Pest Control',
  general: 'General Service'
};

let providersData = [];
let activeFilter = 'all';
let activeSort = 'rating';
let activeSearch = '';
let maxPrice = Number.MAX_SAFE_INTEGER;
let minRating = 0;
let listView = false;

function stars(rating) {
  const full = Math.floor(Number(rating || 0));
  let html = '<div class="stars">';
  for (let i = 0; i < 5; i += 1) {
    html += `<span class="star ${i < full ? 'filled' : ''}">★</span>`;
  }
  html += '</div>';
  return html;
}

function normalizeProvider(item) {
  const user = item.user || {};
  const name = user.name || 'Service Provider';
  const specialty = (item.serviceType || 'general').toLowerCase();
  const city = item.location || 'Unknown';
  const price = Number(item.pricePerHour || 0);
  const rating = Number(item.rating || 0);

  return {
    id: item._id,
    name,
    specialty,
    city,
    rating,
    reviews: 0,
    experience: 5,
    price,
    available: true,
    verified: item.isApproved !== false,
    avatar: name.split(' ').map((x) => x[0]).join('').slice(0, 2).toUpperCase()
  };
}

function coverClass(specialty) {
  return `provider-card-cover provider-card-cover-pattern-${specialty}`;
}

function providerTags(item) {
  return [item.city, `${item.experience}y exp`, specialtyLabel[item.specialty] || item.specialty]
    .map((tag) => `<span class="provider-tag">${tag}</span>`)
    .join('');
}

function providerCard(item) {
  return `
    <article class="provider-card" data-id="${item.id}">
      <div class="${coverClass(item.specialty)}"></div>
      <div class="provider-card-body">
        <div class="provider-avatar-wrap">
          <div style="display:flex;align-items:center;gap:8px">
            <div class="avatar">${item.avatar}</div>
            ${item.verified ? '<span class="provider-verified-badge">✓</span>' : ''}
          </div>
          ${item.available ? '<span class="provider-available-dot"></span>' : ''}
        </div>

        <h3 class="provider-name">${item.name}</h3>
        <p class="provider-specialty">${specialtyLabel[item.specialty] || item.specialty}</p>

        <div class="provider-rating-row">
          ${stars(item.rating)}
          <span class="rating-number">${item.rating.toFixed(1)}</span>
        </div>

        <div class="provider-tags">${providerTags(item)}</div>

        <div class="provider-card-footer">
          <div class="provider-rate">₹${item.price}<span>/hr</span></div>
          <a class="btn btn-sm btn-primary" href="provider-details.html?id=${item.id}">View</a>
        </div>
      </div>
    </article>
  `;
}

function filteredProviders() {
  return providersData
    .filter((item) => activeFilter === 'all' || item.specialty === activeFilter)
    .filter((item) => item.price <= maxPrice)
    .filter((item) => item.rating >= minRating)
    .filter((item) => {
      if (!activeSearch) return true;
      const text = `${item.name} ${item.city} ${item.specialty}`.toLowerCase();
      return text.includes(activeSearch);
    })
    .sort((a, b) => {
      if (activeSort === 'rating') return b.rating - a.rating;
      if (activeSort === 'price-low') return a.price - b.price;
      if (activeSort === 'price-high') return b.price - a.price;
      return b.rating - a.rating;
    });
}

function render() {
  const grid = document.getElementById('providersGrid');
  const count = document.getElementById('providersCount');
  const empty = document.getElementById('noResults');
  if (!grid) return;

  const data = filteredProviders();
  grid.classList.toggle('list-view', listView);

  if (!data.length) {
    grid.innerHTML = '';
    if (empty) empty.style.display = 'block';
  } else {
    grid.innerHTML = data.map(providerCard).join('');
    if (empty) empty.style.display = 'none';
  }

  if (count) count.textContent = `${data.length} providers found`;
}

async function loadProviders() {
  const url = new URL(window.location.href);
  const serviceType = url.searchParams.get('category') || '';
  const search = url.searchParams.get('search') || '';
  const params = new URLSearchParams();
  if (serviceType && serviceType !== 'all') params.set('serviceType', serviceType);
  if (search) params.set('location', search);

  const query = params.toString();
  const response = await window.ApiClient.request(`/providers${query ? `?${query}` : ''}`);
  providersData = (response.data || []).map(normalizeProvider);
}

(async function init() {
  const filterButtons = document.querySelectorAll('.filter-chip');
  const searchInput = document.getElementById('providerSearch');
  const searchBtn = document.getElementById('searchBtn');
  const sortSelect = document.getElementById('sortSelect');
  const priceSlider = document.getElementById('priceSlider');
  const priceValue = document.getElementById('priceValue');
  const clearBtn = document.getElementById('clearFilters');
  const gridViewBtn = document.getElementById('gridViewBtn');
  const listViewBtn = document.getElementById('listViewBtn');

  try {
    await loadProviders();
    if (priceSlider) {
      if (providersData.length) {
        const highestPrice = providersData.reduce((max, p) => Math.max(max, Number(p.price || 0)), 0);
        const sliderMax = Math.max(2000, Math.ceil(highestPrice / 100) * 100);
        priceSlider.max = String(sliderMax);
        priceSlider.value = String(sliderMax);
        maxPrice = sliderMax;
        if (priceValue) priceValue.textContent = `Rs ${sliderMax}`;
      } else {
        maxPrice = Number(priceSlider.value || 2000);
        if (priceValue) priceValue.textContent = `Rs ${maxPrice}`;
      }
    }
  } catch (error) {
    window.showToast(error.message || 'Failed to load providers', 'error');
  }

  filterButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      filterButtons.forEach((x) => x.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.dataset.filter || 'all';
      render();
    });
  });

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      activeSearch = searchInput.value.trim().toLowerCase();
      render();
    });
  }

  if (searchBtn) {
    searchBtn.addEventListener('click', () => {
      activeSearch = (searchInput?.value || '').trim().toLowerCase();
      render();
    });
  }

  if (sortSelect) {
    sortSelect.addEventListener('change', () => {
      activeSort = sortSelect.value;
      render();
    });
  }

  if (priceSlider) {
    priceSlider.addEventListener('input', () => {
      maxPrice = Number(priceSlider.value);
      if (priceValue) priceValue.textContent = `₹${maxPrice}`;
      render();
    });
  }

  document.querySelectorAll('input[name="rating"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      minRating = Number(radio.value);
      render();
    });
  });

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      activeFilter = 'all';
      activeSort = 'rating';
      activeSearch = '';
      maxPrice = Number(priceSlider?.max || 2000);
      minRating = 0;
      if (searchInput) searchInput.value = '';
      if (sortSelect) sortSelect.value = 'rating';
      if (priceSlider) priceSlider.value = String(maxPrice);
      if (priceValue) priceValue.textContent = `Rs ${maxPrice}`;
      filterButtons.forEach((x, i) => x.classList.toggle('active', i === 0));
      const defaultRating = document.querySelector('input[name="rating"][value="0"]');
      if (defaultRating) defaultRating.checked = true;
      render();
    });
  }

  if (gridViewBtn && listViewBtn) {
    gridViewBtn.addEventListener('click', () => {
      listView = false;
      gridViewBtn.classList.add('active');
      listViewBtn.classList.remove('active');
      render();
    });

    listViewBtn.addEventListener('click', () => {
      listView = true;
      listViewBtn.classList.add('active');
      gridViewBtn.classList.remove('active');
      render();
    });
  }

  const url = new URL(window.location.href);
  const cat = url.searchParams.get('category');
  const search = url.searchParams.get('search');
  if (cat) {
    activeFilter = cat;
    const matching = document.querySelector(`.filter-chip[data-filter="${cat}"]`);
    if (matching) {
      filterButtons.forEach((x) => x.classList.remove('active'));
      matching.classList.add('active');
    }
  }
  if (search) {
    activeSearch = search.toLowerCase();
    if (searchInput) searchInput.value = search;
  }

  render();
})();
