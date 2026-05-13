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

// Voice button events
voiceOnBtn.addEventListener('click', () => {
    voiceEnabled = true;

    // Unlock speech with a user gesture
    try {
        window.speechSynthesis.cancel();

        const unlockUtterance = new SpeechSynthesisUtterance("Voice alerts enabled");
        unlockUtterance.volume = 1.0;
        unlockUtterance.rate = 1.0;
        unlockUtterance.pitch = 1.0;

        window.speechSynthesis.speak(unlockUtterance);
        speechUnlocked = true;
    } catch (error) {
        console.error("Speech unlock failed:", error);
    }

    console.log("Voice enabled");
});

voiceOffBtn.addEventListener('click', () => {
    voiceEnabled = false;
    speechUnlocked = false;
    window.speechSynthesis.cancel();
    console.log("Voice disabled");
});

// Speak detected defect name, with cooldown
function speakDefect(label) {
    if (!voiceEnabled || !speechUnlocked) return;
    if (!label) return;

    const normalized = label.toLowerCase().replace(/\s+/g, '_');

    // Skip defect_free
    if (normalized === 'defect_free') return;

    const now = Date.now();

    // Prevent repeating the same label too quickly
    if (normalized === lastSpokenLabel && (now - lastSpokenTime) < SPEECH_COOLDOWN_MS) {
        return;
    }

    window.speechSynthesis.cancel();

    const cleanLabel = label
        .replace(/_/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());

    const utterance = new SpeechSynthesisUtterance(`${cleanLabel} detected`);
    utterance.volume = 1.0;
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    window.speechSynthesis.speak(utterance);

    lastSpokenLabel = normalized;
    lastSpokenTime = now;
}

// ---------------------------
// PERFORMANCE METRICS
// ---------------------------
let frameCount = 0;
let fps = 0;
let fpsWindowStart = performance.now();
let avgLatencyMs = 0;
const LATENCY_SMOOTHING = 0.15;

function updatePerformanceMetrics(frameStart) {
    const frameEnd = performance.now();
    const latencyMs = frameEnd - frameStart;

    if (avgLatencyMs === 0) {
        avgLatencyMs = latencyMs;
    } else {
        avgLatencyMs =
            (avgLatencyMs * (1 - LATENCY_SMOOTHING)) +
            (latencyMs * LATENCY_SMOOTHING);
    }

    frameCount += 1;

    const elapsed = frameEnd - fpsWindowStart;
    if (elapsed >= 1000) {
        fps = (frameCount * 1000) / elapsed;
        frameCount = 0;
        fpsWindowStart = frameEnd;
    }
}

function drawPerformanceMetrics() {
    const fpsText = `FPS: ${fps.toFixed(1)}`;
    const latencyText = `Latency: ${avgLatencyMs.toFixed(1)} ms`;

    const fontSize = 16;
    const lineGap = 6;
    const paddingX = 10;
    const paddingY = 8;

    ctx.save();
    ctx.font = `bold ${fontSize}px Arial`;

    const textWidth = Math.max(
        ctx.measureText(fpsText).width,
        ctx.measureText(latencyText).width
    );

    const boxWidth = textWidth + (paddingX * 2);
    const boxHeight = (fontSize * 2) + lineGap + (paddingY * 2);

    const x = Math.max(20, canvasElement.width - boxWidth - 20);
    const y = 20;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(x, y, boxWidth, boxHeight);

    ctx.fillStyle = '#00ffea';
    ctx.fillText(fpsText, x + paddingX, y + paddingY + fontSize);
    ctx.fillText(latencyText, x + paddingX, y + paddingY + (fontSize * 2) + lineGap);

    ctx.restore();
}

