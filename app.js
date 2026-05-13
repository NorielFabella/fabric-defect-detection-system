import { ObjectDetector, ImageClassifier, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3";

// ---------------------------
// MODE TRACKING
// ---------------------------
let currentMode = null; // 'camera' or 'upload'

window.addEventListener('modeChanged', (event) => {
    currentMode = event.detail.mode;
    console.log('Mode switched to:', currentMode);
});

// Elements
const videoElement = document.getElementById('video');
const canvasElement = document.getElementById('canvas');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const imageInput = document.getElementById('imageInput');
const uploadArea = document.getElementById('uploadArea');
const imagePreview = document.getElementById('imagePreview');
const uploadResultsCanvas = document.getElementById('uploadResultsCanvas');
const processImageBtn = document.getElementById('processImageBtn');

let mediaStream = null;
let objectDetector = null;
let imageDetector = null;  // For IMAGE mode processing
let imageClassifier = null;

// ---------------------------
// IMAGE UPLOAD HANDLERS
// ---------------------------
uploadArea.addEventListener('click', () => {
    imageInput.click();
});

uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.style.borderColor = '#f59e0b';
    uploadArea.style.background = '#fef3c7';
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.style.borderColor = '#cbd5e1';
    uploadArea.style.background = '#f8fafc';
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.style.borderColor = '#cbd5e1';
    uploadArea.style.background = '#f8fafc';
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleImageUpload(files[0]);
    }
});

imageInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleImageUpload(e.target.files[0]);
    }
});

