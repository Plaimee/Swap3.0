let currentStep = 1;
let consentAccepted = false;
let capturedBlob = null;
let videoStream = null;
let socketId = null;

const socket = io();

socket.on("connect", () => {
  socketId = socket.id;
  console.log(" Connected to Socket. Server ID:", socketId);
});

function handleResultReady(data) {
  console.log(" Result is ready:", data);
  const processingUI = document.getElementById("processingUI");
  const completedUI = document.getElementById("completedUI");
  const qrcodeContainer = document.getElementById("qrcode");

  if (processingUI && completedUI) {
    processingUI.classList.add("d-none");
    completedUI.classList.remove("d-none");
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
}

socket.on("your_result_ready", handleResultReady);

socket.on("result_updated_global", (data) => {
  if (currentStep === 4) {
    handleResultReady(data);
  }
});

// ดักฟังกรณีการประมวลผลล้มเหลว
socket.on("roop_failed", (data) => {
  console.error(" Processing failed:", data);
  alert("เกิดข้อผิดพลาดในการประมวลผลภาพ: " + (data.error || "Unknown Error"));
  resetApp();
});

// ================= INITIALIZATION =================
document.addEventListener("DOMContentLoaded", () => {
  document
    .getElementById("btnAcceptConsent")
    .addEventListener("click", acceptConsent);
  document.getElementById("btnCapture").addEventListener("click", takeSnapshot);
  document.getElementById("btnRetake").addEventListener("click", retakePhoto);
  document
    .getElementById("btnSubmitForm")
    .addEventListener("click", submitFinalForm);
  document.getElementById("btnResetApp").addEventListener("click", resetApp);

  document
    .getElementById("btnStep1Next")
    .addEventListener("click", () => nextStep(2));
  document
    .getElementById("btnStep2Next")
    .addEventListener("click", () => nextStep(3));
  document
    .getElementById("btnStep2Prev")
    .addEventListener("click", () => prevStep(1));
  document
    .getElementById("btnStep3Prev")
    .addEventListener("click", () => prevStep(2));
});

// ================= STEP NAVIGATION =================
function updateStepUI() {
  document.querySelectorAll(".step-container").forEach((el, idx) => {
    el.classList.toggle("active", idx + 1 === currentStep);
  });

  for (let i = 1; i <= 4; i++) {
    const badge = document.getElementById(`badge-${i}`);
    if (i < currentStep) {
      badge.className = "step-badge completed";
    } else if (i === currentStep) {
      badge.className = "step-badge active";
    } else {
      badge.className = "step-badge";
    }
  }
}

function nextStep(step) {
  if (step === 2 && currentStep === 1) {
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
  currentStep = step;
  updateStepUI();
}

function prevStep(step) {
  if (currentStep === 2 && step === 1) {
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

function acceptConsent() {
  consentAccepted = true;
  const modalEl = document.getElementById("consentModal");
  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  if (modal) modal.hide();
  startWebcam();
}

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

async function submitFinalForm() {
  if (!capturedBlob) {
    alert("กรุณาถ่ายภาพก่อนเริ่มทำ Face Swap");
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

  nextStep(4);

  if (!selectedRadio) {
    alert("กรุณาเลือกภาพศิลปะ");
    resetApp();
    return;
  }

  const selectedArt = selectedRadio.value;
  const currentYear = new Date().getFullYear();
  const rawYear = selectedRadio.getAttribute("data-year");
  const artYear = rawYear ? parseInt(rawYear, 10) : currentYear;

  const userRoleElement = document.querySelector(
    'input[name="userRole"]:checked',
  );
  const userRole = userRoleElement ? userRoleElement.value : "source";

  const formData = new FormData();
  formData.append("photo", capturedBlob, "webcam_user.jpg");
  formData.append("selectedImagePath", selectedArt);
  formData.append("artYear", artYear.toString());
  formData.append("userRole", userRole);
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

function resetApp() {
  capturedBlob = null;

  const qrcodeContainer = document.getElementById("qrcode");
  if (qrcodeContainer) {
    qrcodeContainer.innerHTML = "";
  }

  document.getElementById("processingUI").classList.remove("d-none");
  document.getElementById("completedUI").classList.add("d-none");
  document.getElementById("capturedCanvas").classList.add("d-none");
  document.getElementById("webcamPreview").classList.remove("d-none");
  document.getElementById("btnCapture").classList.remove("d-none");
  document.getElementById("btnRetake").classList.add("d-none");
  document.getElementById("btnStep2Next").classList.add("d-none");

  currentStep = 1;
  updateStepUI();
}

const artCarousel = document.getElementById("artCarousel");
if (artCarousel) {
  artCarousel.addEventListener("slid.bs.carousel", (event) => {
    document
      .querySelectorAll('input[name="imageOptions"]')
      .forEach((r) => (r.checked = false));

    const activeItem = event.relatedTarget;
    const radioBtn = activeItem.querySelector('input[type="radio"]');
    if (radioBtn) {
      radioBtn.checked = true;
    }
  });
}
