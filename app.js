// DOM Elements
const authScreen = document.getElementById('auth-screen');
const authForm = document.getElementById('auth-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('login-btn');
const signupBtn = document.getElementById('signup-btn');
const authError = document.getElementById('auth-error');

const dashboard = document.getElementById('dashboard');
const logoutBtn = document.getElementById('logout-btn');
const fileInput = document.getElementById('file-input');
const imageCount = document.getElementById('image-count');
const uploadProgress = document.getElementById('upload-progress');
const progressFill = document.getElementById('progress-fill');
const progressText = document.getElementById('progress-text');
const startViewerBtn = document.getElementById('start-viewer-btn');

const viewer = document.getElementById('viewer');
const currentImage = document.getElementById('current-image');
const counter = document.getElementById('counter');
const deleteBtn = document.getElementById('delete-btn');
const backBtn = document.getElementById('back-btn');
const nextBtn = document.getElementById('next-btn');
const viewerExitBtn = document.getElementById('viewer-exit-btn');

const loading = document.getElementById('loading');
const deleteModal = document.getElementById('delete-modal');
const confirmDeleteBtn = document.getElementById('confirm-delete');
const cancelDeleteBtn = document.getElementById('cancel-delete');

// State
let currentUser = null;
let images = [];
let shuffledImages = [];
let currentIndex = 0;

// Zoom state
let zoomLevel = 1;
let panX = 0;
let panY = 0;
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;

// ==================== AUTH ====================

async function handleLogin(e) {
  e.preventDefault();
  authError.textContent = '';

  const email = emailInput.value;
  const password = passwordInput.value;

  showLoading();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  hideLoading();

  if (error) {
    authError.textContent = error.message;
    return;
  }

  currentUser = data.user;
  showDashboard();
}

async function handleSignup() {
  authError.textContent = '';

  const email = emailInput.value;
  const password = passwordInput.value;

  if (!email || !password) {
    authError.textContent = 'Please enter email and password';
    return;
  }

  if (password.length < 6) {
    authError.textContent = 'Password must be at least 6 characters';
    return;
  }

  showLoading();

  const { data, error } = await supabase.auth.signUp({
    email,
    password
  });

  hideLoading();

  if (error) {
    authError.textContent = error.message;
    return;
  }

  // Check if user needs email confirmation
  if (data.user && data.user.identities && data.user.identities.length === 0) {
    authError.textContent = 'This email is already registered. Try logging in.';
    return;
  }

  // Check if session exists (means no email confirmation needed)
  if (data.session) {
    currentUser = data.user;
    showDashboard();
  } else {
    // Email confirmation might still be required
    authError.textContent = 'Account created! You can now log in.';
  }
}

async function handleLogout() {
  await supabase.auth.signOut();
  currentUser = null;
  images = [];
  shuffledImages = [];
  authScreen.classList.remove('hidden');
  dashboard.classList.add('hidden');
  viewer.classList.add('hidden');
}

async function checkAuth() {
  const { data: { session } } = await supabase.auth.getSession();

  if (session) {
    currentUser = session.user;
    showDashboard();
  }
}

// ==================== DASHBOARD ====================

async function showDashboard() {
  authScreen.classList.add('hidden');
  dashboard.classList.remove('hidden');
  await loadUserImages();
}

async function loadUserImages() {
  if (!currentUser) return;

  showLoading();

  const { data, error } = await supabase.storage
    .from('images')
    .list(currentUser.id, {
      limit: 1000,
      sortBy: { column: 'created_at', order: 'desc' }
    });

  hideLoading();

  if (error) {
    console.error('Error loading images:', error);
    imageCount.textContent = 'Error loading images';
    return;
  }

  // Filter for image files only
  const imageFiles = data.filter(file => {
    const ext = file.name.split('.').pop().toLowerCase();
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext);
  });

  // Get public URLs for each image
  images = imageFiles.map(file => ({
    name: file.name,
    path: `${currentUser.id}/${file.name}`,
    url: supabase.storage.from('images').getPublicUrl(`${currentUser.id}/${file.name}`).data.publicUrl
  }));

  updateImageCount();
}

function updateImageCount() {
  imageCount.textContent = `${images.length} image${images.length !== 1 ? 's' : ''} in your collection`;
  startViewerBtn.disabled = images.length === 0;
}

// ==================== UPLOAD ====================

async function handleUpload(e) {
  const files = Array.from(e.target.files);
  if (files.length === 0) return;

  uploadProgress.classList.remove('hidden');
  progressFill.style.width = '0%';

  let uploaded = 0;
  const total = files.length;

  for (const file of files) {
    // Check if it's an image
    if (!file.type.startsWith('image/')) continue;

    const fileName = `${Date.now()}_${file.name}`;
    const filePath = `${currentUser.id}/${fileName}`;

    const { error } = await supabase.storage
      .from('images')
      .upload(filePath, file);

    if (error) {
      console.error('Upload error:', error);
    } else {
      uploaded++;
    }

    // Update progress
    const percent = Math.round((uploaded / total) * 100);
    progressFill.style.width = `${percent}%`;
    progressText.textContent = `Uploaded ${uploaded} of ${total}`;
  }

  // Reset and reload
  setTimeout(() => {
    uploadProgress.classList.add('hidden');
    fileInput.value = '';
    loadUserImages();
  }, 500);
}

// ==================== VIEWER ====================

