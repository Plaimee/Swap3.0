// =========================================================
// SWAPSWAP — app state
// =========================================================
let currentStep = 1; // 1..5, steps live inside #setupPage
let consentAccepted = false;
let capturedBlob = null;
let videoStream = null;
let socketId = null;
let selectedRole = "source"; // "source" | "target"

const TOTAL_BADGES = 5;

// Role-dependent copy (kept in one place so step-4 / step-5 always match step-3)
const ROLE_COPY = {
  source: {
    processing: "กำลังนำคุณกลับไปยังอดีต...",
    result: "ย้อนเวลามายังอดีตเรียบร้อยแล้ว!",
  },
  target: {
    processing: "กำลังพาภาพศิลปะข้ามเวลามายังปัจจุบัน...",
    result: "ข้ามเวลามายังปัจจุบันเสร็จสิ้น!",
  },
};

const socket = io();

socket.on("connect", () => {
  socketId = socket.id;
  console.log("Connected to Socket. Server ID:", socketId);
});

// =========================================================
// RESULT HANDLING
// =========================================================
function handleResultReady(data) {
  console.log("Result is ready:", data);

  const qrcodeContainer = document.getElementById("qrcode");
  const resultTitle = document.getElementById("resultTitle");

  if (resultTitle) {
    resultTitle.textContent = ROLE_COPY[selectedRole].result;
  }

  const imageURL =
    typeof data === "object"
      ? data.imageURL || data.resultURL || data.url
      : data;

  if (imageURL && qrcodeContainer) {
    qrcodeContainer.innerHTML = "";

    const fullURL = imageURL.startsWith("http")
      ? imageURL
      : `${window.location.origin}${imageURL}`;

    new QRCode(qrcodeContainer, {
      text: fullURL,
      width: 180,
      height: 180,
      colorDark: "#000000",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.H,
    });
  }

  goToStep(5);
}

socket.on("your_result_ready", handleResultReady);

socket.on("result_updated_global", (data) => {
  if (currentStep === 4) {
    handleResultReady(data);
  }
});

socket.on("roop_failed", (data) => {
  console.error("Processing failed:", data);
  alert("เกิดข้อผิดพลาดในการประมวลผลภาพ: " + (data.error || "Unknown Error"));
  resetApp();
});

// =========================================================
// BOOTSTRAP EVENT WIRING
// =========================================================
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btnStart").addEventListener("click", startApp);

  document
    .getElementById("btnAcceptConsent")
    .addEventListener("click", acceptConsent);
  document.getElementById("btnCapture").addEventListener("click", takeSnapshot);
  document.getElementById("btnRetake").addEventListener("click", retakePhoto);
  document.getElementById("btnResetApp").addEventListener("click", resetApp);

  document
    .getElementById("btnStep1Next")
    .addEventListener("click", () => goToStep(2));
  document
    .getElementById("btnStep2Prev")
    .addEventListener("click", () => goBackTo(1));
  document
    .getElementById("btnStep2Next")
    .addEventListener("click", () => goToStep(3));
  document
    .getElementById("btnStep3Prev")
    .addEventListener("click", () => goBackTo(2));
  document
    .getElementById("btnStep3Next")
    .addEventListener("click", submitFinalForm);

  setupArtCarouselDots();
});

// =========================================================
// START PAGE -> SETUP PAGE
// =========================================================
function startApp() {
  document.getElementById("startPage").classList.add("d-none");
  document.getElementById("setupPage").classList.remove("d-none");
  currentStep = 1;
  updateStepUI();
}

// =========================================================
// STEP NAVIGATION
// =========================================================
function updateStepUI() {
  for (let i = 1; i <= TOTAL_BADGES; i++) {
    const stepEl = document.getElementById(`step-${i}`);
    if (stepEl) stepEl.classList.toggle("active", i === currentStep);

    const badge = document.getElementById(`badge-${i}`);
    if (!badge) continue;
    if (i < currentStep) {
      badge.className = "step-badge completed";
    } else if (i === currentStep) {
      badge.className = "step-badge active";
    } else {
      badge.className = "step-badge";
    }
  }

  document
    .getElementById("step-1-button")
    .classList.toggle("d-none", currentStep !== 1);
  document
    .getElementById("step-2-button")
    .classList.toggle("d-none", currentStep !== 2);
  document
    .getElementById("step-3-button")
    .classList.toggle("d-none", currentStep !== 3);
  document
    .getElementById("step-5-button")
    .classList.toggle("d-none", currentStep !== 5);
}