function resetPerformanceMetrics() {
    frameCount = 0;
    fps = 0;
    fpsWindowStart = performance.now();
    avgLatencyMs = 0;
}

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
        alert('Failed to load AI models. Open the console for details.');
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
            resetPerformanceMetrics();
            startProcessing();
        };

        window.addEventListener('resize', initializeCanvas);
        startBtn.disabled = true;
        stopBtn.disabled = false;

        console.log("Camera started");
    } catch (error) {
        console.error("Camera error:", error);
        alert("Unable to access camera.");
        startBtn.disabled = false;
        stopBtn.disabled = true;
    }
}

function stopCamera() {
    stopProcessing();

    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        videoElement.srcObject = null;
        mediaStream = null;
    }

    window.speechSynthesis.cancel();
    resetPerformanceMetrics();

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
    const frameStart = performance.now();

    ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);

    if (videoElement.readyState !== videoElement.HAVE_ENOUGH_DATA) {
        updatePerformanceMetrics(frameStart);
        drawPerformanceMetrics();
        animationFrameId = requestAnimationFrame(processVideoFrame);
        return;
    }

    try {
        const detections = objectDetector.detectForVideo(videoElement, timestamp);

        let bestLabel = null;
        let bestConfidence = 0;

        if (detections.detections && detections.detections.length > 0) {
            for (const detection of detections.detections) {
                const bbox = detection.boundingBox;
                const startX = bbox.originX;
                const startY = bbox.originY;
                const width = bbox.width;
                const height = bbox.height;

                offscreenCanvas.width = Math.max(1, Math.floor(width));
                offscreenCanvas.height = Math.max(1, Math.floor(height));

                offscreenCtx.drawImage(
                    videoElement,
                    startX,
                    startY,
                    width,
                    height,
                    0,
                    0,
                    offscreenCanvas.width,
                    offscreenCanvas.height
                );

                const classification = imageClassifier.classify(offscreenCanvas);

                if (classification.classifications && classification.classifications.length > 0) {
                    const categories = classification.classifications[0].categories;

                    if (categories.length > 0) {
                        const topCategory = categories[0];
                        const label = topCategory.categoryName;
                        const confidence = topCategory.score;

                        const normalized = label.toLowerCase().replace(/\s+/g, '_');

                        if (normalized !== 'defect_free') {
                            if (confidence > bestConfidence) {
                                bestConfidence = confidence;
                                bestLabel = label;
                            }

                            let boxColor = '#ff0000';
                            if (confidence >= 0.8) {
                                boxColor = '#00ff00';
                            } else if (confidence >= 0.5) {
                                boxColor = '#ffa500';
                            }

                            ctx.strokeStyle = boxColor;
                            ctx.lineWidth = 3;
                            ctx.strokeRect(startX, startY, width, height);

                            const labelText = `${label} (${(confidence * 100).toFixed(1)}%)`;
                            ctx.font = 'bold 16px Arial';

                            const textWidth = ctx.measureText(labelText).width;

                            ctx.fillStyle = boxColor;
                            ctx.fillRect(startX, startY - 30, textWidth + 10, 28);

                            ctx.fillStyle = '#000000';
                            ctx.fillText(labelText, startX + 5, startY - 10);
                        }
                    }
                }
            }

            // Speak the strongest defect only
            if (bestLabel && bestConfidence >= 0.5) {
                speakDefect(bestLabel);
            }
        } else {
            ctx.font = 'bold 24px Arial';
            ctx.fillStyle = '#00ff00';
            ctx.fillText('No defects detected', 20, 40);
        }
    } catch (error) {
        console.error('Frame processing error:', error);
    }

    updatePerformanceMetrics(frameStart);
    drawPerformanceMetrics();

    animationFrameId = requestAnimationFrame(processVideoFrame);
}

// ---------------------------
// START/STOP PROCESSING
// ---------------------------
function startProcessing() {
    if (!animationFrameId) {
        animationFrameId = requestAnimationFrame(processVideoFrame);
    }
}

function stopProcessing() {
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }

    ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    window.speechSynthesis.cancel();
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