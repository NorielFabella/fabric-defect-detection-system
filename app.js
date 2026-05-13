import { ObjectDetector, ImageClassifier, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3";

// Elements
const videoElement = document.getElementById('video');
const canvasElement = document.getElementById('canvas');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');

let mediaStream = null;
let objectDetector = null;
let imageClassifier = null;

// ---------------------------
// VOICE SETTINGS
// ---------------------------

let voiceEnabled = false;
let speechUnlocked = false;

let lastSpokenLabel = null;
let lastSpokenTime = 0;

const SPEECH_COOLDOWN_MS = 2000;

// Create voice buttons dynamically
const controlsDiv = document.querySelector('.controls');

const voiceOnBtn = document.createElement('button');
voiceOnBtn.textContent = 'Voice ON';

const voiceOffBtn = document.createElement('button');
voiceOffBtn.textContent = 'Voice OFF';

controlsDiv.appendChild(voiceOnBtn);
controlsDiv.appendChild(voiceOffBtn);

// ---------------------------
// ENABLE VOICE
// ---------------------------

voiceOnBtn.addEventListener('click', () => {

    voiceEnabled = true;

    // IMPORTANT:
    // Mobile browsers require speech
    // to be triggered directly by user interaction
    const unlockUtterance = new SpeechSynthesisUtterance("Voice alerts enabled");

    unlockUtterance.volume = 1.0;
    unlockUtterance.rate = 1.0;
    unlockUtterance.pitch = 1.0;

    speechSynthesis.speak(unlockUtterance);

    speechUnlocked = true;

    console.log("Voice enabled");
});

voiceOffBtn.addEventListener('click', () => {

    voiceEnabled = false;

    speechSynthesis.cancel();

    console.log("Voice disabled");
});

// ---------------------------
// SPEAK FUNCTION
// ---------------------------

function speakDefect(label) {

    if (!voiceEnabled || !speechUnlocked) return;

    if (!label) return;

    const normalized = label.toLowerCase().replace(/\s+/g, '_');

    // Skip defect_free
    if (normalized === 'defect_free') return;

    const now = Date.now();

    // Prevent repeating same label too fast
    if (
        normalized === lastSpokenLabel &&
        (now - lastSpokenTime) < SPEECH_COOLDOWN_MS
    ) {
        return;
    }

    speechSynthesis.cancel();

    const cleanLabel = label
        .replace(/_/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());

    const utterance = new SpeechSynthesisUtterance(
        `${cleanLabel} detected`
    );

    utterance.volume = 1.0;
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    speechSynthesis.speak(utterance);

    lastSpokenLabel = normalized;
    lastSpokenTime = now;
}

// ---------------------------
// UI ROUTING & NAVIGATION
// ---------------------------

const viewLanding = document.getElementById('view-landing');
const viewLive = document.getElementById('view-live');
const viewUpload = document.getElementById('view-upload');

const navLiveBtn = document.getElementById('nav-live-btn');
const navUploadBtn = document.getElementById('nav-upload-btn');
const backLiveBtn = document.getElementById('back-live-btn');
const backUploadBtn = document.getElementById('back-upload-btn');

// Navigate to Live Camera
navLiveBtn.addEventListener('click', () => {
    viewLanding.classList.add('hidden');
    viewLive.classList.remove('hidden');
});

// Navigate to Image Upload
navUploadBtn.addEventListener('click', () => {
    viewLanding.classList.add('hidden');
    viewUpload.classList.remove('hidden');
});

// Go back from Live Camera
backLiveBtn.addEventListener('click', () => {
    // Ensure camera turns off when leaving the page
    if (!stopBtn.disabled) {
        stopCamera();
    }
    viewLive.classList.add('hidden');
    viewLanding.classList.remove('hidden');
});

// Go back from Image Upload
backUploadBtn.addEventListener('click', () => {
    viewUpload.classList.add('hidden');
    viewLanding.classList.remove('hidden');
});

// ---------------------------
// INITIALIZE MEDIAPIPE
// ---------------------------

async function initializeMediaPipe() {

    try {

        const vision = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
        );

        objectDetector = await ObjectDetector.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: 'detectorv3.tflite',
                delegate: 'GPU'
            },
            runningMode: 'VIDEO',
            maxResults: 5,
            scoreThreshold: 0.3
        });

        imageClassifier = await ImageClassifier.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: 'classifierv5.tflite',
                delegate: 'GPU'
            },
            runningMode: 'IMAGE',
            maxResults: 3,
            scoreThreshold: 0.3
        });

        console.log('Models loaded successfully');

    } catch (error) {

        console.error('Model loading error:', error);

        alert('Failed to load AI models.');

    }
}

// ---------------------------
// CAMERA
// ---------------------------