// Move forward
function goToStep(step) {
  if (step === 2) {
    stopWebcam();
    resetCameraUI();
    currentStep = 2;
    updateStepUI();
    if (!consentAccepted) {
      const modal = new bootstrap.Modal(
        document.getElementById("consentModal"),
      );
      modal.show();
    } else {
      startWebcam();
    }
    return;
  }

  if (step === 4) {
    document.getElementById("processingText").textContent =
      ROLE_COPY[selectedRole].processing;
  }

  currentStep = step;
  updateStepUI();
}

// Move backward — resets the step we're returning to so the guest picks again
function goBackTo(step) {
  if (step === 1) {
    // returning to art selection: nothing to clear, just let them re-pick
  }
  if (step === 2) {
    stopWebcam();
    resetCameraUI();
  }
  currentStep = step;
  updateStepUI();

  if (currentStep === 2 && !capturedBlob) {
    startWebcam();
  }
}

function resetCameraUI() {
  capturedBlob = null;
  const video = document.getElementById("webcamPreview");
  const canvas = document.getElementById("capturedCanvas");

  canvas.classList.add("d-none");
  video.classList.remove("d-none");

  document.getElementById("btnCapture").classList.remove("d-none");
  document.getElementById("btnRetake").classList.add("d-none");
  document.getElementById("btnStep2Next").classList.add("d-none");
}

// =========================================================
// CONSENT
// =========================================================
function acceptConsent() {
  consentAccepted = true;
  const modalEl = document.getElementById("consentModal");
  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  if (modal) modal.hide();
  startWebcam();
}

// =========================================================
// CAMERA
// =========================================================
async function startWebcam() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1080 },
        height: { ideal: 1920 },
        facingMode: "user",
      },
      audio: false,
    });

    videoStream = stream;

    const video = document.getElementById("webcamPreview");
    if (video) {
      video.srcObject = stream;
      await video.play();
    }
  } catch (err) {
    alert("ไม่สามารถเข้าถึงกล้องถ่ายรูปได้: " + err.message);
  }
}

function stopWebcam() {
  if (videoStream) {
    videoStream.getTracks().forEach((track) => track.stop());
    videoStream = null;
  }
}

function takeSnapshot() {
  const video = document.getElementById("webcamPreview");
  const canvas = document.getElementById("capturedCanvas");
  const ctx = canvas.getContext("2d");

  const targetWidth = 1080;
  const targetHeight = 1920;

  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const videoWidth = video.videoWidth || 1280;
  const videoHeight = video.videoHeight || 720;

  const targetRatio = targetWidth / targetHeight;
  let sourceWidth = videoHeight * targetRatio;
  let sourceHeight = videoHeight;

  if (sourceWidth > videoWidth) {
    sourceWidth = videoWidth;
    sourceHeight = videoWidth / targetRatio;
  }

  const sourceX = (videoWidth - sourceWidth) / 2;
  const sourceY = (videoHeight - sourceHeight) / 2;

  ctx.save();
  ctx.translate(targetWidth, 0);
  ctx.scale(-1, 1);

  ctx.drawImage(
    video,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    targetWidth,
    targetHeight,
  );

  ctx.restore();

  canvas.toBlob(
    (blob) => {
      capturedBlob = blob;
      video.classList.add("d-none");
      canvas.classList.remove("d-none");

      document.getElementById("btnCapture").classList.add("d-none");
      document.getElementById("btnRetake").classList.remove("d-none");
      document.getElementById("btnStep2Next").classList.remove("d-none");
      stopWebcam();
    },
    "image/jpeg",
    0.95,
  );
}