function handleImageUpload(file) {
    if (!file.type.startsWith('image/')) {
        alert('Please select a valid image file');
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            imagePreview.src = e.target.result;
            imagePreview.classList.add('show');
            processImageBtn.style.display = 'inline-block';
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

processImageBtn.addEventListener('click', () => {
    if (imagePreview.src) {
        processUploadedImage();
    }
});

// ---------------------------
// VOICE SETTINGS
// ---------------------------
let voiceEnabled = false;
let speechUnlocked = false;
let lastSpokenLabel = null;
let lastSpokenTime = 0;
const SPEECH_COOLDOWN_MS = 2000;

// Create voice buttons dynamically (only if controls exist)
const controlsDiv = document.querySelector('.controls');

let voiceOnBtn = null;
let voiceOffBtn = null;

if (controlsDiv) {
    voiceOnBtn = document.createElement('button');
    voiceOnBtn.textContent = 'Voice ON';

    voiceOffBtn = document.createElement('button');
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
}

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

    // Responsive font size based on canvas width
    let fontSize = 14;
    if (canvasElement.width < 400) {
        fontSize = 10;
    } else if (canvasElement.width < 800) {
        fontSize = 12;
    }

    const lineGap = 4;
    const paddingX = 8;
    const paddingY = 6;

    ctx.save();
    ctx.font = `bold ${fontSize}px Arial`;

    const textWidth = Math.max(
        ctx.measureText(fpsText).width,
        ctx.measureText(latencyText).width
    );

    const boxWidth = textWidth + (paddingX * 2);
    const boxHeight = (fontSize * 2) + lineGap + (paddingY * 2);

    const x = Math.max(15, canvasElement.width - boxWidth - 15);
    const y = 15;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
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

        // Video detector for live camera feed
        objectDetector = await ObjectDetector.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: 'detectorv3.tflite',
                delegate: 'GPU'
            },
            runningMode: 'VIDEO',
            maxResults: 5,
            scoreThreshold: 0.3
        });

        // Image detector for uploaded images
        imageDetector = await ObjectDetector.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: 'detectorv3.tflite',
                delegate: 'GPU'
            },
            runningMode: 'IMAGE',
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
    // Set canvas to match the displayed size of the video container
    // This ensures bounding boxes align with the video display
    const rect = canvasElement.parentElement.getBoundingClientRect();
    
    canvasElement.width = rect.width;
    canvasElement.height = rect.height;
    
    console.log(`Canvas initialized: ${canvasElement.width}x${canvasElement.height}`);
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

        // Calculate scale factors to map video coordinates to canvas display coordinates
        const videoWidth = videoElement.videoWidth;
        const videoHeight = videoElement.videoHeight;
        const canvasWidth = canvasElement.width;
        const canvasHeight = canvasElement.height;
        
        const scaleX = canvasWidth / videoWidth;
        const scaleY = canvasHeight / videoHeight;

        if (detections.detections && detections.detections.length > 0) {
            for (const detection of detections.detections) {
                const bbox = detection.boundingBox;
                // Scale coordinates from video stream to canvas display
                const startX = bbox.originX * scaleX;
                const startY = bbox.originY * scaleY;
                const width = bbox.width * scaleX;
                const height = bbox.height * scaleY;

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

                            // Responsive line width and font size based on canvas width
                            let lineWidth = 3;
                            let fontSize = 14;
                            let textHeight = 24;
                            
                            if (canvasElement.width < 400) {
                                lineWidth = 2;
                                fontSize = 10;
                                textHeight = 18;
                            } else if (canvasElement.width < 800) {
                                lineWidth = 2;
                                fontSize = 12;
                                textHeight = 20;
                            }

                            ctx.strokeStyle = boxColor;
                            ctx.lineWidth = lineWidth;
                            ctx.strokeRect(startX, startY, width, height);

                            const labelText = `${label} (${(confidence * 100).toFixed(1)}%)`;
                            ctx.font = `bold ${fontSize}px Arial`;

                            const textWidth = ctx.measureText(labelText).width;
                            const textBoxHeight = textHeight;
                            const textBoxPadding = 6;

                            ctx.fillStyle = boxColor;
                            ctx.fillRect(startX, startY - textBoxHeight - 4, textWidth + textBoxPadding * 2, textBoxHeight);

                            ctx.fillStyle = '#000000';
                            ctx.fillText(labelText, startX + textBoxPadding, startY - 8);
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
// IMAGE UPLOAD PROCESSING
// ---------------------------
async function processUploadedImage() {
    try {
        const img = new Image();
        img.onload = async () => {
            // Prepare canvas for results
            uploadResultsCanvas.width = img.width;
            uploadResultsCanvas.height = img.height;
            
            const ctxUpload = uploadResultsCanvas.getContext('2d');
            ctxUpload.drawImage(img, 0, 0);

            // Run detection on the image using IMAGE mode detector
            const detections = await imageDetector.detect(img);

            let defectsFound = [];

            if (detections.detections && detections.detections.length > 0) {
                for (const detection of detections.detections) {
                    const bbox = detection.boundingBox;
                    const startX = bbox.originX;
                    const startY = bbox.originY;
                    const width = bbox.width;
                    const height = bbox.height;

                    // Create offscreen canvas for crop
                    const offscreenCanvas = document.createElement('canvas');
                    const offscreenCtx = offscreenCanvas.getContext('2d');
                    
                    offscreenCanvas.width = Math.max(1, Math.floor(width));
                    offscreenCanvas.height = Math.max(1, Math.floor(height));

                    offscreenCtx.drawImage(
                        img,
                        startX,
                        startY,
                        width,
                        height,
                        0,
                        0,
                        offscreenCanvas.width,
                        offscreenCanvas.height
                    );

                    // Classify the cropped region
                    const classification = await imageClassifier.classify(offscreenCanvas);

                    if (classification.classifications && classification.classifications.length > 0) {
                        const categories = classification.classifications[0].categories;

                        if (categories.length > 0) {
                            const topCategory = categories[0];
                            const label = topCategory.categoryName;
                            const confidence = topCategory.score;

                            const normalized = label.toLowerCase().replace(/\s+/g, '_');

                            if (normalized !== 'defect_free') {
                                defectsFound.push({
                                    label,
                                    confidence,
                                    bbox: { startX, startY, width, height }
                                });

                                // Draw bounding box
                                let boxColor = '#ff0000';
                                if (confidence >= 0.8) {
                                    boxColor = '#00ff00';
                                } else if (confidence >= 0.5) {
                                    boxColor = '#ffa500';
                                }

                                ctxUpload.strokeStyle = boxColor;
                                ctxUpload.lineWidth = 3;
                                ctxUpload.strokeRect(startX, startY, width, height);

                                // Draw label
                                const labelText = `${label} (${(confidence * 100).toFixed(1)}%)`;
                                ctxUpload.font = 'bold 16px Arial';

                                const textWidth = ctxUpload.measureText(labelText).width;
                                ctxUpload.fillStyle = boxColor;
                                ctxUpload.fillRect(startX, startY - 30, textWidth + 10, 28);

                                ctxUpload.fillStyle = '#000000';
                                ctxUpload.fillText(labelText, startX + 5, startY - 10);
                            }
                        }
                    }
                }
            } else {
                // No defects detected
                ctxUpload.font = 'bold 24px Arial';
                ctxUpload.fillStyle = '#00ff00';
                ctxUpload.fillText('No defects detected', 20, 40);
            }

            uploadResultsCanvas.classList.add('show');

            // Announce results with voice
            if (defectsFound.length > 0) {
                const defectTypes = defectsFound.map(d => d.label).join(', ');
                speakDefect(defectTypes);
            }
        };
        img.src = imagePreview.src;
    } catch (error) {
        console.error('Image processing error:', error);
        alert('Error processing image. Check console for details.');
    }
}
startBtn.addEventListener('click', startCamera);
stopBtn.addEventListener('click', stopCamera);
stopBtn.disabled = true;

// ---------------------------
// INIT
// ---------------------------
initializeMediaPipe();