async function startCamera() {

    try {

        const constraints = {
            video: {
                facingMode: { ideal: 'environment' },
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: false
        };

        mediaStream = await navigator.mediaDevices.getUserMedia(constraints);

        videoElement.srcObject = mediaStream;

        videoElement.onloadedmetadata = () => {

            videoElement.play();

            initializeCanvas();

            startProcessing();
        };

        startBtn.disabled = true;
        stopBtn.disabled = false;

        console.log("Camera started");

    } catch (error) {

        console.error("Camera error:", error);

        alert("Unable to access camera.");
    }
}

function stopCamera() {

    stopProcessing();

    if (mediaStream) {

        mediaStream.getTracks().forEach(track => track.stop());

        videoElement.srcObject = null;

        mediaStream = null;
    }

    speechSynthesis.cancel();

    startBtn.disabled = false;
    stopBtn.disabled = true;

    console.log("Camera stopped");
}

// ---------------------------
// CANVAS
// ---------------------------

function initializeCanvas() {

    canvasElement.width = videoElement.videoWidth;
    canvasElement.height = videoElement.videoHeight;
}

const ctx = canvasElement.getContext('2d');

const offscreenCanvas = document.createElement('canvas');

const offscreenCtx = offscreenCanvas.getContext('2d');

let animationFrameId = null;

// ---------------------------
// MAIN PROCESSING LOOP
// ---------------------------

function processVideoFrame(timestamp) {

    ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);

    if (videoElement.readyState !== videoElement.HAVE_ENOUGH_DATA) {

        animationFrameId = requestAnimationFrame(processVideoFrame);

        return;
    }

    try {

        const detections = objectDetector.detectForVideo(
            videoElement,
            timestamp
        );

        let bestLabel = null;
        let bestConfidence = 0;

        if (
            detections.detections &&
            detections.detections.length > 0
        ) {

            for (const detection of detections.detections) {

                const bbox = detection.boundingBox;

                const startX = bbox.originX;
                const startY = bbox.originY;
                const width = bbox.width;
                const height = bbox.height;

                offscreenCanvas.width = width;
                offscreenCanvas.height = height;

                offscreenCtx.drawImage(
                    videoElement,
                    startX,
                    startY,
                    width,
                    height,
                    0,
                    0,
                    width,
                    height
                );

                const classification = imageClassifier.classify(
                    offscreenCanvas
                );

                if (
                    classification.classifications &&
                    classification.classifications.length > 0
                ) {

                    const categories =
                        classification.classifications[0].categories;

                    if (categories.length > 0) {

                        const topCategory = categories[0];

                        const label = topCategory.categoryName;

                        const confidence = topCategory.score;

                        const normalized =
                            label.toLowerCase().replace(/\s+/g, '_');

                        if (normalized !== 'defect_free') {

                            // Voice candidate
                            if (confidence > bestConfidence) {

                                bestConfidence = confidence;

                                bestLabel = label;
                            }

                            // Box color
                            let boxColor = '#ff0000';

                            if (confidence >= 0.8) {

                                boxColor = '#00ff00';

                            } else if (confidence >= 0.5) {

                                boxColor = '#ffa500';
                            }

                            // Draw box
                            ctx.strokeStyle = boxColor;
                            ctx.lineWidth = 3;

                            ctx.strokeRect(
                                startX,
                                startY,
                                width,
                                height
                            );

                            // Label text
                            const labelText =
                                `${label} (${(confidence * 100).toFixed(1)}%)`;

                            ctx.font = 'bold 16px Arial';

                            const textWidth =
                                ctx.measureText(labelText).width;

                            ctx.fillStyle = boxColor;

                            ctx.fillRect(
                                startX,
                                startY - 30,
                                textWidth + 10,
                                28
                            );

                            ctx.fillStyle = '#000000';

                            ctx.fillText(
                                labelText,
                                startX + 5,
                                startY - 10
                            );
                        }
                    }
                }
            }

            // Speak strongest defect only
            if (
                bestLabel &&
                bestConfidence >= 0.5
            ) {

                speakDefect(bestLabel);
            }

        } else {

            ctx.font = 'bold 24px Arial';

            ctx.fillStyle = '#00ff00';

            ctx.fillText(
                'No defects detected',
                20,
                40
            );
        }

    } catch (error) {

        console.error('Frame processing error:', error);
    }

    animationFrameId = requestAnimationFrame(processVideoFrame);
}

// ---------------------------
// START/STOP PROCESSING
// ---------------------------

function startProcessing() {

    if (!animationFrameId) {

        animationFrameId =
            requestAnimationFrame(processVideoFrame);
    }
}

function stopProcessing() {

    if (animationFrameId) {

        cancelAnimationFrame(animationFrameId);

        animationFrameId = null;
    }

    ctx.clearRect(
        0,
        0,
        canvasElement.width,
        canvasElement.height
    );
}

// ---------------------------
// BUTTON EVENTS
// ---------------------------

startBtn.addEventListener('click', startCamera);

stopBtn.addEventListener('click', stopCamera);

stopBtn.disabled = true;

// ---------------------------
// INIT
// ---------------------------

initializeMediaPipe();