function retakePhoto() {
  capturedBlob = null;

  const video = document.getElementById("webcamPreview");
  const canvas = document.getElementById("capturedCanvas");

  if (canvas) {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    canvas.classList.add("d-none");
  }

  if (video) {
    video.classList.remove("d-none");
  }

  document.getElementById("btnCapture").classList.remove("d-none");
  document.getElementById("btnRetake").classList.add("d-none");
  document.getElementById("btnStep2Next").classList.add("d-none");

  startWebcam();
}

// =========================================================
// SUBMIT (step 3 -> step 4)
// =========================================================
async function submitFinalForm() {
  if (!capturedBlob) {
    alert("กรุณาถ่ายภาพก่อนเริ่มทำ Face Swap");
    goBackTo(2);
    return;
  }

  const activeSocketId = socketId || socket.id;
  if (!activeSocketId) {
    alert("ระบบกำลังเชื่อมต่อ Server กรุณารอสักครู่แล้วลองใหม่อีกครั้ง");
    return;
  }

  const activeCarouselItem = document.querySelector(
    "#artCarousel .carousel-item.active",
  );
  const selectedRadio = activeCarouselItem
    ? activeCarouselItem.querySelector('input[name="imageOptions"]')
    : null;

  if (!selectedRadio) {
    alert("กรุณาเลือกภาพศิลปะ");
    resetApp();
    return;
  }

  const userRoleElement = document.querySelector(
    'input[name="userRole"]:checked',
  );
  selectedRole = userRoleElement ? userRoleElement.value : "source";

  goToStep(4);

  const selectedArt = selectedRadio.value;
  const currentYear = new Date().getFullYear();
  const rawYear = selectedRadio.getAttribute("data-year");
  const artYear = rawYear ? parseInt(rawYear, 10) : currentYear;

  const formData = new FormData();
  formData.append("photo", capturedBlob, "webcam_user.jpg");
  formData.append("selectedImagePath", selectedArt);
  formData.append("artYear", artYear.toString());
  formData.append("userRole", selectedRole);
  formData.append("socketId", activeSocketId);
  formData.append("consentAccepted", consentAccepted.toString());

  try {
    const response = await fetch("/upload", {
      method: "POST",
      body: formData,
    });

    const result = await response.json();
    if (!result.success) {
      alert("เกิดข้อผิดพลาด: " + result.message);
      resetApp();
    }
  } catch (error) {
    console.error("Upload Error:", error);
    alert("เกิดข้อผิดพลาดในการเชื่อมต่อ Server");
    resetApp();
  }
}

// =========================================================
// FULL RESET (step 5 -> start page)
// =========================================================
function resetApp() {
  capturedBlob = null;
  consentAccepted = false;
  selectedRole = "source";

  const qrcodeContainer = document.getElementById("qrcode");
  if (qrcodeContainer) qrcodeContainer.innerHTML = "";

  resetCameraUI();
  stopWebcam();

  const roleSource = document.getElementById("roleSource");
  if (roleSource) roleSource.checked = true;
  const roleTarget = document.getElementById("roleTarget");
  if (roleTarget) roleTarget.checked = false;

  currentStep = 1;
  updateStepUI();

  document.getElementById("setupPage").classList.add("d-none");
  document.getElementById("startPage").classList.remove("d-none");
}

// =========================================================
// ART CAROUSEL — keep radio selection + dot indicator in sync
// =========================================================
function setupArtCarouselDots() {
  const artCarousel = document.getElementById("artCarousel");
  if (!artCarousel) return;

  const items = artCarousel.querySelectorAll(".carousel-item");
  const dotsContainer = document.getElementById("artDots");

  items.forEach((_, idx) => {
    const dot = document.createElement("span");
    if (idx === 0) dot.classList.add("active");
    dotsContainer.appendChild(dot);
  });

  artCarousel.addEventListener("slid.bs.carousel", (event) => {
    document
      .querySelectorAll('input[name="imageOptions"]')
      .forEach((r) => (r.checked = false));

    const activeItem = event.relatedTarget;
    const radioBtn = activeItem.querySelector('input[type="radio"]');
    if (radioBtn) radioBtn.checked = true;

    const activeIndex = Array.from(items).indexOf(activeItem);
    dotsContainer.querySelectorAll("span").forEach((dot, idx) => {
      dot.classList.toggle("active", idx === activeIndex);
    });
  });
}