function shuffle(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function startViewer() {
  if (images.length === 0) return;

  shuffledImages = shuffle(images);
  currentIndex = 0;

  dashboard.classList.add('hidden');
  viewer.classList.remove('hidden');

  displayImage();
}

function displayImage() {
  if (shuffledImages.length === 0) {
    exitViewer();
    return;
  }

  const image = shuffledImages[currentIndex];
  resetZoom();

  showLoading();

  const img = new Image();
  img.onload = () => {
    currentImage.src = image.url;
    hideLoading();
    updateCounter();
  };
  img.onerror = () => {
    // Skip broken images
    nextImage();
  };
  img.src = image.url;
}

function updateCounter() {
  counter.textContent = `${currentIndex + 1} / ${shuffledImages.length}`;
}

function nextImage() {
  currentIndex++;

  if (currentIndex >= shuffledImages.length) {
    shuffledImages = shuffle(images);
    currentIndex = 0;
  }

  displayImage();
}

function prevImage() {
  currentIndex--;

  if (currentIndex < 0) {
    currentIndex = shuffledImages.length - 1;
  }

  displayImage();
}

function exitViewer() {
  viewer.classList.add('hidden');
  dashboard.classList.remove('hidden');
  resetZoom();
}

// ==================== ZOOM & PAN ====================

function resetZoom() {
  zoomLevel = 1;
  panX = 0;
  panY = 0;
  applyTransform();
}

function applyTransform() {
  currentImage.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomLevel})`;
  currentImage.style.cursor = zoomLevel > 1 ? 'grab' : 'pointer';
}

viewer.addEventListener('wheel', (e) => {
  e.preventDefault();

  const zoomSpeed = 0.1;

  if (e.deltaY < 0) {
    zoomLevel = Math.min(zoomLevel + zoomSpeed, 5);
  } else {
    zoomLevel = Math.max(zoomLevel - zoomSpeed, 1);
  }

  if (zoomLevel === 1) {
    panX = 0;
    panY = 0;
  }

  applyTransform();
}, { passive: false });

currentImage.addEventListener('mousedown', (e) => {
  if (zoomLevel > 1) {
    isDragging = true;
    dragStartX = e.clientX - panX;
    dragStartY = e.clientY - panY;
    currentImage.style.cursor = 'grabbing';
  }
});

document.addEventListener('mousemove', (e) => {
  if (isDragging && zoomLevel > 1) {
    panX = e.clientX - dragStartX;
    panY = e.clientY - dragStartY;
    applyTransform();
  }
});

document.addEventListener('mouseup', () => {
  if (isDragging) {
    isDragging = false;
    currentImage.style.cursor = zoomLevel > 1 ? 'grab' : 'pointer';
  }
});

currentImage.addEventListener('dblclick', (e) => {
  e.stopPropagation();
  if (zoomLevel > 1) {
    resetZoom();
  } else {
    zoomLevel = 2;
    applyTransform();
  }
});

// Click on image to go to next (only if not zoomed)
viewer.addEventListener('click', (e) => {
  if (e.target === currentImage && zoomLevel === 1 && !isDragging) {
    nextImage();
  }
});

// ==================== DELETE ====================

function showDeleteModal() {
  deleteModal.classList.remove('hidden');
}

function hideDeleteModal() {
  deleteModal.classList.add('hidden');
}

async function deleteCurrentImage() {
  const image = shuffledImages[currentIndex];

  hideDeleteModal();
  showLoading();

  const { error } = await supabase.storage
    .from('images')
    .remove([image.path]);

  if (error) {
    console.error('Delete error:', error);
    hideLoading();
    return;
  }

  // Remove from arrays
  images = images.filter(img => img.path !== image.path);
  shuffledImages = shuffledImages.filter(img => img.path !== image.path);

  // Adjust index if needed
  if (currentIndex >= shuffledImages.length) {
    currentIndex = 0;
  }

  hideLoading();

  if (shuffledImages.length === 0) {
    exitViewer();
    loadUserImages();
  } else {
    displayImage();
  }
}

// ==================== FULLSCREEN ====================

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(err => {
      console.log('Fullscreen error:', err);
    });
  } else {
    document.exitFullscreen();
  }
}

// ==================== LOADING ====================

function showLoading() {
  loading.classList.remove('hidden');
}

function hideLoading() {
  loading.classList.add('hidden');
}

// ==================== EVENT LISTENERS ====================

// Auth
authForm.addEventListener('submit', handleLogin);
signupBtn.addEventListener('click', handleSignup);
logoutBtn.addEventListener('click', handleLogout);

// Upload
fileInput.addEventListener('change', handleUpload);

// Viewer
startViewerBtn.addEventListener('click', startViewer);
viewerExitBtn.addEventListener('click', exitViewer);
backBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  prevImage();
});
nextBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  nextImage();
});

// Delete
deleteBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  showDeleteModal();
});
confirmDeleteBtn.addEventListener('click', deleteCurrentImage);
cancelDeleteBtn.addEventListener('click', hideDeleteModal);

// Keyboard
document.addEventListener('keydown', (e) => {
  // Handle delete modal
  if (!deleteModal.classList.contains('hidden')) {
    if (e.key === 'Enter') {
      deleteCurrentImage();
    } else if (e.key === 'Escape') {
      hideDeleteModal();
    }
    return;
  }

  // Viewer controls
  if (!viewer.classList.contains('hidden')) {
    switch (e.key) {
      case 'Escape':
        exitViewer();
        break;
      case ' ':
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault();
        nextImage();
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault();
        prevImage();
        break;
      case 'f':
      case 'F':
        toggleFullscreen();
        break;
      case 'd':
      case 'D':
      case 'Delete':
        showDeleteModal();
        break;
    }
  }
});

// Init
checkAuth();
