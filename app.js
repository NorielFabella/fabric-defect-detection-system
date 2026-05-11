import { ObjectDetector, ImageClassifier, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3";

// Elements
const videoElement = document.getElementById('video');
const canvasElement = document.getElementById('canvas');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');

let mediaStream = null;
let objectDetector = null;
let imageClassifier = null;

// Voice output state
let lastSpokenLabel = null;
let lastSpokenTime = 0;
const SPEECH_COOLDOWN_MS = 2000;

// Initialize MediaPipe Vision Tasks
async function initializeMediaPipe() {
    try {
        const vision = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
        );

        // Create ObjectDetector
        objectDetector = await ObjectDetector.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: 'detectorv4.tflite',
                delegate: 'GPU'
            },
            runningMode: 'VIDEO',
            maxResults: 5,
            scoreThreshold: 0.3
        });

        // Create ImageClassifier
        imageClassifier = await ImageClassifier.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: 'classifierv5.tflite',
                delegate: 'GPU'
            },
            runningMode: 'IMAGE',
            maxResults: 3,
            scoreThreshold: 0.3
        });

        console.log('MediaPipe models loaded successfully!');
    } catch (error) {
        console.error('Error initializing MediaPipe models:', error);
        alert('Failed to load AI models. Open the console (F12) for details.');
    }
}

// Initialize canvas size to match the camera's true resolution
function initializeCanvas() {
    canvasElement.width = videoElement.videoWidth;
    canvasElement.height = videoElement.videoHeight;
}

// Speak detected defect name, but do not spam repeated speech
function speakDefect(label) {
    const now = Date.now();

    if (!label) return;

    const normalized = label.toLowerCase().replace(/\s+/g, '_');

    // Do not speak defect_free
    if (normalized === 'defect_free') return;

    // Prevent repeated speech for the same label too quickly
    if (normalized === lastSpokenLabel && (now - lastSpokenTime) < SPEECH_COOLDOWN_MS) {
        return;
    }

    // Cancel any ongoing speech so announcements do not overlap
    window.speechSynthesis.cancel();

    const cleanLabel = label.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const utterance = new SpeechSynthesisUtterance(`${cleanLabel} detected`);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    window.speechSynthesis.speak(utterance);

    lastSpokenLabel = normalized;
    lastSpokenTime = now;
}

// Request camera access with rear-facing preference
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

        window.addEventListener('resize', initializeCanvas);
        startBtn.disabled = true;
        stopBtn.disabled = false;

        console.log('Camera started successfully');
    } catch (error) {
        console.error('Error accessing camera:', error);
        alert('Unable to access camera. Please check permissions and try again.');
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

    startBtn.disabled = false;
    stopBtn.disabled = true;
    console.log('Camera stopped');
}

const ctx = canvasElement.getContext('2d');
const offscreenCanvas = document.createElement('canvas');
const offscreenCtx = offscreenCanvas.getContext('2d');

let animationFrameId = null;

// Main processing loop
function processVideoFrame(timestamp) {
    ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);

    if (videoElement.readyState !== videoElement.HAVE_ENOUGH_DATA) {
        animationFrameId = requestAnimationFrame(processVideoFrame);
        return;
    }

    try {
        const detections = objectDetector.detectForVideo(videoElement, timestamp);
        let bestSpokenLabel = null;
        let bestSpokenConfidence = 0;

        if (detections.detections && detections.detections.length > 0) {
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
                    startX, startY, width, height,
                    0, 0, width, height
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
                            // Keep the strongest defect for voice output this frame
                            if (confidence > bestSpokenConfidence) {
                                bestSpokenConfidence = confidence;
                                bestSpokenLabel = label;
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
                            const fontSize = 14;
                            ctx.font = `bold ${fontSize}px Arial`;
                            const textWidth = ctx.measureText(labelText).width;
                            const textHeight = fontSize + 4;

                            ctx.fillStyle = boxColor;
                            ctx.fillRect(
                                startX,
                                startY - textHeight - 5,
                                textWidth + 8,
                                textHeight + 4
                            );

                            ctx.fillStyle = '#000000';
                            ctx.fillText(labelText, startX + 4, startY - 8);
                        }
                    }
                }
            }

            // Speak once per frame, not once per box
            if (bestSpokenLabel && bestSpokenConfidence >= 0.5) {
                speakDefect(bestSpokenLabel);
            }
        } else {
            const text = "No defects detected";
            ctx.font = "bold 24px Arial";
            ctx.fillStyle = "#00ff00";

            ctx.shadowColor = "black";
            ctx.shadowBlur = 4;
            ctx.shadowOffsetX = 2;
            ctx.shadowOffsetY = 2;

            const textWidth = ctx.measureText(text).width;
            ctx.fillText(text, (canvasElement.width / 2) - (textWidth / 2), 40);

            ctx.shadowColor = "transparent";
        }
    } catch (error) {
        console.error('Error processing frame:', error);
    }

    animationFrameId = requestAnimationFrame(processVideoFrame);
}

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

    // Stop any ongoing speech when camera stops
    window.speechSynthesis.cancel();
    lastSpokenLabel = null;
    lastSpokenTime = 0;
}

startBtn.addEventListener('click', startCamera);
stopBtn.addEventListener('click', stopCamera);
stopBtn.disabled = true;

// Initialize automatically
initializeMediaPipe();