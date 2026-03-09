'use strict';

function setInputError(inputId, errorId, show) {
  const input = document.getElementById(inputId);
  const error = document.getElementById(errorId);
  if (!input || !error) return;
  input.classList.toggle('error', show);
  error.classList.toggle('show', show);
}

function emailValid(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function phoneValid(value) {
  return /^[0-9+\-\s()]{7,15}$/.test(value);
}

function activeRole() {
  return document.querySelector('.role-btn.active')?.dataset.role || 'user';
}

function redirectByRole(role) {
  window.location.href = role === 'provider' ? 'provider-dashboard.html' : 'user-dashboard.html';
}

(function removeGoogleAuthOption() {
  const candidates = Array.from(
    document.querySelectorAll(
      '#googleLoginBtn, .google-login-btn, .btn-google, [data-auth="google"], [data-provider="google"]'
    )
  );

  const textMatches = Array.from(document.querySelectorAll('button, a')).filter((el) =>
    /continue\s+with\s+google/i.test((el.textContent || '').trim())
  );

  [...candidates, ...textMatches].forEach((el) => el.remove());
})();

(function initRoleToggle() {
  const roleButtons = document.querySelectorAll('.role-btn');
  const providerFields = document.getElementById('providerFields');
  if (!roleButtons.length) return;

  const syncRole = (role) => {
    roleButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.role === role));
    if (providerFields) providerFields.classList.toggle('active', role === 'provider');
  };

  roleButtons.forEach((btn) => {
    btn.addEventListener('click', () => syncRole(btn.dataset.role || 'user'));
  });

  const roleFromUrl = new URL(window.location.href).searchParams.get('role');
  if (roleFromUrl === 'provider' || roleFromUrl === 'user') syncRole(roleFromUrl);
})();

(function initPasswordToggles() {
  const loginToggle = document.getElementById('togglePassword');
  const regToggle = document.getElementById('toggleRegPassword');

  if (loginToggle) {
    loginToggle.addEventListener('click', () => {
      const input = document.getElementById('loginPassword');
      if (!input) return;
      input.type = input.type === 'password' ? 'text' : 'password';
    });
  }

  if (regToggle) {
    regToggle.addEventListener('click', () => {
      const input = document.getElementById('regPassword');
      if (!input) return;
      input.type = input.type === 'password' ? 'text' : 'password';
    });
  }
})();

(function initLoginForm() {
  const form = document.getElementById('loginForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const role = activeRole();
    const email = document.getElementById('loginEmail')?.value.trim() || '';
    const password = document.getElementById('loginPassword')?.value || '';

    const emailOk = emailValid(email);
    const passwordOk = password.length >= 6;

    setInputError('loginEmail', 'emailError', !emailOk);
    setInputError('loginPassword', 'passwordError', !passwordOk);

    if (!emailOk || !passwordOk) return;

    try {
      const result = await window.ApiClient.request('/auth/login', {
        method: 'POST',
        body: { email, password, role }
      });
      const user = result && result.data ? result.data : null;
      if (!user) throw new Error('Login response invalid');

      window.AuthState.setUser(user);
      window.showToast('Login successful', 'success');
      setTimeout(() => redirectByRole(user.role), 350);
    } catch (error) {
      window.showToast(error.message || 'Login failed', 'error');
    }
  });
})();

(function initRegisterForm() {
  const form = document.getElementById('registerForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const role = activeRole();
    const firstName = document.getElementById('firstName')?.value.trim() || '';
    const lastName = document.getElementById('lastName')?.value.trim() || '';
    const email = document.getElementById('regEmail')?.value.trim() || '';
    const phone = document.getElementById('phone')?.value.trim() || '';
    const city = document.getElementById('city')?.value.trim() || '';
    const password = document.getElementById('regPassword')?.value || '';
    const confirmPassword = document.getElementById('confirmPassword')?.value || '';
    const terms = document.getElementById('terms')?.checked;

    let valid = true;

    const firstOk = firstName.length > 0;
    setInputError('firstName', 'firstNameError', !firstOk);
    valid = valid && firstOk;

    const lastOk = lastName.length > 0;
    setInputError('lastName', 'lastNameError', !lastOk);
    valid = valid && lastOk;

    const emailOk = emailValid(email);
    setInputError('regEmail', 'regEmailError', !emailOk);
    valid = valid && emailOk;

    const phoneOk = phoneValid(phone);
    setInputError('phone', 'phoneError', !phoneOk);
    valid = valid && phoneOk;

    const cityOk = city.length > 0;
    setInputError('city', 'cityError', !cityOk);
    valid = valid && cityOk;

    const passOk = password.length >= 8;
    setInputError('regPassword', 'regPasswordError', !passOk);
    valid = valid && passOk;

    const matchOk = password === confirmPassword && confirmPassword.length > 0;
    setInputError('confirmPassword', 'confirmPasswordError', !matchOk);
    valid = valid && matchOk;

    const termsError = document.getElementById('termsError');
    if (termsError) termsError.classList.toggle('show', !terms);
    valid = valid && !!terms;

    let experience = 0;
    let hourlyRate = 0;
    let specialtyValue = '';

    if (role === 'provider') {
      const checked = document.querySelectorAll('input[name="specialty"]:checked');
      const specialtyError = document.getElementById('specialtyError');
      if (specialtyError) specialtyError.classList.toggle('show', checked.length === 0);
      valid = valid && checked.length > 0;

      experience = Number(document.getElementById('experience')?.value.trim() || 0);
      hourlyRate = Number(document.getElementById('hourlyRate')?.value.trim() || 0);
      specialtyValue = checked[0]?.value || '';

      const expOk = experience > 0;
      const rateOk = hourlyRate > 0;
      setInputError('experience', 'experienceError', !expOk);
      setInputError('hourlyRate', 'rateError', !rateOk);
      valid = valid && expOk && rateOk;
    }

    if (!valid) return;

    const name = `${firstName} ${lastName}`.trim();

    try {
      const registerBody = {
        name,
        email,
        password,
        role
      };

      if (role === 'provider') {
        const bio = document.getElementById('bio')?.value.trim() || `${specialtyValue} services`;
        registerBody.providerProfile = {
          serviceType: specialtyValue || 'general',
          description: `${bio}. Experience: ${experience} years.`,
          pricePerHour: hourlyRate,
          location: city
        };
      }

      const registerResult = await window.ApiClient.request('/auth/register', {
        method: 'POST',
        body: registerBody
      });

      const user = registerResult && registerResult.data ? registerResult.data : null;
      if (!user) throw new Error('Registration response invalid');
      window.AuthState.setUser(user);

      window.showToast('Account created successfully', 'success');
      setTimeout(() => redirectByRole(role), 350);
    } catch (error) {
      window.showToast(error.message || 'Registration failed', 'error');
    }
  });
})();
